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
| 마이그레이션 · RLS · 정책 | `npm run db:reset && npm run db:smoke` (140개) |
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
- **RLS UPDATE 정책은 "이 행"만 보고 "어느 컬럼"은 보지 않는다.** 정책이 참조하지 않는
  컬럼은 무방비다 — 실제로 `calendar_members.calendar_id`를 바꿔 초대를 우회할 수
  있었다. 컬럼 단위 GRANT(`0013`)로 막는다. 새 테이블·컬럼을 더할 때
  **"정책이 이 컬럼을 보는가"**를 먼저 묻고, 안 보면 GRANT에서 빼라.
- 클라이언트가 upsert 로 쓰는 테이블은 컬럼을 좁히면 안 된다. PostgREST 의 upsert 는
  충돌 키까지 UPDATE 권한을 요구한다 (`event_exceptions`, `device_tokens`).

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

## 디자인

UI 시안 작업이 따로 끝나 있다. **`docs/design-decisions.md`를 먼저 읽을 것.**

- 서비스명은 **TimeFlower**, 테마는 **베이지 지면 + 테라코타**다. `theme.ts`에 반영돼
  있고 앱 아이콘(`npm run icons`)이 같은 색을 쓴다. **한쪽만 고치지 말 것.**
- **색 값은 눈으로 고른 게 아니라 대비를 계산해 남긴 값이다.** 지면이 흰색이 아니라
  베이지라 여유가 얇다 — 고칠 거면 `docs/design-notes.md`의 대비 표를 다시 돌리고
  그 표도 같이 갱신할 것.
- 라벨 팔레트는 아직 8색이다(시안은 12색 · `design-decisions.md` 5.3). 크롬 토큰(5.2)도
  아직 없다.
- 시안은 `docs/design/ui-proposal.html` — 브라우저로 열면 된다. 외부 의존 없는 단일 파일.
  **옛 이름·옛 색(살구)으로 그려져 있다.**
- **간격·라운드·타이포는 바꾸지 않는다.** 시안이 현재 값 위에 그려졌다. 색만 바뀐다.
- 캘린더 라벨 팔레트는 **순서가 규칙이다.** 명도가 번갈아 가도록 배열해서 순서대로
  배정하면 인접한 캘린더가 흑백에서도 갈린다. 순서를 바꾸지 말 것.
- 라벨 색은 테마를 따라가지 않는다(밝기는 따라간다). 브랜드가 아니라 데이터 부호다.

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

## 계정과 데이터 수명

- 작성자 컬럼(`events.created_by`, `event_comments.user_id` 등)은 **nullable**이다.
  계정을 지우면 NULL이 되고 화면은 "알 수 없는 사용자"로 표시한다. 새 화면에서
  작성자를 쓸 때 NULL을 가정할 것.
- 계정 삭제는 `delete_my_account()` 한 함수가 처리한다. 소유 캘린더는 남은 구성원이
  있으면 넘기고, 혼자면 지운다.
- **로그아웃도 계정 삭제도 로그인 화면에 가두지 않는다.** 끝나면 새 게스트 세션으로
  돌아간다 (`AuthProvider`). 세션이 잠깐 null 인 사이 `(app)` 레이아웃이 계정 화면으로
  보내므로, **끝난 뒤 `router.replace('/')` 로 돌려놓는 것까지가 한 세트다.**
- **사용자가 바뀌면 쿼리 캐시를 비운다.** 쿼리 키에 사용자 id 가 없어서, 기존 계정으로
  로그인하면(세션이 null 을 거치지 않는다) 이전 사용자의 캘린더·일정이 그대로 넘어간다.
  판단은 `AuthProvider` 한 곳에서만 한다 — 키마다 id 를 넣는 방식은 하나만 빠뜨려도
  같은 사고가 난다.

현재 진행 단계: 설계안 11장 1~8단계 완료. UI 시안은 필수·중요 범위까지 완료.
브랜드(이름 · 색 토큰 · 아이콘)는 반영 완료. 남은 것은 라벨 12색 팔레트와 크롬 토큰,
알림 발송 워커, 유니버설 링크.
