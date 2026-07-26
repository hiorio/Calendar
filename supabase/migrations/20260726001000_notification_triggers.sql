-- =============================================================================
-- 0010 · 알림 큐를 채우는 트리거 (설계안 8장)
--
-- notification_outbox는 "중복/누락 방지의 핵심"이다. 발송은 service_role로 도는
-- 워커가 하고, **큐에 넣는 일은 DB가 한다.** 클라이언트가 넣게 두면
--   · 앱이 죽거나 네트워크가 끊기면 알림이 통째로 새고
--   · 악의적인 클라이언트가 아무에게나 알림을 보낼 수 있다
-- 일정이 실제로 저장됐다는 사실과 알림이 큐에 들어갔다는 사실이 같은 트랜잭션
-- 안에 있어야 한다.
--
-- notification_outbox에는 정책이 하나도 없다(0003). 트리거 함수를 security definer로
-- 두어 테이블 소유자 권한으로 넣는다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 수신자 펼치기
--
-- 캘린더 구성원 중에서
--   · 행위자 본인          — 내 행동을 나에게 알리지 않는다
--   · muted = true 인 사람 — 캘린더별 음소거 (calendar_members.muted)
-- 를 뺀 나머지에게 한 건씩 넣는다.
--
-- dedup_key는 '{사건}:{수신자}' 꼴이다. 같은 사건이 두 번 들어와도(재시도, 트리거
-- 중복 실행) UNIQUE 제약이 막는다.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_notifications(
  p_calendar_id uuid,
  p_actor_id    uuid,
  p_type        text,
  p_dedup       text,
  p_payload     jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notification_outbox (user_id, type, dedup_key, payload)
  select m.user_id, p_type, p_dedup || ':' || m.user_id, p_payload
    from public.calendar_members m
   where m.calendar_id = p_calendar_id
     -- `<>` 가 아니라 `is distinct from`. service_role로 도는 서버 로직은
     -- auth.uid()가 NULL이라, `<>`를 쓰면 조건이 NULL이 되어 아무에게도 안 간다.
     and m.user_id is distinct from p_actor_id
     and m.muted = false
  on conflict (dedup_key) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- 일정 생성 · 변경 · 삭제
-- ---------------------------------------------------------------------------
create or replace function public.on_event_change_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor    uuid := auth.uid();
  kind     text;
  dedup    text;
  cal_name text;
begin
  if tg_op = 'INSERT' then
    -- 만들자마자 지워진 것(가져오기 등)은 알리지 않는다
    if new.deleted_at is not null then return new; end if;
    kind  := 'EVENT_CREATED';
    dedup := 'EVENT_CREATED:' || new.id;

  elsif old.deleted_at is null and new.deleted_at is not null then
    kind  := 'EVENT_DELETED';
    dedup := 'EVENT_DELETED:' || new.id;

  elsif new.deleted_at is not null then
    -- 이미 지워진 일정을 손대는 경우
    return new;

  elsif (new.title      is distinct from old.title)
     or (new.start_at   is distinct from old.start_at)
     or (new.end_at     is distinct from old.end_at)
     or (new.start_date is distinct from old.start_date)
     or (new.end_date   is distinct from old.end_date)
     or (new.location   is distinct from old.location)
     or (new.rrule      is distinct from old.rrule) then
    kind := 'EVENT_UPDATED';
    -- 수정할 때마다 새 알림이지만, 같은 수정이 두 번 큐에 들어가지는 않는다.
    -- updated_at은 트리거가 매 수정마다 갱신한다.
    dedup := 'EVENT_UPDATED:' || new.id || ':' || extract(epoch from new.updated_at);

  else
    -- 메모만 고쳤다든지. 남을 깨울 만한 변화가 아니다.
    return new;
  end if;

  select name into cal_name from public.calendars where id = new.calendar_id;

  perform public.enqueue_notifications(
    new.calendar_id,
    actor,
    kind,
    dedup,
    jsonb_build_object(
      'event_id',      new.id,
      'calendar_id',   new.calendar_id,
      'calendar_name', cal_name,
      'title',         new.title,
      'is_all_day',    new.is_all_day,
      'start_at',      new.start_at,
      'start_date',    new.start_date,
      'timezone',      new.timezone,
      'actor_id',      actor
    )
  );

  return new;
end;
$$;

create trigger trg_events_notify
  after insert or update on public.events
  for each row execute function public.on_event_change_notify();

-- ---------------------------------------------------------------------------
-- 댓글
--
-- 수신자는 **캘린더 구성원 전체**(작성자·음소거 제외)다. 참여자로 좁히지 않는다 —
-- 이 앱이 노리는 캘린더는 가족·연인처럼 작고, 참여자 지정은 "누가 가는지"를
-- 나타내는 정보지 대화에서 빼달라는 뜻이 아니다.
-- ---------------------------------------------------------------------------
create or replace function public.on_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ev record;
begin
  select e.id, e.calendar_id, e.title, e.deleted_at, c.name as calendar_name
    into ev
    from public.events e
    join public.calendars c on c.id = e.calendar_id
   where e.id = new.event_id;

  -- 지워진 일정에 달린 댓글은 알리지 않는다
  if ev.calendar_id is null or ev.deleted_at is not null then
    return new;
  end if;

  perform public.enqueue_notifications(
    ev.calendar_id,
    new.user_id,
    'COMMENT',
    'COMMENT:' || new.id,
    jsonb_build_object(
      'event_id',      ev.id,
      'calendar_id',   ev.calendar_id,
      'calendar_name', ev.calendar_name,
      'title',         ev.title,
      'comment_id',    new.id,
      'excerpt',       left(coalesce(new.content, ''), 100),
      'actor_id',      new.user_id
    )
  );

  return new;
end;
$$;

create trigger trg_comments_notify
  after insert on public.event_comments
  for each row execute function public.on_comment_notify();
