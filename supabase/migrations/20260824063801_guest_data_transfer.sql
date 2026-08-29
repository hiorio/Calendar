-- =============================================================================
-- 게스트 데이터 이관
--
-- 기존 계정으로 로그인하면 GoTrue 세션의 user.id가 바뀐다. 게스트가 만든 데이터는
-- 지워지지 않지만 예전 user.id에 남아 있어 새 계정에서 보이지 않는다. 로그인 전에
-- 게스트가 짧게 유효한 일회용 권한을 만들고, 로그인 뒤 정식 계정이 그 권한을 청구해
-- 데이터를 합친다.
--
-- 토큰 원문은 DB에만 있고 클라이언트에는 UUID 하나만 잠시 저장한다. 토큰만으로
-- 데이터를 읽을 수는 없으며, 정식 계정으로 인증한 뒤에만 이관할 수 있다.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.guest_data_transfers (
  token         uuid primary key default gen_random_uuid(),
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  -- 대상 계정을 지우면 완료된 이관 영수증도 함께 지운다. SET NULL이면 아래
  -- claimed_at/claimed_by 일관성 제약 때문에 계정 삭제가 막힌다.
  claimed_by    uuid references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '15 minutes'),
  claimed_at    timestamptz,

  constraint guest_data_transfers_expiry check (expires_at > created_at),
  constraint guest_data_transfers_claim check (
    (claimed_at is null) or (claimed_by is not null)
  )
);

create index idx_guest_data_transfers_guest
  on private.guest_data_transfers (guest_user_id, expires_at desc);

alter table private.guest_data_transfers enable row level security;
revoke all on private.guest_data_transfers from public, anon, authenticated;
grant all privileges on private.guest_data_transfers to service_role;

-- ---------------------------------------------------------------------------
-- 이관 중에만 새 계정이 게스트 소유권을 넘겨받을 수 있게 한다.
--
-- claimed_by는 claim_guest_data_transfer의 트랜잭션 안에서만 잠깐 채워지고, 성공할
-- 때 같은 트랜잭션에서 claimed_at도 채워진다. 다른 트랜잭션에는 이 중간 상태가
-- 보이지 않으므로 일반 사용자가 소유권 변경 권한으로 악용할 수 없다.
-- ---------------------------------------------------------------------------
create or replace function public.guard_calendar_owner_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  if new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  if auth.uid() is not null
     and auth.uid() <> old.owner_id
     and not exists (
       select 1
         from private.guest_data_transfers t
        where t.guest_user_id = old.owner_id
          and t.claimed_by = auth.uid()
          and t.claimed_at is null
          and t.expires_at > now()
     ) then
    raise exception '소유권 이전은 현재 소유자만 할 수 있습니다'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.calendar_members
    where calendar_id = new.id and user_id = new.owner_id
  ) then
    raise exception '새 소유자는 이 캘린더의 구성원이어야 합니다'
      using errcode = '23514';
  end if;

  update public.calendar_members
     set role = 'MEMBER'
   where calendar_id = new.id and user_id = old.owner_id;

  update public.calendar_members
     set role = 'OWNER'
   where calendar_id = new.id and user_id = new.owner_id;

  return new;
end;
$$;

create or replace function public.guard_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  current_owner uuid;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- service_role로 도는 서버 로직은 자체 검증한다.
  if auth.uid() is null then
    return new;
  end if;

  select c.owner_id into current_owner
    from public.calendars c
   where c.id = new.calendar_id;

  if current_owner = auth.uid() then
    return new;
  end if;

  if exists (
    select 1
      from private.guest_data_transfers t
     where t.guest_user_id = current_owner
       and t.claimed_by = auth.uid()
       and t.claimed_at is null
       and t.expires_at > now()
  ) then
    return new;
  end if;

  raise exception '역할 변경은 캘린더 소유자만 할 수 있습니다'
    using errcode = '42501';
end;
$$;

-- 게스트 멤버십을 새 계정으로 합칠 때는 실제 탈퇴/강퇴가 아니다. 활동 내역에
-- 가짜 "구성원이 나갔습니다"를 남기지 않는다.
create or replace function public.on_member_leave_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  who text;
begin
  if exists (
    select 1
      from private.guest_data_transfers t
     where t.guest_user_id = old.user_id
       and t.claimed_by = auth.uid()
       and t.claimed_at is null
       and t.expires_at > now()
  ) then
    return old;
  end if;

  if not exists (select 1 from public.calendars where id = old.calendar_id) then
    return old;
  end if;

  select nickname into who from public.profiles where id = old.user_id;

  insert into public.activity_logs (calendar_id, actor_id, type, ref_id, summary)
  values (
    old.calendar_id,
    coalesce(auth.uid(), old.user_id),
    'MEMBER_LEFT',
    old.user_id,
    jsonb_build_object(
      'nickname', coalesce(who, '알 수 없는 사용자'),
      'kicked', auth.uid() is not null and auth.uid() <> old.user_id
    )
  );

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 실제 합치기. 공개 API가 아니라 claim_guest_data_transfer만 호출한다.
-- service_role 관리 작업에서도 동일한 트랜잭션 로직을 재사용할 수 있다.
-- ---------------------------------------------------------------------------
create or replace function private.transfer_guest_data(
  p_guest_user_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage, pg_temp
as $$
declare
  source_is_anonymous boolean;
  target_is_anonymous boolean;
  calendar_count int;
  event_count int;
begin
  if p_guest_user_id is null
     or p_target_user_id is null
     or p_guest_user_id = p_target_user_id then
    raise exception '이관할 계정을 확인할 수 없습니다' using errcode = '22023';
  end if;

  -- 같은 게스트에 대한 이관이 동시에 실행되지 않게 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(p_guest_user_id::text, 0));

  select u.is_anonymous into source_is_anonymous
    from auth.users u where u.id = p_guest_user_id;
  select u.is_anonymous into target_is_anonymous
    from auth.users u where u.id = p_target_user_id;

  if source_is_anonymous is distinct from true then
    raise exception '이관 원본은 게스트 계정이어야 합니다' using errcode = '42501';
  end if;
  if target_is_anonymous is distinct from false then
    raise exception '정식 계정으로 로그인한 뒤 가져올 수 있습니다' using errcode = '42501';
  end if;

  select count(*) into calendar_count
    from (
      select c.id from public.calendars c where c.owner_id = p_guest_user_id
      union
      select m.calendar_id from public.calendar_members m where m.user_id = p_guest_user_id
    ) owned_or_joined;

  select count(*) into event_count
    from public.events e where e.created_by = p_guest_user_id;

  -- 소유하거나 참여한 모든 캘린더에 새 계정을 먼저 넣는다. 이미 같은 캘린더에
  -- 참여 중이면 새 계정의 색·음소거 설정을 보존한다.
  insert into public.calendar_members (
    calendar_id, user_id, role, color, muted, joined_at
  )
  select source.calendar_id,
         p_target_user_id,
         'MEMBER'::public.member_role,
         source.color,
         source.muted,
         source.joined_at
    from (
      select c.id as calendar_id,
             m.color,
             coalesce(m.muted, false) as muted,
             coalesce(m.joined_at, c.created_at) as joined_at
        from public.calendars c
        left join public.calendar_members m
          on m.calendar_id = c.id and m.user_id = p_guest_user_id
       where c.owner_id = p_guest_user_id or m.user_id is not null
    ) source
  on conflict (calendar_id, user_id) do nothing;

  -- 트리거가 기존 게스트를 MEMBER로, 새 계정을 OWNER로 맞춘다.
  update public.calendars
     set owner_id = p_target_user_id
   where owner_id = p_guest_user_id;

  -- 작성자 흔적도 같은 사람의 정식 계정으로 이어 준다.
  update public.events
     set created_by = p_target_user_id
   where created_by = p_guest_user_id;

  update public.event_comments
     set user_id = p_target_user_id
   where user_id = p_guest_user_id;

  update public.calendar_invites
     set created_by = p_target_user_id
   where created_by = p_guest_user_id;

  update public.memos
     set created_by = p_target_user_id
   where created_by = p_guest_user_id;

  update public.attachments
     set uploaded_by = p_target_user_id
   where uploaded_by = p_guest_user_id;

  update public.calendar_stickers
     set created_by = p_target_user_id
   where created_by = p_guest_user_id;

  update public.activity_logs
     set actor_id = p_target_user_id
   where actor_id = p_guest_user_id;

  -- 사용자 id가 복합키에 들어가는 데이터는 충돌을 피하며 합친다.
  insert into public.event_participants (event_id, user_id)
  select p.event_id, p_target_user_id
    from public.event_participants p
   where p.user_id = p_guest_user_id
  on conflict (event_id, user_id) do nothing;
  delete from public.event_participants where user_id = p_guest_user_id;

  insert into public.event_reminders (event_id, user_id, minutes_before, created_at)
  select r.event_id, p_target_user_id, r.minutes_before, r.created_at
    from public.event_reminders r
   where r.user_id = p_guest_user_id
  on conflict on constraint event_reminders_unique do nothing;
  delete from public.event_reminders where user_id = p_guest_user_id;

  insert into public.comment_reactions (comment_id, user_id, emoji, created_at)
  select r.comment_id, p_target_user_id, r.emoji, r.created_at
    from public.comment_reactions r
   where r.user_id = p_guest_user_id
  on conflict (comment_id, user_id, emoji) do nothing;
  delete from public.comment_reactions where user_id = p_guest_user_id;

  -- 첨부 메타데이터뿐 아니라 Storage 업로더도 바꿔야 공유 캘린더에서 본인이 올린
  -- 파일을 이후에도 수정·삭제할 수 있다. 아바타는 새 계정의 것을 유지한다.
  update storage.objects
     set owner_id = p_target_user_id::text
   where bucket_id = 'calendar-media'
     and owner_id = p_guest_user_id::text;

  -- 새 멤버십이 준비된 뒤 예전 멤버십을 제거한다. 위 활동 트리거가 이관 중에는
  -- 가짜 탈퇴 기록을 생략한다.
  delete from public.calendar_members where user_id = p_guest_user_id;

  -- 푸시 토큰은 계정 간에 넘기지 않는다. 로그인 후 새 계정으로 다시 등록한다.
  delete from public.device_tokens where user_id = p_guest_user_id;

  return jsonb_build_object(
    'calendar_count', calendar_count,
    'event_count', event_count
  );
end;
$$;

revoke all on function private.transfer_guest_data(uuid, uuid) from public, anon, authenticated;
grant execute on function private.transfer_guest_data(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 1) 게스트 세션에서 일회용 토큰 준비
-- ---------------------------------------------------------------------------
create or replace function public.prepare_guest_data_transfer()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  uid uuid := auth.uid();
  user_is_anonymous boolean;
  transfer_token uuid;
begin
  if uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  select u.is_anonymous into user_is_anonymous
    from auth.users u where u.id = uid;

  if user_is_anonymous is distinct from true then
    raise exception '게스트 데이터만 이관할 수 있습니다' using errcode = '42501';
  end if;

  -- 이 게스트가 전에 만든 미사용 토큰은 폐기한다. 완료 토큰은 응답 유실 뒤 같은
  -- 계정이 재시도할 수 있도록 하루 동안 남긴다.
  delete from private.guest_data_transfers
   where (guest_user_id = uid and claimed_at is null)
      or (claimed_at is not null and claimed_at < now() - interval '1 day');

  insert into private.guest_data_transfers (guest_user_id)
  values (uid)
  returning token into transfer_token;

  return transfer_token;
end;
$$;

revoke all on function public.prepare_guest_data_transfer() from public, anon;
grant execute on function public.prepare_guest_data_transfer() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) 정식 계정으로 로그인한 뒤 토큰 청구
-- ---------------------------------------------------------------------------
create or replace function public.claim_guest_data_transfer(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target_is_anonymous boolean;
  transfer_row private.guest_data_transfers%rowtype;
  result jsonb;
begin
  if uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  select u.is_anonymous into target_is_anonymous
    from auth.users u where u.id = uid;
  if target_is_anonymous is distinct from false then
    raise exception '정식 계정으로 로그인한 뒤 가져올 수 있습니다' using errcode = '42501';
  end if;

  select * into transfer_row
    from private.guest_data_transfers t
   where t.token = p_token
   for update;

  if not found then
    raise exception '캘린더 가져오기 요청을 찾을 수 없습니다' using errcode = '22023';
  end if;

  -- 서버에는 성공했지만 앱이 응답을 받지 못한 경우의 안전한 재시도.
  if transfer_row.claimed_at is not null then
    if transfer_row.claimed_by = uid then
      return jsonb_build_object('already_claimed', true);
    end if;
    raise exception '이미 사용한 캘린더 가져오기 요청입니다' using errcode = '42501';
  end if;

  if transfer_row.expires_at <= now() then
    raise exception '캘린더 가져오기 요청이 만료되었습니다' using errcode = '22023';
  end if;

  -- 같은 트랜잭션에서만 트리거가 새 계정의 소유권 변경을 허용한다.
  update private.guest_data_transfers
     set claimed_by = uid
   where token = p_token;

  result := private.transfer_guest_data(transfer_row.guest_user_id, uid);

  update private.guest_data_transfers
     set claimed_at = now()
   where token = p_token;

  return result || jsonb_build_object('already_claimed', false);
end;
$$;

revoke all on function public.claim_guest_data_transfer(uuid) from public, anon;
grant execute on function public.claim_guest_data_transfer(uuid) to authenticated;

comment on function public.prepare_guest_data_transfer() is
  '게스트 세션에서 15분짜리 일회용 데이터 이관 토큰을 만든다.';
comment on function public.claim_guest_data_transfer(uuid) is
  '정식 계정에서 일회용 토큰을 청구해 게스트 데이터를 한 트랜잭션으로 합친다.';
