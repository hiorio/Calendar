-- =============================================================================
-- 0001 · 스키마 (설계안 4장)
--
-- 시간 처리 원칙 (설계안 3장) 요약:
--   · 시간 지정 일정 : start_at / end_at (timestamptz, 내부 UTC)
--   · 종일 일정      : start_date / end_date (date). 타임존 변환 대상 아님
--   · 반복 일정      : events.timezone(IANA) 기준으로 전개
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 공통 유틸
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4.1 사용자 / 캘린더
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 가입 시 프로필 자동 생성. auth.users는 Supabase가 관리하므로 트리거로 연결한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nickname', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '사용자'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


create table public.calendars (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#4A90D9',
  cover_url   text,
  owner_id    uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 5.3: 마지막 구성원이 나가면 캘린더를 soft delete 한다
  deleted_at  timestamptz
);

create trigger trg_calendars_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();


create type public.member_role as enum ('OWNER', 'MEMBER');
-- 2차에서 'ADMIN', 'VIEWER' 추가 예정 (enum 확장 + 정책 조건 추가로 대응)

create table public.calendar_members (
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.member_role not null default 'MEMBER',
  color       text,                            -- 이 캘린더에서 내 일정에 쓸 개인 색
  muted       boolean not null default false,  -- 캘린더별 알림 끄기
  joined_at   timestamptz not null default now(),
  primary key (calendar_id, user_id)
);

create index idx_calendar_members_user on public.calendar_members (user_id);

-- 캘린더를 만든 사람은 곧바로 OWNER 구성원이 된다.
-- (RLS를 통과해야 하므로 security definer)
create or replace function public.handle_new_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.calendar_members (calendar_id, user_id, role)
  values (new.id, new.owner_id, 'OWNER')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_calendar_created
  after insert on public.calendars
  for each row execute function public.handle_new_calendar();


create table public.calendar_invites (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  code        text not null unique,          -- 초대 코드 (링크에도 포함)
  created_by  uuid not null references public.profiles(id),
  expires_at  timestamptz,                   -- NULL이면 무기한
  max_uses    int,                           -- NULL이면 무제한
  use_count   int not null default 0,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_calendar_invites_calendar on public.calendar_invites (calendar_id);

-- ---------------------------------------------------------------------------
-- 4.2 일정 (반복 포함)
-- ---------------------------------------------------------------------------
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references public.calendars(id) on delete cascade,
  title         text not null,
  description   text,
  location      text,
  color         text,

  -- 시간 (설계안 3장 원칙)
  is_all_day    boolean not null default false,
  start_at      timestamptz,   -- is_all_day = false 일 때만 사용
  end_at        timestamptz,
  start_date    date,          -- is_all_day = true  일 때만 사용
  end_date      date,          -- 포함(inclusive) 마지막 날
  timezone      text not null default 'Asia/Seoul',  -- IANA. 반복 전개 기준

  -- 반복
  rrule         text,          -- iCalendar RRULE 문자열. NULL이면 단일 일정
  -- 조회 최적화용. RRULE의 UNTIL/COUNT를 전개해 "마지막 회차의 종료 시각"을
  -- 넣는다. NULL이면 무한 반복.
  rrule_until   timestamptz,

  -- 조회/인덱스 전용 파생 컬럼. 종일 일정도 하나의 기간 쿼리로 다루기 위해
  -- 트리거가 유지한다. 직접 쓰지 말 것. (아래 sync_event_range 참고)
  range_start   timestamptz not null,
  range_end     timestamptz,   -- NULL이면 무한 반복

  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,   -- soft delete (활동내역/동기화 위해)

  constraint events_time_shape check (
    (is_all_day = false
      and start_at is not null and end_at is not null
      and start_date is null and end_date is null
      and end_at > start_at)
    or
    (is_all_day = true
      and start_date is not null and end_date is not null
      and start_at is null and end_at is null
      and end_date >= start_date)
  )
);

-- range_start / range_end 유지. 종일 일정은 이벤트 타임존으로 환산한다.
create or replace function public.sync_event_range()
returns trigger
language plpgsql
as $$
declare
  base_start timestamptz;
  base_end   timestamptz;
begin
  if new.is_all_day then
    base_start := new.start_date::timestamp at time zone new.timezone;
    -- 종료는 배타적(exclusive): 마지막 날의 다음 날 00:00
    base_end   := (new.end_date + 1)::timestamp at time zone new.timezone;
  else
    base_start := new.start_at;
    base_end   := new.end_at;
  end if;

  new.range_start := base_start;

  if new.rrule is null then
    new.range_end := base_end;
  else
    -- 반복 일정의 끝은 마지막 회차의 종료 시각(= rrule_until). NULL이면 무한.
    new.range_end := new.rrule_until;
  end if;

  return new;
end;
$$;

create trigger trg_events_sync_range
  before insert or update of is_all_day, start_at, end_at, start_date, end_date,
                             timezone, rrule, rrule_until
  on public.events
  for each row execute function public.sync_event_range();

create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create index idx_events_calendar_range
  on public.events (calendar_id, range_start)
  where deleted_at is null;

create index idx_events_calendar_recurring
  on public.events (calendar_id, range_start)
  where rrule is not null and deleted_at is null;


-- 반복 일정의 회차별 예외 (이 회차만 수정/삭제)
create type public.exception_type as enum ('CANCELLED', 'MODIFIED');

create table public.event_exceptions (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  -- 어느 회차인지 식별. 전개된 "원래" 시작 시각.
  -- 종일 반복 일정은 해당 날짜 00:00을 events.timezone으로 환산한 값을 쓴다.
  original_start timestamptz not null,
  type           public.exception_type not null,

  -- type = MODIFIED 일 때만 쓰는 오버라이드 필드 (NULL = 마스터 값 사용)
  title          text,
  description    text,
  location       text,
  start_at       timestamptz,
  end_at         timestamptz,
  start_date     date,
  end_date       date,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (event_id, original_start)
);

create trigger trg_event_exceptions_updated_at
  before update on public.event_exceptions
  for each row execute function public.set_updated_at();


create table public.event_participants (
  event_id  uuid not null references public.events(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, user_id)
);


create table public.event_reminders (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete cascade, -- NULL이면 캘린더 공통
  minutes_before int not null,                                          -- 10, 60, 1440 ...
  created_at     timestamptz not null default now(),

  constraint event_reminders_unique
    unique nulls not distinct (event_id, user_id, minutes_before)
);

-- ---------------------------------------------------------------------------
-- 4.3 대화 / 메모 / 활동 / 알림
-- ---------------------------------------------------------------------------
create table public.event_comments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  content     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger trg_event_comments_updated_at
  before update on public.event_comments
  for each row execute function public.set_updated_at();

create index idx_event_comments_event on public.event_comments (event_id, created_at);


create table public.comment_reactions (
  comment_id  uuid not null references public.event_comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);


create table public.memos (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  content     text not null,
  created_by  uuid not null references public.profiles(id),
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_memos_updated_at
  before update on public.memos
  for each row execute function public.set_updated_at();

create index idx_memos_calendar on public.memos (calendar_id, created_at desc);


create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars(id) on delete cascade,
  event_id     uuid references public.events(id) on delete cascade,
  comment_id   uuid references public.event_comments(id) on delete cascade,
  memo_id      uuid references public.memos(id) on delete cascade,
  storage_path text not null unique,   -- Storage 내 경로: {calendar_id}/{uuid}.jpg
  mime_type    text not null,
  size_bytes   bigint not null,
  uploaded_by  uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),

  constraint attachments_single_parent
    check (num_nonnulls(event_id, comment_id, memo_id) = 1)
);

create index idx_attachments_calendar on public.attachments (calendar_id);
create index idx_attachments_event on public.attachments (event_id) where event_id is not null;
create index idx_attachments_comment on public.attachments (comment_id) where comment_id is not null;


create type public.activity_type as enum (
  'EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_DELETED',
  'COMMENT_CREATED', 'MEMO_CREATED',
  'MEMBER_JOINED', 'MEMBER_LEFT'
);

create table public.activity_logs (
  id          bigint generated always as identity primary key,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  type        public.activity_type not null,
  ref_id      uuid,     -- event / comment / memo id
  summary     jsonb,    -- {"title": "토요일 저녁", "changed": ["start_at"]}
  created_at  timestamptz not null default now()
);

create index idx_activity_calendar on public.activity_logs (calendar_id, created_at desc);


create table public.device_tokens (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  expo_token  text not null,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now(),
  -- Expo receipt가 DeviceNotRegistered를 돌려준 토큰을 표시해 둔다 (12장)
  disabled_at timestamptz,
  primary key (user_id, expo_token)
);


-- 알림 발송 큐 (중복/누락 방지의 핵심)
create table public.notification_outbox (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,        -- EVENT_CREATED | COMMENT | REMINDER | DAILY_SUMMARY
  dedup_key   text not null unique, -- 예: 'REMINDER:{event_id}:{occurrence}:{user_id}'
  payload     jsonb not null,
  status      text not null default 'PENDING'
                check (status in ('PENDING', 'SENT', 'FAILED')),
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index idx_outbox_pending
  on public.notification_outbox (created_at)
  where status = 'PENDING';
