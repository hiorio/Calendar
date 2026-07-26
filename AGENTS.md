# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 이 프로젝트

공유 캘린더 앱. Expo (React Native) + Supabase.

설계 기준 문서는 대화에서 받은 "공유 캘린더 앱 상세 설계안". 구현하며 바꾼 부분은
`docs/design-notes.md`에 이유와 함께 기록한다.

## 시작하기 (처음이라면 이것부터)

환경 설정은 **`docs/setup.md`**에 전부 있다. 요약하면:

```bash
npm install && npm run db:start && npm run db:env && npm run db:reset
```

- **Docker Desktop이 켜져 있어야 한다.** 로컬 Supabase가 컨테이너로 뜬다.
- **Node 24 권장**(최소 22.18). `npm run test:unit`이 빌드 없이 `.ts`를 직접 실행한다.
- `.env`는 커밋되지 않는 생성물이다. `npm run db:env`가 만든다. 값을 손으로 적지 말 것.
- 클라우드 Supabase 프로젝트는 필요 없다. 전부 로컬에서 돈다.

개발 서버는 셸에서 직접 띄우지 않는다. `.claude/launch.json`의 `web` 설정을 preview
도구로 실행한다 (포트 8081).

## 고쳤으면 돌릴 것

커밋 전에 해당하는 것을 **전부** 통과시킨다.

| 바꾼 것 | 확인 |
|---|---|
| 아무거나 | `npm run lint` · `npm run typecheck` |
| 마이그레이션 · RLS · 정책 | `npm run db:reset && npm run db:smoke` (107개) |
| `src/lib/`의 계산 로직 | `npm run test:unit` (40개) |
| 화면 | 웹 미리보기에서 직접 눌러 볼 것 |

## DB

- 스키마를 바꿀 때는 `supabase/migrations/`에 **새 파일을 추가**하고
  `src/types/database.ts`를 함께 갱신한다. 기존 마이그레이션은 수정하지 않는다.
- **테이블을 추가하면 RLS 정책뿐 아니라 GRANT도 줘야 한다.** Supabase 기본 권한에는
  SELECT/INSERT/UPDATE/DELETE가 없어서 정책만 쓰면 42501로 막힌다.
  `20260726000500_grants.sql`의 목록을 정책과 1:1로 유지할 것.
- PostgREST 임베드는 두 테이블 사이 경로가 둘 이상이면 300으로 막힌다. 정션이 될 수
  있는 테이블을 추가했으면 기존 `select=…profiles(...)` 쿼리를 다시 확인할 것.

## 시간 처리 (설계안 3장 — 전역 규칙)

- 일정의 시간 계산은 `src/lib/event-time.ts`, 반복은 `src/lib/recurrence.ts`,
  타임존 변환은 `src/lib/timezone.ts`. 화면에서 `start_at`/`start_date`나 RRULE
  문자열을 직접 만지지 않는다.
- 종일 일정은 타임존 변환 대상이 아니다.
- 반복 전개는 `events.timezone`의 **벽시계 기준**이다. 순간(UTC)으로 회차를 세면
  서머타임에서 어긋난다.
- `events.rrule`을 바꾸면 `rrule_until`도 함께 다시 계산해야 한다
  (`computeRruleUntil`). 이 값이 기간 조회의 `range_end`가 된다.

## 제품 원칙

- **가입을 앞세우지 않는다.** 첫 실행은 게스트(익명) 세션으로 시작하고, 계정은 공유처럼
  꼭 필요한 순간에만 요구한다. 그 경계는 UI가 아니라 RLS로 강제한다
  (`is_guest()` 참고). 새 기능이 계정을 요구한다면 정책에도 함께 넣을 것.
- 디자인 토큰은 `src/constants/theme.ts` 하나뿐이다. 화면에 hex를 직접 쓰지 않는다.

## 알림

- **큐에 넣는 일은 DB 트리거가 한다**(`0010`). 클라이언트가 넣으면 앱이 죽을 때 알림이
  새고, anon key로 아무에게나 보낼 수 있게 된다. 새 알림 종류를 더할 때도 트리거로.
- 수신자에서 **행위자 본인과 `muted`를 뺀다.** 음소거는 화면 필터가 아니라 큐에
  들어가지 않는 것이다.
- `notification_outbox`는 클라이언트에 완전히 닫혀 있다. 스모크 테스트에서 이 테이블만
  service_role로 읽는다 — 발송 워커와 같은 경로다.
- **발송 워커는 아직 없다.** 큐는 쌓이기만 한다. 화면에도 그렇게 적혀 있으니 "알림이
  간다"고 바꾸지 말 것.

## 활동 로그

- 알림(`0010`)과 **규칙이 다르다.** 활동은 "무슨 일이 있었나"라서 **본인 행동도 남기고
  음소거와 무관하며 메모만 고쳐도 남는다.** 두 트리거를 합치지 말 것.
- `activity_logs`는 클라이언트에게 읽기 전용이다. 쓰기는 security definer 트리거만.

## 화면 문구

- 한국어. 조사는 `src/lib/korean.ts`로 골라 쓴다. `을(를)` 같은 표기를 두지 않는다.

현재 진행 단계: 7단계(활동 로그) 완료. 다음은 8단계(계정 삭제)와 알림 발송 워커.
