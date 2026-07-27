-- =============================================================================
-- 0014 · 회차 예외를 온전하게 만든다
--
-- 반복 일정의 한 회차만 고치면 `event_exceptions`에 기록된다. 그런데 두 가지가
-- 빠져 있어서 회차 수정이 반쪽이었다.
--
--   1) `is_all_day`가 없다. 화면은 회차 하나만 종일↔시간 지정으로 바꾸는 토글을
--      내주지만, 예외 행에 그 사실을 적을 자리가 없어 전개할 때 마스터 값을
--      따라간다. 켤 수 있는데 저장이 안 되는 컨트롤이었다.
--
--   2) 알림·활동 트리거가 `events`에만 붙어 있다. 회차를 고치면 다른 구성원에게
--      알림도 안 가고 활동에도 안 남는다. "누가 무엇을 바꿨나"에 구멍이 생긴다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. is_all_day 오버라이드
--
-- NULL이면 "마스터를 따른다". 종일 여부까지 바꾼 회차만 값을 갖는다.
-- ---------------------------------------------------------------------------
alter table public.event_exceptions add column is_all_day boolean;

comment on column public.event_exceptions.is_all_day is
  'NULL이면 마스터를 따른다. 이 회차만 종일/시간 지정을 바꿨을 때만 값이 들어간다.';

grant update (is_all_day) on public.event_exceptions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 회차 수정도 알림 큐에 넣는다
--
-- 수신자 규칙은 `events` 쪽과 같다 — 행위자 본인과 음소거를 뺀다(0010).
-- ---------------------------------------------------------------------------
create or replace function public.on_exception_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ev    record;
  kind  text;
  dedup text;
begin
  select e.id, e.calendar_id, e.title, e.deleted_at, c.name as calendar_name
    into ev
    from public.events e
    join public.calendars c on c.id = e.calendar_id
   where e.id = new.event_id;

  if ev.calendar_id is null or ev.deleted_at is not null then
    return new;
  end if;

  if new.type = 'CANCELLED' then
    kind  := 'EVENT_DELETED';
    dedup := 'OCC_CANCELLED:' || new.event_id || ':' || extract(epoch from new.original_start);
  else
    kind := 'EVENT_UPDATED';
    -- 같은 회차를 여러 번 고치면 그때마다 새 알림이지만, 한 번의 수정이
    -- 중복으로 들어가지는 않는다.
    dedup := 'OCC_UPDATED:' || new.event_id || ':' || extract(epoch from new.original_start)
             || ':' || extract(epoch from new.updated_at);
  end if;

  perform public.enqueue_notifications(
    ev.calendar_id,
    auth.uid(),
    kind,
    dedup,
    jsonb_build_object(
      'event_id',       ev.id,
      'calendar_id',    ev.calendar_id,
      'calendar_name',  ev.calendar_name,
      'title',          coalesce(new.title, ev.title),
      'occurrence',     new.original_start,
      'single_occurrence', true,
      'actor_id',       auth.uid()
    )
  );

  return new;
end;
$$;

create trigger trg_exceptions_notify
  after insert or update on public.event_exceptions
  for each row execute function public.on_exception_notify();

-- ---------------------------------------------------------------------------
-- 3. 회차 수정도 활동에 남긴다
--
-- 알림과 달리 본인 행동도 남긴다(0011과 같은 규칙).
-- ---------------------------------------------------------------------------
create or replace function public.on_exception_log()
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
    auth.uid(),
    -- CASE 는 text 를 내놓는다. activity_type 으로 명시 캐스팅하지 않으면
    -- 42804 로 막힌다(암묵 변환이 없다).
    (case when new.type = 'CANCELLED' then 'EVENT_DELETED' else 'EVENT_UPDATED' end)::public.activity_type,
    new.event_id,
    jsonb_build_object(
      'title', coalesce(new.title, ev.title),
      'changed', to_jsonb(array['occurrence']::text[]),
      'occurrence', new.original_start
    )
  );

  return new;
end;
$$;

create trigger trg_exceptions_activity
  after insert or update on public.event_exceptions
  for each row execute function public.on_exception_log();
