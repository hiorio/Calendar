-- =============================================================================
-- 0006 · 캘린더 생성 시 RETURNING이 막히는 문제 수정
--
-- 증상: 구성원이 캘린더를 만들면
--   "new row violates row-level security policy for table calendars"
--
-- 원인: PostgREST는 삽입 결과를 돌려주려고 항상 RETURNING을 붙인다
-- (supabase-js의 `.insert().select()`). PostgreSQL은 RETURNING 행에 SELECT 정책을
-- 적용하는데, OWNER 구성원 행을 만드는 on_calendar_created는 AFTER INSERT 트리거라
-- 그 시점엔 아직 실행되지 않았다. 즉 is_calendar_member(id)가 false다.
-- (RETURNING 없는 INSERT는 성공한다 — 확인함)
--
-- 해결: 소유자는 구성원 행과 무관하게 자기 캘린더를 볼 수 있게 한다.
-- 의미상으로도 맞다. 소유권 이전 시 owner_id가 함께 바뀌므로 권한이 남지 않는다.
-- =============================================================================

drop policy "calendars: member can read" on public.calendars;

create policy "calendars: member or owner can read" on public.calendars
  for select to authenticated
  using (
    deleted_at is null
    and (owner_id = auth.uid() or public.is_calendar_member(id))
  );
