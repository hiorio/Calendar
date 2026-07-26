-- =============================================================================
-- 0008 · 초대 수락
--
-- 설계안 6.2는 이걸 Edge Function(`POST /invite/accept`)으로 뒀지만,
-- 하는 일이 "코드 검증 + 멤버 등록 + use_count 증가 + 활동로그"로 전부 DB 안에서
-- 끝난다. security definer 함수로 만들면 한 트랜잭션으로 묶이고, 콜드스타트도
-- 배포 단계도 없앨 수 있다. 외부 호출이 생기면 그때 Edge Function으로 옮긴다.
--
-- 비구성원은 calendar_invites를 읽을 수 없다(코드 목록이 새면 안 되므로).
-- 그래서 조회도 이 함수들을 통해서만 한다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 수락 전 미리보기 — 어떤 캘린더에 들어가는지 보여준다.
-- 게스트도 볼 수 있다. 가입 여부는 수락 시점에 따진다.
-- ---------------------------------------------------------------------------
create or replace function public.invite_preview(invite_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  inv    public.calendar_invites%rowtype;
  reason text;
begin
  select * into inv from public.calendar_invites where code = invite_code;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'NOT_FOUND');
  end if;

  if inv.revoked_at is not null then
    reason := 'REVOKED';
  elsif inv.expires_at is not null and inv.expires_at < now() then
    reason := 'EXPIRED';
  elsif inv.max_uses is not null and inv.use_count >= inv.max_uses then
    reason := 'EXHAUSTED';
  end if;

  return jsonb_build_object(
    'valid', reason is null,
    'reason', reason,
    'calendar_id', inv.calendar_id,
    'calendar_name', (select c.name from public.calendars c where c.id = inv.calendar_id),
    'calendar_color', (select c.color from public.calendars c where c.id = inv.calendar_id),
    'member_count', (select count(*) from public.calendar_members m where m.calendar_id = inv.calendar_id),
    'inviter', (select p.nickname from public.profiles p where p.id = inv.created_by),
    'already_member', exists (
      select 1 from public.calendar_members m
      where m.calendar_id = inv.calendar_id and m.user_id = auth.uid()
    )
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 수락 — 검증 · 멤버 등록 · use_count · 활동로그를 한 트랜잭션으로
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv      public.calendar_invites%rowtype;
  uid      uuid := auth.uid();
  cal_name text;
  rejoined boolean := false;
begin
  if uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  -- 공유는 계정이 있어야 한다 (0007과 같은 기준)
  if public.is_guest() then
    raise exception '초대를 수락하려면 계정이 필요합니다' using errcode = '42501';
  end if;

  -- 동시에 여러 명이 같은 코드를 쓸 때 use_count가 어긋나지 않도록 잠근다
  select * into inv from public.calendar_invites where code = invite_code for update;

  if not found then
    raise exception '초대 코드를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if inv.revoked_at is not null then
    raise exception '취소된 초대 링크입니다' using errcode = 'P0002';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception '만료된 초대 링크입니다' using errcode = 'P0002';
  end if;
  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    raise exception '사용 횟수를 모두 채운 초대 링크입니다' using errcode = 'P0002';
  end if;

  select c.name into cal_name from public.calendars c where c.id = inv.calendar_id;

  if exists (
    select 1 from public.calendar_members m
    where m.calendar_id = inv.calendar_id and m.user_id = uid
  ) then
    rejoined := true;
  else
    insert into public.calendar_members (calendar_id, user_id, role)
    values (inv.calendar_id, uid, 'MEMBER');

    update public.calendar_invites
       set use_count = use_count + 1
     where id = inv.id;

    insert into public.activity_logs (calendar_id, actor_id, type, ref_id, summary)
    values (inv.calendar_id, uid, 'MEMBER_JOINED', uid,
            jsonb_build_object('invite_id', inv.id));
  end if;

  return jsonb_build_object(
    'calendar_id', inv.calendar_id,
    'calendar_name', cal_name,
    'already_member', rejoined
  );
end;
$$;

grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
