# TimeFlower

가족·연인·친구·소모임이 하나의 캘린더를 공유하고, 일정마다 대화 스레드를 갖는 모바일 앱.

Expo (React Native) + Supabase. 설계안 11장의 **1~8단계를 모두** 구현했습니다
(스키마·인증 → 캘린더·초대 → 일정 → 반복 → 참여자·댓글 → 알림 → 활동 → 계정 삭제).

> **개발 환경을 세우려면 [`docs/setup.md`](docs/setup.md)를 보세요.** 필요한 것,
> 첫 실행 순서, 확인 방법이 전부 있습니다. 클라우드 계정 없이 로컬에서 돌아갑니다.
> 작업 규칙은 [`AGENTS.md`](AGENTS.md), 설계안에서 바꾼 것과 이유는
> [`docs/design-notes.md`](docs/design-notes.md)에 있습니다.

## 지금 되는 것

**가입 없이 바로 시작합니다.** 앱을 켜면 게스트 세션이 발급되고 곧장 앱으로 들어갑니다.
계정은 공유처럼 실제로 필요해지는 순간에만 만듭니다.

- 게스트(익명) 세션 자동 발급, `profiles` 자동 생성
- 게스트 → 이메일 계정 전환 시 **쓰던 데이터 유지**
- 이미 있는 계정으로 로그인 (게스트 기록은 따라오지 않는다고 화면에서 고지)
- 캘린더 만들기 · 이름/색 수정 · 필터 칩으로 표시 전환
- 초대 링크 발급/공유/취소, 링크로 참여 (미리보기 → 수락)
- 구성원 목록, 내보내기, 소유권 이전, 나가기
- 공유(초대 링크 발급·수락)는 계정이 있어야 가능 — UI가 아니라 RLS로 강제
- 일정 추가·수정·삭제. 종일/시간 지정, 장소, 메모
- 반복 일정(매일·매주·매월·매년), 회차별 수정·삭제
- 일정 참여자 지정, 일정 댓글(본인 것 삭제)
- 월간 격자에 일정 칩, 선택한 날의 일정 목록
- 알림 큐 — 일정 등록·변경·삭제와 댓글이 DB 트리거로 쌓인다. 캘린더별 음소거,
  일정별 미리 알림. Expo Push 발송·재시도·영수증 확인 워커까지 구현되어 있다
- 활동 내역 — 누가 무엇을 바꿨는지 시간순으로. 항목에서 일정으로 바로 이동
- 계정 삭제 — 무엇이 넘어가고 무엇이 사라지는지 미리 보여 준 뒤 처리
- 전체 DB 스키마 + RLS 정책 + 권한(GRANT) + Storage 정책 마이그레이션

> **로컬 기본 환경에서는 원격 알림을 보내지 않습니다.** 발송 워커는 구현되어 있지만
> 실제 전송에는 Expo EAS 프로젝트와 클라우드 Supabase 설정이 필요합니다.
> `docs/deployment.md`의 값을 연결한 개발 빌드에서는 Expo Push 발송·재시도·영수증
> 확인까지 동작합니다. Expo Go가 아니라 development build로 확인합니다.

## 로컬에서 확인하기

### 화면만 보기 (백엔드 불필요)

```bash
npm install
npm run web
```

브라우저에서 `http://localhost:8081`. Supabase 설정이 없으면 로그인 화면에 안내 배너가
뜨고 버튼은 비활성화됩니다. 레이아웃·문구 확인은 이 상태로도 됩니다.

### 로그인까지 실제로 돌려보기 (Docker 필요)

Docker Desktop을 켠 뒤:

```bash
npm run db:start   # 로컬 Supabase. 첫 실행은 이미지 내려받느라 오래 걸립니다
npm run db:env     # 방금 뜬 URL/anon key를 .env에 기록
npm run web        # 환경변수 반영을 위해 개발 서버를 새로 띄웁니다
```

`migrations/`는 `db:start` 때 자동 적용됩니다. 브라우저를 열면 로그인 화면 없이 바로
캘린더 화면이 떠야 정상입니다. 설정 탭에서 계정을 만들면 게스트 기록을 유지한 채
정식 계정으로 바뀝니다. DB 상태는 Studio(`http://127.0.0.1:54323`)에서 볼 수 있습니다.

RLS·트리거·게스트 흐름은 `npm run db:smoke`, 반복·타임존 같은 순수 계산은
`npm run test:unit`으로 확인합니다. 통과해야 할 개수는 `AGENTS.md`의 표에 있습니다.

클라우드 프로젝트 연결은 `supabase/README.md`를 보세요. 현재 배포에서는 소셜 로그인을
노출하지 않으며 이메일 계정 생성과 로그인만 제공합니다.

### 기기/시뮬레이터에서

```bash
npm start          # QR 코드 → Expo Go 또는 개발 빌드
```

## 구조

```
src/
  app/                    Expo Router 라우트
    (app)/                하단 4탭 (캘린더 · 추가 · 활동 · 설정)
    account.tsx           가입/로그인 (모달)
    calendars.tsx         내 캘린더 목록 (모달)
    calendar-new.tsx      캘린더 만들기 (모달)
    calendar/[id].tsx     캘린더 설정 · 구성원 · 초대
    join.tsx              초대 링크 수락 (?code=...)
    event-new.tsx         일정 추가 (?date=YYYY-MM-DD)
    event/[id].tsx        일정 수정 · 삭제
  features/
    auth/                 세션 컨텍스트, OAuth
    calendar/             월간 뷰
    calendars/            캘린더·구성원·초대 쿼리
    events/               일정 쿼리와 공용 폼
    profile/              내 프로필 조회
  stores/                 Zustand (캘린더 표시 필터)
  lib/
    date.ts               달력 격자용 날짜 (화면 좌표)
    event-time.ts         일정의 시간 의미 (설계안 3장)
    recurrence.ts         RRULE 생성 · 전개 · 회차 예외
    timezone.ts           IANA 벽시계 ↔ 순간 변환
    supabase.ts           클라이언트, confirm.ts, env.ts
  types/database.ts       DB 스키마 타입 (마이그레이션과 1:1)
supabase/migrations/      스키마 · RLS · 권한 · Storage
scripts/                  스모크 · 단위 테스트, .env 생성
docs/setup.md             개발 환경 설정 ← 처음이면 여기부터
docs/design-notes.md      설계안 대비 변경점과 남은 결정
docs/design-decisions.md  UI 시안 결정 사항 ← 색을 만지기 전에
docs/design/ui-proposal.html  시안 원본 (브라우저로 열기)
docs/external-calendars.md  타 서비스 캘린더 가져오기 설계 (미구현)
```

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm start` | 개발 서버 (QR) |
| `npm run web` | 브라우저에서 실행 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm run test:unit` | 순수 함수 검사 (반복 · 타임존 · 시간 보정 · 조사) |
| `npm run icons` | 앱 아이콘 재생성 (`scripts/make-icons.mjs`) |
| `npm run db:start` / `db:stop` | 로컬 Supabase 기동 / 정지 |
| `npm run db:reset` | 초기화 후 마이그레이션 재적용 |
| `npm run db:env` | 로컬 Supabase 값을 `.env`에 기록 |
| `npm run db:smoke` | RLS·트리거 스모크 테스트 (로컬 전용) |
| `npm run db:types` | 실제 스키마에서 DB 타입 재생성 |
| `npm run deploy:check` | EAS/Supabase 배포 환경값 검사 |
| `npm run links:generate` | iOS 유니버설 링크 연결 파일 생성 |
| `npm run sentry:upload-update` | EAS Update의 `dist` 소스맵을 Sentry에 업로드 |

## 디자인

`src/constants/theme.ts`가 유일한 색·간격·타이포 출처입니다. 화면에 hex를 직접 쓰지 않습니다.
공통 컴포넌트는 `src/components/ui/`에 있습니다 (Screen · Card · Button · ListRow · Field ·
Segmented · EmptyState · Notice · Txt).

월간 뷰는 `src/features/calendar/month-view.tsx`입니다. 한국 달력 관례대로 일요일은 빨강,
토요일은 파랑이고, 달을 넘길 때 격자가 출렁이지 않도록 항상 6주를 그립니다.
**홈 화면에는 서비스명을 두지 않습니다** — 그 자리에는 지금 보고 있는 달이 옵니다.

UI 시안이 별도로 끝나 있습니다 — 브랜드 3안 중 **살구**를 기본으로 확정했고,
필수·중요 범위 16화면과 라벨 팔레트 12색을 정했습니다.
[`docs/design/ui-proposal.html`](docs/design/ui-proposal.html)을 브라우저로 열면 봅니다.
앱 아이콘과 스플래시는 그 색으로 이미 적용돼 있습니다.

화면에도 같은 살구 토큰과 12색 캘린더 라벨 팔레트를 적용했습니다. 라벨은 DB에 light 값을
저장하고, 화면의 밝기에 따라 대응하는 배경·글자 쌍을 사용합니다.
살구를 기본값으로 두고 설정에서 쪽빛·먹빛 테마를 기기별로 선택할 수 있습니다.

## 배포 준비

EAS의 development/preview/production 프로필, 환경별 앱 식별자, Supabase Edge Function
알림 워커, 반복 일정 리마인더 스캔, Expo ticket/receipt 처리, 유니버설 링크 구성이
코드에 들어 있습니다.

실제 iOS 배포에는 저장소가 정할 수 없는 Expo/Supabase/Sentry 계정, 고유 bundle ID,
HTTPS 도메인과 Apple 서명 인증서가 필요합니다. 연결 순서는
[`docs/deployment.md`](docs/deployment.md)에 있습니다.

그 밖에 미룬 것들은 [`docs/design-notes.md`](docs/design-notes.md)에 이유와 함께
적어 뒀습니다 (댓글 반응, 첨부 이미지, 프로필 수정, "이후 모두 수정" 등).
