-- =============================================================================
-- 0009 · 소유권 이전이 자기 가드에 걸리던 문제 수정
--
-- 증상: OWNER가 소유권을 넘기면
--   "역할 변경은 캘린더 소유자만 할 수 있습니다" (42501)
--
-- 원인: guard_calendar_owner_change가 calendar_members를 두 번 update 한다.
--   1) 현 소유자를 MEMBER로 강등  ← 여기서 호출자의 role이 MEMBER가 된다
--   2) 새 소유자를 OWNER로 승격    ← guard_member_role_change가
--      "auth.uid()가 calendar_members에서 OWNER인가"를 보는데 1)에서 이미
--      강등됐으므로 false. 자기가 만든 변경에 자기가 막힌다.
--   순서를 바꿔도 두 번째 update에서 같은 문제가 난다.
--
-- 해결: 역할 변경 권한의 기준을 calendar_members.role이 아니라
-- **calendars.owner_id**로 바꾼다. 소유자의 단일 출처는 원래 이쪽이고,
-- BEFORE UPDATE 시점에는 아직 예전 소유자가 들어 있어 두 update 모두 통과한다.
-- 일반 사용자가 스스로 OWNER로 올리는 것은 그대로 막힌다.
-- =============================================================================

create or replace function public.guard_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- service_role로 도는 서버 로직은 자체 검증한다
  if auth.uid() is null then
    return new;
  end if;

  if not exists (
    select 1 from public.calendars c
    where c.id = new.calendar_id and c.owner_id = auth.uid()
  ) then
    raise exception '역할 변경은 캘린더 소유자만 할 수 있습니다'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
