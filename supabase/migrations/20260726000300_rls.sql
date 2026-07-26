-- =============================================================================
-- 0003 · Row Level Security (설계안 5장)
--
-- 모든 데이터 접근의 단일 기준: "요청자가 해당 캘린더의 구성원인가"
--
-- 헬퍼는 전부 security definer 다. calendar_members를 참조하는 정책이
-- calendar_members 자신의 RLS를 다시 타면 무한 재귀가 나기 때문이다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 헬퍼
-- ---------------------------------------------------------------------------
create or replace function public.is_calendar_member(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.calendar_members
    where calendar_id = cid and user_id = auth.uid()
  );
$$;

create or replace function public.is_calendar_owner(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.calendar_members
    where calendar_id = cid and user_id = auth.uid() and role = 'OWNER'
  );
$$;

create or replace function public.can_access_event(eid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.events e
      join public.calendar_members m on m.calendar_id = e.calendar_id
     where e.id = eid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_comment(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.event_comments c
      join public.events e          on e.id = c.event_id
      join public.calendar_members m on m.calendar_id = e.calendar_id
     where c.id = cid and m.user_id = auth.uid()
  );
$$;

-- 같은 캘린더에 속한 사람의 프로필만 볼 수 있다
create or replace function public.shares_calendar_with(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.calendar_members mine
      join public.calendar_members theirs
        on theirs.calendar_id = mine.calendar_id
     where mine.user_id = auth.uid() and theirs.user_id = uid
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: read self or co-member" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_calendar_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- insert는 on_auth_user_created 트리거(security definer)가 담당한다.

-- ---------------------------------------------------------------------------
-- calendars
-- ---------------------------------------------------------------------------
alter table public.calendars enable row level security;

create policy "calendars: member can read" on public.calendars
  for select to authenticated
  using (public.is_calendar_member(id) and deleted_at is null);

create policy "calendars: create own" on public.calendars
  for insert to authenticated
  with check (owner_id = auth.uid());

-- 이름/색/커버는 구성원 누구나. owner_id 변경은 트리거가 OWNER로 제한한다.
create policy "calendars: member can update" on public.calendars
  for update to authenticated
  using (public.is_calendar_member(id) and deleted_at is null)
  with check (public.is_calendar_member(id));

create policy "calendars: owner can delete" on public.calendars
  for delete to authenticated
  using (public.is_calendar_owner(id));

-- ---------------------------------------------------------------------------
-- calendar_members
-- ---------------------------------------------------------------------------
alter table public.calendar_members enable row level security;

create policy "members: read co-members" on public.calendar_members
  for select to authenticated
  using (public.is_calendar_member(calendar_id));

-- 가입(insert)은 초대 수락 Edge Function(service_role)과
-- on_calendar_created 트리거만 수행한다. 클라이언트 정책 없음.

create policy "members: update own settings" on public.calendar_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "members: owner can update anyone" on public.calendar_members
  for update to authenticated
  using (public.is_calendar_owner(calendar_id))
  with check (public.is_calendar_owner(calendar_id));

create policy "members: leave or be kicked" on public.calendar_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_calendar_owner(calendar_id));

-- ---------------------------------------------------------------------------
-- calendar_invites
-- ---------------------------------------------------------------------------
alter table public.calendar_invites enable row level security;

-- 코드로 조회하는 쪽(비구성원)은 Edge Function이 service_role로 처리한다.
create policy "invites: member can read" on public.calendar_invites
  for select to authenticated
  using (public.is_calendar_member(calendar_id));

create policy "invites: member can create" on public.calendar_invites
  for insert to authenticated
  with check (public.is_calendar_member(calendar_id) and created_by = auth.uid());

create policy "invites: creator or owner can revoke" on public.calendar_invites
  for update to authenticated
  using (created_by = auth.uid() or public.is_calendar_owner(calendar_id))
  with check (created_by = auth.uid() or public.is_calendar_owner(calendar_id));

create policy "invites: creator or owner can delete" on public.calendar_invites
  for delete to authenticated
  using (created_by = auth.uid() or public.is_calendar_owner(calendar_id));

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;

create policy "events: member can read" on public.events
  for select to authenticated
  using (public.is_calendar_member(calendar_id));

create policy "events: member can insert" on public.events
  for insert to authenticated
  with check (public.is_calendar_member(calendar_id) and created_by = auth.uid());

-- 삭제는 soft delete(update)로 처리한다.
create policy "events: member can update" on public.events
  for update to authenticated
  using (public.is_calendar_member(calendar_id))
  with check (public.is_calendar_member(calendar_id));

create policy "events: owner can hard delete" on public.events
  for delete to authenticated
  using (public.is_calendar_owner(calendar_id));

-- ---------------------------------------------------------------------------
-- 일정 하위 테이블
-- ---------------------------------------------------------------------------
alter table public.event_exceptions enable row level security;

create policy "exceptions: member can read" on public.event_exceptions
  for select to authenticated using (public.can_access_event(event_id));
create policy "exceptions: member can insert" on public.event_exceptions
  for insert to authenticated with check (public.can_access_event(event_id));
create policy "exceptions: member can update" on public.event_exceptions
  for update to authenticated
  using (public.can_access_event(event_id))
  with check (public.can_access_event(event_id));
create policy "exceptions: member can delete" on public.event_exceptions
  for delete to authenticated using (public.can_access_event(event_id));


alter table public.event_participants enable row level security;

create policy "participants: member can read" on public.event_participants
  for select to authenticated using (public.can_access_event(event_id));
create policy "participants: member can insert" on public.event_participants
  for insert to authenticated with check (public.can_access_event(event_id));
create policy "participants: member can delete" on public.event_participants
  for delete to authenticated using (public.can_access_event(event_id));


alter table public.event_reminders enable row level security;

create policy "reminders: member can read" on public.event_reminders
  for select to authenticated using (public.can_access_event(event_id));
create policy "reminders: member can insert" on public.event_reminders
  for insert to authenticated
  with check (
    public.can_access_event(event_id)
    and (user_id is null or user_id = auth.uid())
  );
create policy "reminders: own or shared can delete" on public.event_reminders
  for delete to authenticated
  using (
    public.can_access_event(event_id)
    and (user_id is null or user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- event_comments / comment_reactions
-- ---------------------------------------------------------------------------
alter table public.event_comments enable row level security;

create policy "comments: member can read" on public.event_comments
  for select to authenticated using (public.can_access_event(event_id));

create policy "comments: member can write" on public.event_comments
  for insert to authenticated
  with check (public.can_access_event(event_id) and user_id = auth.uid());

-- 수정/삭제(soft delete)는 작성자 본인만
create policy "comments: author can update" on public.event_comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


alter table public.comment_reactions enable row level security;

create policy "reactions: member can read" on public.comment_reactions
  for select to authenticated using (public.can_access_comment(comment_id));
create policy "reactions: own insert" on public.comment_reactions
  for insert to authenticated
  with check (public.can_access_comment(comment_id) and user_id = auth.uid());
create policy "reactions: own delete" on public.comment_reactions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- memos
-- ---------------------------------------------------------------------------
alter table public.memos enable row level security;

create policy "memos: member can read" on public.memos
  for select to authenticated using (public.is_calendar_member(calendar_id));
create policy "memos: member can insert" on public.memos
  for insert to authenticated
  with check (public.is_calendar_member(calendar_id) and created_by = auth.uid());
create policy "memos: member can update" on public.memos
  for update to authenticated
  using (public.is_calendar_member(calendar_id))
  with check (public.is_calendar_member(calendar_id));
create policy "memos: member can delete" on public.memos
  for delete to authenticated using (public.is_calendar_member(calendar_id));

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
alter table public.attachments enable row level security;

create policy "attachments: member can read" on public.attachments
  for select to authenticated using (public.is_calendar_member(calendar_id));
create policy "attachments: member can insert" on public.attachments
  for insert to authenticated
  with check (public.is_calendar_member(calendar_id) and uploaded_by = auth.uid());
create policy "attachments: uploader can delete" on public.attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_calendar_owner(calendar_id));

-- ---------------------------------------------------------------------------
-- activity_logs — 읽기 전용. 쓰기는 트리거(security definer)만.
-- ---------------------------------------------------------------------------
alter table public.activity_logs enable row level security;

create policy "activity: member can read" on public.activity_logs
  for select to authenticated using (public.is_calendar_member(calendar_id));

-- ---------------------------------------------------------------------------
-- device_tokens — 본인 것만
-- ---------------------------------------------------------------------------
alter table public.device_tokens enable row level security;

create policy "tokens: own read" on public.device_tokens
  for select to authenticated using (user_id = auth.uid());
create policy "tokens: own insert" on public.device_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy "tokens: own update" on public.device_tokens
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tokens: own delete" on public.device_tokens
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notification_outbox — 클라이언트 접근 전면 차단 (service_role 전용)
-- 정책을 하나도 만들지 않는다.
-- ---------------------------------------------------------------------------
alter table public.notification_outbox enable row level security;
