-- Audit A04-A06, A09, A15-A18: active ownership, durable sends and file cleanup.
-- All new privileged RPCs are worker-only. No client can choose cleanup paths.

create or replace function public.is_calendar_member(cid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.calendar_members m
    join public.calendars c on c.id = m.calendar_id and c.deleted_at is null
    where m.calendar_id = cid and m.user_id = auth.uid());
$$;
create or replace function public.is_calendar_owner(cid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.calendar_members m
    join public.calendars c on c.id = m.calendar_id and c.deleted_at is null
    where m.calendar_id = cid and m.user_id = auth.uid() and m.role = 'OWNER');
$$;
create or replace function public.can_access_event(eid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.events e
    where e.id = eid and e.deleted_at is null and public.is_calendar_member(e.calendar_id));
$$;
create or replace function public.can_access_comment(cid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.event_comments c
    where c.id = cid and c.deleted_at is null and public.can_access_event(c.event_id));
$$;
create or replace function public.shares_calendar_with(uid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.calendar_members m
    where m.user_id = uid and public.is_calendar_member(m.calendar_id));
$$;

-- Lock the calendar before the invite: deletion and acceptance cannot interleave.
create or replace function public.invite_preview(invite_code text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare inv public.calendar_invites%rowtype; cal public.calendars%rowtype; reason text;
begin
  select * into inv from public.calendar_invites where code = invite_code;
  if not found then return jsonb_build_object('valid', false, 'reason', 'NOT_FOUND'); end if;
  select * into cal from public.calendars where id = inv.calendar_id and deleted_at is null;
  if not found then return jsonb_build_object('valid', false, 'reason', 'NOT_FOUND'); end if;
  if inv.revoked_at is not null then reason := 'REVOKED';
  elsif inv.expires_at is not null and inv.expires_at <= now() then reason := 'EXPIRED';
  elsif inv.max_uses is not null and inv.use_count >= inv.max_uses then reason := 'EXHAUSTED'; end if;
  return jsonb_build_object('valid', reason is null, 'reason', reason,
    'calendar_id', cal.id, 'calendar_name', cal.name, 'calendar_color', cal.color,
    'member_count', (select count(*) from public.calendar_members where calendar_id = cal.id),
    'inviter', (select nickname from public.profiles where id = inv.created_by),
    'already_member', public.is_calendar_member(cal.id));
end;
$$;
create or replace function public.accept_invite(invite_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.calendar_invites%rowtype; uid uuid := auth.uid(); cal_name text; cid uuid; rejoined boolean;
begin
  if uid is null or public.is_guest() then
    raise exception '초대를 수락하려면 계정이 필요합니다' using errcode = '42501'; end if;
  select calendar_id into cid from public.calendar_invites where code = invite_code;
  select name into cal_name from public.calendars where id = cid and deleted_at is null for update;
  if not found then raise exception '초대 코드를 찾을 수 없습니다' using errcode = 'P0002'; end if;
  select * into inv from public.calendar_invites where code = invite_code and calendar_id = cid for update;
  if not found then raise exception '초대 코드를 찾을 수 없습니다' using errcode = 'P0002'; end if;
  if inv.revoked_at is not null then raise exception '취소된 초대 링크입니다' using errcode = 'P0002'; end if;
  if inv.expires_at is not null and inv.expires_at <= now() then
    raise exception '만료된 초대 링크입니다' using errcode = 'P0002'; end if;
  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    raise exception '사용 횟수를 모두 채운 초대 링크입니다' using errcode = 'P0002'; end if;
  rejoined := public.is_calendar_member(cid);
  if not rejoined then
    insert into public.calendar_members(calendar_id, user_id, role) values (cid, uid, 'MEMBER');
    update public.calendar_invites set use_count = use_count + 1 where id = inv.id;
    insert into public.activity_logs(calendar_id, actor_id, type, ref_id, summary)
      values (cid, uid, 'MEMBER_JOINED', uid, jsonb_build_object('invite_id', inv.id));
  end if;
  return jsonb_build_object('calendar_id', cid, 'calendar_name', cal_name, 'already_member', rejoined);
end;
$$;
revoke all on function public.invite_preview(text), public.accept_invite(text),
  public.is_calendar_member(uuid), public.is_calendar_owner(uuid), public.can_access_event(uuid),
  public.can_access_comment(uuid), public.shares_calendar_with(uuid) from public, anon;
grant execute on function public.invite_preview(text), public.accept_invite(text),
  public.is_calendar_member(uuid), public.is_calendar_owner(uuid), public.can_access_event(uuid),
  public.can_access_comment(uuid), public.shares_calendar_with(uuid) to authenticated, service_role;

-- Membership loss and invite acceptance use the same parent lock BEFORE making
-- the last-member/heir decision, not merely while applying the later deletion.
create or replace function public.guard_member_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other_members int;
begin
  perform 1 from public.calendars where id = old.calendar_id for update;
  select count(*) into other_members from public.calendar_members
    where calendar_id = old.calendar_id and user_id <> old.user_id;
  if old.role = 'OWNER' and other_members > 0 then
    raise exception '소유자는 다른 구성원에게 소유권을 이전한 뒤 나갈 수 있습니다' using errcode = '42501'; end if;
  return old;
end;
$$;
create or replace function public.soft_delete_empty_calendar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.calendars where id = old.calendar_id for update;
  update public.calendars c set deleted_at = now() where c.id = old.calendar_id and c.deleted_at is null
    and not exists (select 1 from public.calendar_members m where m.calendar_id = c.id);
  return old;
end;
$$;
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cal record; heir uuid;
begin
  if uid is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  for cal in select id from public.calendars where owner_id = uid order by id for update loop
    select user_id into heir from public.calendar_members
      where calendar_id = cal.id and user_id <> uid order by joined_at, user_id limit 1;
    if heir is not null then update public.calendars set owner_id = heir where id = cal.id;
    else delete from public.calendars where id = cal.id; end if;
  end loop;
  delete from public.calendar_members where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.guard_member_leave(), public.soft_delete_empty_calendar(), public.delete_my_account()
  from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

create table public.storage_cleanup_jobs (
  id bigint generated always as identity primary key,
  bucket_id text not null check (bucket_id in ('calendar-media', 'avatars')),
  storage_path text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'DONE')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (bucket_id, storage_path)
);
alter table public.storage_cleanup_jobs enable row level security;
revoke all on public.storage_cleanup_jobs from public, anon, authenticated;
revoke all on sequence public.storage_cleanup_jobs_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup_jobs to service_role;
grant usage, select on sequence public.storage_cleanup_jobs_id_seq to service_role;
create index storage_cleanup_jobs_pending on public.storage_cleanup_jobs(next_attempt_at) where status <> 'DONE';

create or replace function public.queue_attachment_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Old malformed metadata must never turn its delete into an arbitrary
  -- service-role object deletion. Current inserts are checked below as well.
  if public.uuid_from_object_path(old.storage_path) is distinct from old.calendar_id then return old; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'calendar-media' and o.name = old.storage_path
      and o.owner_id is distinct from old.uploaded_by::text)
    and auth.uid() is not null and not public.is_calendar_owner(old.calendar_id) then return old; end if;
  insert into public.storage_cleanup_jobs(bucket_id, storage_path)
    values ('calendar-media', old.storage_path)
    on conflict (bucket_id, storage_path) do update set status = 'PENDING', next_attempt_at = now(), completed_at = null;
  return old;
end;
$$;
create trigger trg_attachments_queue_cleanup before delete on public.attachments
  for each row execute function public.queue_attachment_cleanup();

create or replace function public.on_calendar_deleted_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.deleted_at is null or old.deleted_at is not null) then return new; end if;
  update public.calendar_invites set revoked_at = coalesce(revoked_at, now()) where calendar_id = old.id;
  insert into public.storage_cleanup_jobs(bucket_id, storage_path)
    select 'calendar-media', name from storage.objects
    where bucket_id = 'calendar-media' and public.uuid_from_object_path(name) = old.id
    on conflict (bucket_id, storage_path) do update set status = 'PENDING', next_attempt_at = now(), completed_at = null;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_calendars_deleted_cleanup before delete or update of deleted_at on public.calendars
  for each row execute function public.on_calendar_deleted_cleanup();

-- Only this project's owned avatar paths, never OAuth/external profile URLs.
create or replace function public.queue_owned_avatar_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_cleanup_jobs(bucket_id, storage_path)
    select 'avatars', name from storage.objects
    where bucket_id = 'avatars' and public.uuid_from_object_path(name) = old.id
    on conflict (bucket_id, storage_path) do update set status = 'PENDING', next_attempt_at = now(), completed_at = null;
  return old;
end;
$$;
create trigger trg_profiles_queue_avatar_cleanup before delete on public.profiles
  for each row execute function public.queue_owned_avatar_cleanup();

create or replace function public.claim_storage_cleanup(p_limit int default 100)
returns setof public.storage_cleanup_jobs language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501'; end if;
  -- A reused path still referenced by active content must survive an old job.
  update public.storage_cleanup_jobs j set status = 'DONE', completed_at = now(), claimed_at = null,
    last_error = 'Cleanup cancelled: object is referenced by active content'
  where j.status <> 'DONE' and (
    (j.bucket_id = 'calendar-media' and exists (select 1 from public.attachments a
      join public.calendars c on c.id = a.calendar_id and c.deleted_at is null where a.storage_path = j.storage_path))
    or (j.bucket_id = 'calendar-media' and exists (select 1 from public.calendars c
      where c.deleted_at is null and c.cover_url = j.storage_path))
    or (j.bucket_id = 'avatars' and exists (select 1 from public.profiles p
      where p.id = public.uuid_from_object_path(j.storage_path)))
  );
  return query with picked as (
    select id from public.storage_cleanup_jobs
    where (status = 'PENDING' and next_attempt_at <= now())
       or (status = 'PROCESSING' and claimed_at < now() - interval '5 minutes')
    order by next_attempt_at, id for update skip locked limit greatest(1, least(coalesce(p_limit,100),100))
  ) update public.storage_cleanup_jobs j set status = 'PROCESSING', attempts = attempts + 1, claimed_at = now()
    from picked p where j.id = p.id returning j.*;
end;
$$;
revoke all on function public.queue_attachment_cleanup(), public.on_calendar_deleted_cleanup(),
  public.queue_owned_avatar_cleanup(), public.claim_storage_cleanup(int) from public, anon, authenticated;
grant execute on function public.claim_storage_cleanup(int) to service_role;

-- Moving a parent without moving its private object path would retain old access.
create or replace function public.guard_event_attachment_move()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.calendar_id is distinct from old.calendar_id and exists (
    select 1 from public.attachments a where a.event_id = old.id
      or a.comment_id in (select id from public.event_comments where event_id = old.id)
  ) then raise exception '첨부 파일이 있는 일정은 다른 캘린더로 옮길 수 없습니다. 첨부 파일을 먼저 제거해 주세요.'
    using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger trg_events_guard_attachment_move before update of calendar_id on public.events
  for each row execute function public.guard_event_attachment_move();
create or replace function public.guard_attachment_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if new.event_id is not null then
    select calendar_id into cid from public.events where id = new.event_id and deleted_at is null for update;
  elsif new.comment_id is not null then
    select e.calendar_id into cid from public.events e join public.event_comments c on c.event_id = e.id
      where c.id = new.comment_id and c.deleted_at is null and e.deleted_at is null for update of e;
  else
    select calendar_id into cid from public.memos where id = new.memo_id for update;
  end if;
  if cid is null or cid is distinct from new.calendar_id
      or public.uuid_from_object_path(new.storage_path) is distinct from cid then
    raise exception '첨부 파일과 일정의 캘린더가 일치하지 않습니다' using errcode = '23514'; end if;
  if exists (select 1 from public.storage_cleanup_jobs j where j.bucket_id = 'calendar-media'
      and j.storage_path = new.storage_path and j.status <> 'DONE') then
    raise exception '제거 중인 파일은 다시 연결할 수 없습니다. 파일을 다시 업로드해 주세요.' using errcode = '23514'; end if;
  if auth.uid() is not null and not exists (select 1 from storage.objects o
      where o.bucket_id = 'calendar-media' and o.name = new.storage_path
        and o.owner_id = auth.uid()::text and o.owner_id = new.uploaded_by::text) then
    raise exception '직접 업로드한 파일만 첨부할 수 있습니다' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger trg_attachments_guard_parent before insert or update of calendar_id, event_id, comment_id, memo_id, storage_path on public.attachments
  for each row execute function public.guard_attachment_parent();
revoke all on function public.guard_event_attachment_move(), public.guard_attachment_parent() from public, anon, authenticated;

alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add column sending_at timestamptz,
  add constraint notification_deliveries_status_check check (status in ('PENDING','SENDING','TICKETED','DELIVERED','FAILED'));

-- A durable pre-send marker prevents a crash after Expo acceptance from resending.
-- Expo provides no idempotency key; an uncertain send is terminal and visible.
create or replace function public.begin_notification_delivery(p_outbox_id bigint, p_expo_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.notification_outbox%rowtype; valid boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501'; end if;
  select * into job from public.notification_outbox where id = p_outbox_id and status = 'PROCESSING' for update;
  if not found then return false; end if;
  select exists (
    select 1 from public.device_tokens t
    join public.calendar_members m on m.user_id = t.user_id and m.calendar_id::text = job.payload->>'calendar_id' and not m.muted
    join public.calendars c on c.id = m.calendar_id and c.deleted_at is null
    where t.expo_token = p_expo_token and t.user_id = job.user_id and t.disabled_at is null
      and (job.type = 'REMINDER' or job.user_id::text is distinct from job.payload->>'actor_id')
      and (not (job.payload ? 'event_id') or exists (
        select 1 from public.events e where e.id::text = job.payload->>'event_id' and e.calendar_id = c.id
          and (e.deleted_at is null or job.type = 'EVENT_DELETED')
          and (job.type <> 'REMINDER' or exists (select 1 from public.event_reminders r where r.event_id = e.id
            and (r.user_id is null or r.user_id = job.user_id)
            and r.minutes_before::text = job.payload->>'minutes_before'))
          and (job.type <> 'REMINDER' or not exists (select 1 from public.event_exceptions x
            where x.event_id = e.id and x.original_start = (job.payload->>'original_start')::timestamptz
              and (x.type = 'CANCELLED'
                or (x.start_at is not null and x.start_at is distinct from (job.payload->>'start_at')::timestamptz)
                or (x.start_date is not null and x.start_date is distinct from (job.payload->>'start_date')::date)
                or (x.is_all_day is not null and x.is_all_day is distinct from (job.payload->>'is_all_day')::boolean))))
      ))
  ) into valid;
  if not valid then
    update public.notification_deliveries set status = 'FAILED', last_error = 'Recipient, token or calendar access is no longer valid'
      where outbox_id = p_outbox_id and expo_token = p_expo_token and status = 'PENDING';
    return false;
  end if;
  update public.notification_deliveries set status = 'SENDING', attempts = attempts + 1, sending_at = now(), last_error = null
    where outbox_id = p_outbox_id and expo_token = p_expo_token and status = 'PENDING' and attempts < 3;
  return found;
end;
$$;
revoke all on function public.begin_notification_delivery(bigint,text) from public, anon, authenticated;
grant execute on function public.begin_notification_delivery(bigint,text) to service_role;

-- Old finite bounds were capped at 400 occurrences. NULL broadens queries safely;
-- the scheduled worker rebuilds exact finite bounds using the shared TS parser.
update public.events set rrule_until = null
  where rrule ~* '(^|;)(COUNT|UNTIL)=' and rrule_until is not null;

create or replace function public.reminder_scan_candidates(p_from timestamptz, p_to timestamptz)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501'; end if;
  return query select jsonb_build_object('reminder_id',r.id,'user_id',m.user_id,'minutes_before',r.minutes_before,
    'calendar_name',c.name,'event',jsonb_build_object('id',e.id,'calendar_id',e.calendar_id,'title',e.title,
      'description',e.description,'location',e.location,'is_all_day',e.is_all_day,'start_at',e.start_at,'end_at',e.end_at,
      'start_date',e.start_date,'end_date',e.end_date,'timezone',e.timezone,'rrule',e.rrule))
    from public.event_reminders r join public.events e on e.id = r.event_id and e.deleted_at is null
    join public.calendars c on c.id = e.calendar_id and c.deleted_at is null
    join public.calendar_members m on m.calendar_id = e.calendar_id and not m.muted and (r.user_id is null or r.user_id = m.user_id)
    where (e.range_start <= p_to + make_interval(mins => r.minutes_before)
      and (e.range_end is null or e.range_end >= p_from + make_interval(mins => r.minutes_before)))
    or exists (select 1 from public.event_exceptions x where x.event_id = e.id and x.type = 'MODIFIED'
      and coalesce(x.start_at, x.start_date::timestamp at time zone e.timezone) < p_to + make_interval(mins => r.minutes_before)
      and coalesce(x.end_at, (x.end_date + 1)::timestamp at time zone e.timezone) >= p_from + make_interval(mins => r.minutes_before))
    order by r.id, m.user_id;
end;
$$;
revoke all on function public.reminder_scan_candidates(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.reminder_scan_candidates(timestamptz,timestamptz) to service_role;

-- Catch already deleted calendars while installing the cleanup path.
update public.calendar_invites i set revoked_at = coalesce(i.revoked_at, now())
  from public.calendars c where c.id = i.calendar_id and c.deleted_at is not null;
insert into public.storage_cleanup_jobs(bucket_id, storage_path)
  select o.bucket_id, o.name from storage.objects o
  left join public.calendars c on c.id = public.uuid_from_object_path(o.name)
  where o.bucket_id = 'calendar-media' and public.uuid_from_object_path(o.name) is not null
    and (c.id is null or c.deleted_at is not null)
  on conflict (bucket_id, storage_path) do nothing;
insert into public.storage_cleanup_jobs(bucket_id, storage_path)
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id = 'avatars' and public.uuid_from_object_path(o.name) is not null
    and not exists (select 1 from public.profiles p where p.id = public.uuid_from_object_path(o.name))
  on conflict (bucket_id, storage_path) do nothing;
