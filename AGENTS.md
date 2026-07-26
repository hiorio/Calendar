# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 이 프로젝트

공유 캘린더 앱. Expo (React Native) + Supabase.

- 설계 기준 문서는 대화에서 받은 "공유 캘린더 앱 상세 설계안". 구현하며 바꾼 부분은
  `docs/design-notes.md`에 이유와 함께 기록한다.
- DB 스키마를 바꿀 때는 `supabase/migrations/`에 새 파일을 추가하고
  `src/types/database.ts`를 함께 갱신한다. 기존 마이그레이션은 수정하지 않는다.
- **테이블을 추가하면 RLS 정책뿐 아니라 GRANT도 줘야 한다.** Supabase 기본 권한에는
  SELECT/INSERT/UPDATE/DELETE가 없어서 정책만 쓰면 42501로 막힌다.
  `20260726000500_grants.sql`의 목록을 정책과 1:1로 유지할 것.
- 스키마·정책을 바꿨으면 `npm run db:reset && npm run db:smoke`로 확인한다.
- 시간 처리 원칙(설계안 3장)은 전역 규칙이다. 종일 일정은 타임존 변환 대상이 아니고,
  반복 전개는 `events.timezone` 기준으로 한다.
- **가입을 앞세우지 않는다.** 첫 실행은 게스트(익명) 세션으로 시작하고, 계정은 공유처럼
  꼭 필요한 순간에만 요구한다. 그 경계는 UI가 아니라 RLS로 강제한다
  (`is_guest()` 참고). 새 기능이 계정을 요구한다면 정책에도 함께 넣을 것.
- 화면 문구는 한국어.

- 디자인 토큰은 `src/constants/theme.ts` 하나뿐이다. 화면에 hex를 직접 쓰지 않는다.

- 일정의 시간 계산은 `src/lib/event-time.ts`, 반복은 `src/lib/recurrence.ts`,
  타임존 변환은 `src/lib/timezone.ts`. 화면에서 `start_at`/`start_date`나 RRULE
  문자열을 직접 만지지 않는다.
- 반복 전개는 **벽시계 기준**이다. 순간(UTC)으로 회차를 세면 서머타임에서 어긋난다.
- `events.rrule`을 바꾸면 `rrule_until`도 함께 다시 계산해야 한다
  (`computeRruleUntil`). 이 값이 기간 조회의 `range_end`가 된다.
- 순수 함수(반복·타임존·시간 보정)를 고쳤으면 `npm run test:unit`으로 확인한다.

현재 진행 단계: 4단계(반복 일정) 완료. 다음은 5단계.
