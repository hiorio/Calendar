-- =============================================================================
-- 알림 발송 워커 지원
--
-- outbox를 여러 워커가 동시에 집어도 한 번만 가져가도록 SKIP LOCKED claim을 제공하고,
-- Expo push ticket/receipt를 기기별로 추적한다.
-- =============================================================================

alter table public.notification_outbox
  drop constraint notification_outbox_status_check;

alter table public.notification_outbox
  add column claimed_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add constraint notification_outbox_status_check
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED'));

drop index public.idx_outbox_pending;
create index idx_outbox_ready
  on public.notification_outbox (next_attempt_at, created_at)
  where status = 'PENDING';

create table public.notification_deliveries (
  outbox_id          bigint not null
                     references public.notification_outbox(id) on delete cascade,
  expo_token         text not null,
  status             text not null default 'PENDING'
                     check (status in ('PENDING', 'TICKETED', 'DELIVERED', 'FAILED')),
  attempts           int not null default 0,
  ticket_id          text unique,
  last_error         text,
  ticketed_at        timestamptz,
  receipt_checked_at timestamptz,
  created_at         timestamptz not null default now(),
  primary key (outbox_id, expo_token)
);

create index idx_notification_deliveries_receipts
  on public.notification_deliveries (ticketed_at)
  where status = 'TICKETED' and ticket_id is not null;

-- 워커(service_role)만 접근한다. 클라이언트 정책은 의도적으로 만들지 않는다.
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

create or replace function public.claim_notification_outbox(p_limit int default 100)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  -- 마지막 시도에서 워커가 죽은 행도 영원히 PROCESSING에 남기지 않는다.
  update public.notification_outbox
     set status = 'FAILED',
         last_error = coalesce(last_error, 'worker lease expired after final attempt')
   where status = 'PROCESSING'
     and attempts >= 3
     and claimed_at < now() - interval '5 minutes';

  return query
  with picked as (
    select o.id
      from public.notification_outbox o
     where o.attempts < 3
       and (
         (o.status = 'PENDING' and o.next_attempt_at <= now())
         or
         (o.status = 'PROCESSING' and o.claimed_at < now() - interval '5 minutes')
       )
     order by o.created_at
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 100), 100))
  ),
  claimed as (
    update public.notification_outbox o
       set status = 'PROCESSING',
           attempts = o.attempts + 1,
           claimed_at = now(),
           last_error = null
      from picked
     where o.id = picked.id
    returning o.*
  )
  select claimed.* from claimed;
end;
$$;

revoke all on function public.claim_notification_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(int) to service_role;

-- 스캐너는 아래 후보를 TypeScript의 반복 전개 규칙으로 펼친다. Postgres에는 RRULE
-- 파서를 중복 구현하지 않는다. 공통 리마인더(user_id NULL)는 음소거하지 않은 구성원
-- 각각으로 펼치고, 개인 리마인더는 그 사용자 한 명만 돌려준다.
create or replace function public.reminder_scan_candidates(
  p_from timestamptz,
  p_to   timestamptz
)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'reminder_id',   r.id,
    'user_id',       m.user_id,
    'minutes_before', r.minutes_before,
    'calendar_name', c.name,
    'event', jsonb_build_object(
      'id',         e.id,
      'calendar_id', e.calendar_id,
      'title',      e.title,
      'description', e.description,
      'location',   e.location,
      'is_all_day', e.is_all_day,
      'start_at',   e.start_at,
      'end_at',     e.end_at,
      'start_date', e.start_date,
      'end_date',   e.end_date,
      'timezone',   e.timezone,
      'rrule',      e.rrule
    )
  )
    from public.event_reminders r
    join public.events e on e.id = r.event_id and e.deleted_at is null
    join public.calendars c on c.id = e.calendar_id and c.deleted_at is null
    join public.calendar_members m
      on m.calendar_id = e.calendar_id
     and m.muted = false
     and (r.user_id is null or r.user_id = m.user_id)
   where e.range_start <= p_to + make_interval(mins => r.minutes_before)
     and (e.range_end is null
          or e.range_end >= p_from + make_interval(mins => r.minutes_before));
end;
$$;

revoke all on function public.reminder_scan_candidates(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reminder_scan_candidates(timestamptz, timestamptz)
  to service_role;
