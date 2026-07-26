-- =============================================================================
-- 0011 · 활동 로그 (설계안 11장 7단계)
--
-- `activity_logs`는 클라이언트에게 **읽기 전용**이다(0005는 SELECT만 준다).
-- 여기 트리거가 security definer로 남긴다.
--
-- 알림(0010)과 규칙이 다르다는 점이 중요하다.
--
--   알림  — "누구에게 알릴까". 행위자 본인과 음소거한 사람을 뺀다.
--           남을 깨울 만한 변화(제목·시간·장소·반복)만 큐에 넣는다.
--   활동  — "무슨 일이 있었나". **본인 행동도 남기고, 음소거와 무관하다.**
--           메모만 고쳤어도 기록은 남는다. 기록과 알림은 다른 문제다.
--
-- 그래서 같은 트리거에 욱여넣지 않고 따로 둔다. 한쪽 규칙을 고칠 때 다른 쪽이
-- 딸려 오면 안 된다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 일정 생성 · 변경 · 삭제
-- ---------------------------------------------------------------------------
create or replace function public.on_event_change_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  kind    public.activity_type;
  changed text[] := '{}';
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then return new; end if;
    kind := 'EVENT_CREATED';

  elsif old.deleted_at is null and new.deleted_at is not null then
    kind := 'EVENT_DELETED';

  elsif new.deleted_at is not null then
    return new;

  else
    -- 무엇이 바뀌었는지 남긴다. 화면이 "시간을 바꿨어요"라고 말할 수 있어야 한다.
    -- `changed || 'title'` 로 쓰면 Postgres가 오른쪽을 배열 리터럴로 읽어 22P02로 깨진다.
    if new.title       is distinct from old.title       then changed := array_append(changed, 'title'); end if;
    if new.start_at    is distinct from old.start_at
    or new.end_at      is distinct from old.end_at
    or new.start_date  is distinct from old.start_date
    or new.end_date    is distinct from old.end_date    then changed := array_append(changed, 'time'); end if;
    if new.location    is distinct from old.location    then changed := array_append(changed, 'location'); end if;
    if new.description is distinct from old.description then changed := array_append(changed, 'description'); end if;
    if new.rrule       is distinct from old.rrule       then changed := array_append(changed, 'rrule'); end if;
    if new.calendar_id is distinct from old.calendar_id then changed := array_append(changed, 'calendar'); end if;

    -- 아무것도 안 바뀐 UPDATE는 기록하지 않는다
    if array_length(changed, 1) is null then return new; end if;
    kind := 'EVENT_UPDATED';
  end if;

  insert into public.activity_logs (calendar_id, actor_id, type, ref_id, summary)
  values (
    new.calendar_id,
    auth.uid(),
    kind,
    new.id,
    jsonb_build_object('title', new.title, 'changed', to_jsonb(changed))
  );

  return new;
end;
$$;

create trigger trg_events_activity
  after insert or update on public.events
  for each row execute function public.on_event_change_log();

-- ---------------------------------------------------------------------------
-- 댓글
-- ---------------------------------------------------------------------------
create or replace function public.on_comment_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ev record;
begin
  select e.calendar_id, e.title, e.deleted_at
    into ev
    from public.events e
   where e.id = new.event_id;

  if ev.calendar_id is null or ev.deleted_at is not null then
    return new;
  end if;

  insert into public.activity_logs (calendar_id, actor_id, type, ref_id, summary)
  values (
    ev.calendar_id,
    new.user_id,
    'COMMENT_CREATED',
    new.event_id,
    jsonb_build_object(
      'title', ev.title,
      'excerpt', left(coalesce(new.content, ''), 100),
      'comment_id', new.id
    )
  );

  return new;
end;
$$;

create trigger trg_comments_activity
  after insert on public.event_comments
  for each row execute function public.on_comment_log();

-- ---------------------------------------------------------------------------
-- 구성원 탈퇴 · 강퇴
--
-- 합류(MEMBER_JOINED)는 `accept_invite`가 이미 남긴다(0008).
-- ---------------------------------------------------------------------------
create or replace function public.on_member_leave_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who text;
begin
  -- 캘린더 자체가 지워지는 중이면(cascade) 남길 곳이 없다.
  -- activity_logs.calendar_id가 캘린더를 참조하므로 그냥 넣으면 FK로 깨진다.
  if not exists (select 1 from public.calendars where id = old.calendar_id) then
    return old;
  end if;

  select nickname into who from public.profiles where id = old.user_id;

  insert into public.activity_logs (calendar_id, actor_id, type, ref_id, summary)
  values (
    old.calendar_id,
    -- 강퇴면 행위자는 내보낸 사람, 스스로 나갔으면 본인
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

create trigger trg_members_activity
  after delete on public.calendar_members
  for each row execute function public.on_member_leave_log();
