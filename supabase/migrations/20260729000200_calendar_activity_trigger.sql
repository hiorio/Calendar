-- 캘린더 이름·색상·대표 사진 변경은 클라이언트가 아니라 DB 트리거에서 기록한다.
-- 어떤 앱 버전이나 직접 API 호출로 수정해도 같은 이력이 남아야 한다.

create or replace function public.on_calendar_change_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed text[] := '{}';
begin
  if new.name      is distinct from old.name      then changed := array_append(changed, 'name'); end if;
  if new.color     is distinct from old.color     then changed := array_append(changed, 'color'); end if;
  if new.cover_url is distinct from old.cover_url then changed := array_append(changed, 'cover'); end if;

  -- 같은 값을 다시 저장한 UPDATE나 updated_at만 바뀐 경우는 기록하지 않는다.
  if array_length(changed, 1) is null then
    return new;
  end if;

  insert into public.activity_logs (calendar_id, actor_id, type, ref_id, summary)
  values (
    new.id,
    auth.uid(),
    'CALENDAR_UPDATED',
    new.id,
    jsonb_build_object(
      'title', new.name,
      'changed', to_jsonb(changed)
    )
  );

  return new;
end;
$$;

create trigger trg_calendars_activity
  after update of name, color, cover_url on public.calendars
  for each row execute function public.on_calendar_change_log();
