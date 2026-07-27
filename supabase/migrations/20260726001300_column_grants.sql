-- =============================================================================
-- 0013 · 컬럼 단위 UPDATE 권한 (보안 하드닝)
--
-- **RLS UPDATE 정책은 "이 행을 고칠 수 있나"만 본다. "어느 컬럼을"은 보지 않는다.**
-- 그래서 정책의 USING/WITH CHECK가 참조하지 않는 컬럼은 사실상 무방비였다.
--
-- 실제로 뚫렸던 것들:
--
--   1) calendar_members  — 정책이 `user_id = auth.uid()`만 본다. 내 멤버십 행의
--      `calendar_id`를 남의 캘린더 UUID로 바꾸면 그 캘린더 구성원이 된다.
--      초대 절차가 통째로 우회된다. `guard_member_role_change`는
--      `before update of role`이라 role을 건드리지 않으면 발동하지도 않는다.
--
--   2) calendar_invites  — 작성자는 `revoked_at`만 만지라고 만든 정책인데
--      `calendar_id`도 바꿀 수 있다. 내 캘린더에 초대를 만들고 남의 캘린더로
--      돌린 뒤 스스로 수락하면 역시 합류된다.
--
--   3) calendars         — 구성원 누구나 `deleted_at`을 채워 모두의 캘린더를
--      soft delete 할 수 있다. 이름·색만 열어 준다는 의도와 다르다.
--
--   4) event_comments    — 작성자가 `event_id`를 바꿔 남의 일정으로 댓글을
--      옮길 수 있다.
--
-- 정책을 더 촘촘히 쓰는 방법도 있지만, "이 컬럼은 클라이언트가 절대 못 바꾼다"는
-- 규칙은 **권한**으로 두는 편이 읽기 쉽고 빠뜨리기 어렵다. 정책은 행을 고르고
-- 권한은 컬럼을 고른다.
--
-- PostgREST는 PATCH 본문에 있는 컬럼만 UPDATE 문에 넣으므로, 아래 목록에 없는
-- 컬럼을 보내면 42501로 막힌다.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles — 닉네임과 아바타만
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant  update (nickname, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- calendars — 이름·색·커버, 그리고 소유권 이전
--
-- `owner_id`는 열어 둔다. 누가 바꿀 수 있는지는 `guard_calendar_owner_change`
-- 트리거(0009)가 `calendars.owner_id` 기준으로 판단한다.
-- `deleted_at`은 닫는다. 캘린더 soft delete는 마지막 1인이 나갈 때 트리거가 한다.
-- ---------------------------------------------------------------------------
revoke update on public.calendars from authenticated;
grant  update (name, color, cover_url, owner_id) on public.calendars to authenticated;

-- ---------------------------------------------------------------------------
-- calendar_members — 개인 설정만
--
-- `calendar_id`·`user_id`·`role`·`joined_at`은 클라이언트가 바꿀 수 없다.
-- 역할 변경은 소유권 이전 트리거(security definer)가 하므로 권한과 무관하게 돈다.
-- ---------------------------------------------------------------------------
revoke update on public.calendar_members from authenticated;
grant  update (muted, color) on public.calendar_members to authenticated;

-- 이 정책은 OWNER에게 남의 행 UPDATE를 열어 준다. 위 컬럼 제한이 걸린 지금은
-- "남의 알림을 대신 음소거한다"만 가능해지는데, 그건 하면 안 되는 일이다.
-- 역할 변경은 트리거가 하므로 이 정책은 남길 이유가 없다.
drop policy if exists "members: owner can update anyone" on public.calendar_members;

-- ---------------------------------------------------------------------------
-- calendar_invites — 취소만
-- ---------------------------------------------------------------------------
revoke update on public.calendar_invites from authenticated;
grant  update (revoked_at) on public.calendar_invites to authenticated;

-- ---------------------------------------------------------------------------
-- events — 내용과 시간. `created_by`는 잠근다.
--
-- `calendar_id`는 열어 둔다(다른 캘린더로 옮기기). 어디로 옮길 수 있는지는
-- 정책의 WITH CHECK `is_calendar_member(calendar_id)`가 이미 막고 있다.
-- `range_start`/`range_end`는 트리거가 유지하므로 주지 않는다.
-- ---------------------------------------------------------------------------
revoke update on public.events from authenticated;
grant  update (
  calendar_id, title, description, location, color,
  is_all_day, start_at, end_at, start_date, end_date, timezone,
  rrule, rrule_until, deleted_at
) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- event_exceptions — 좁히지 않는다.
--
-- 정책이 `can_access_event(event_id)`를 USING과 WITH CHECK 양쪽에서 본다.
-- 즉 행을 고르는 조건이 이미 "내가 볼 수 있는 일정"으로 묶여 있어서, 컬럼을
-- 더 잠가도 막을 것이 남지 않는다.
--
-- 게다가 클라이언트가 upsert 로 쓴다. PostgREST 의 upsert 는
-- `on conflict do update set <보낸 컬럼 전부>` 를 만들기 때문에 충돌 키
-- (event_id, original_start)에도 UPDATE 권한이 필요하다. 좁히면 42501 이 난다.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- device_tokens — 좁히지 않는다. (같은 이유)
--
-- 정책이 `user_id = auth.uid()` 를 양쪽에서 보므로 남의 토큰에는 손댈 수 없고,
-- 등록이 upsert 라 PK 컬럼까지 UPDATE 권한이 필요하다.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- event_comments — 내용과 soft delete. `event_id`·`user_id`는 잠근다.
-- ---------------------------------------------------------------------------
revoke update on public.event_comments from authenticated;
grant  update (content, deleted_at) on public.event_comments to authenticated;

-- ---------------------------------------------------------------------------
-- memos — 내용과 완료 여부
-- ---------------------------------------------------------------------------
revoke update on public.memos from authenticated;
grant  update (content, done) on public.memos to authenticated;

-- ---------------------------------------------------------------------------
-- 정리 — 좁힌 것과 좁히지 않은 것
--
--   좁혔다  profiles · calendars · calendar_members · calendar_invites ·
--           events · event_comments · memos
--           → 정책이 보지 않는 컬럼(`calendar_id`, `deleted_at`, `event_id`,
--             `created_by`, `id`)이 있어 실제로 뚫렸거나 뚫릴 수 있던 것들.
--
--   안 좁혔다  event_exceptions · device_tokens
--           → 정책이 USING/WITH CHECK 양쪽에서 행을 묶고 있고, 클라이언트가
--             upsert 로 쓰기 때문에 좁히면 동작이 깨진다.
--
-- **판단 기준은 "정책이 그 컬럼을 보는가"다.** 정책이 보는 컬럼은 권한으로 또
-- 막을 필요가 없고, 정책이 안 보는 컬럼은 권한으로 막아야 한다.
-- ---------------------------------------------------------------------------
