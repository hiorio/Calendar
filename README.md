# 함께캘린더

가족·연인·친구·소모임이 하나의 캘린더를 공유하고, 일정마다 대화 스레드를 갖는 모바일 앱.

Expo (React Native) + Supabase. 설계안 11장의 **1단계** — Supabase 스키마 · RLS · Auth,
그리고 로그인이 동작하는 앱 셸 — 까지 구현되어 있습니다.

## 지금 되는 것

**가입 없이 바로 시작합니다.** 앱을 켜면 게스트 세션이 발급되고 곧장 앱으로 들어갑니다.
계정은 공유처럼 실제로 필요해지는 순간에만 만듭니다.

- 게스트(익명) 세션 자동 발급, `profiles` 자동 생성
- 게스트 → 계정 전환 시 **쓰던 데이터 유지** (이메일/비밀번호 또는 Google·Apple 연결)
- 이미 있는 계정으로 로그인 (게스트 기록은 따라오지 않는다고 화면에서 고지)
- 초대 링크 발급은 계정이 있어야 가능 — UI가 아니라 RLS로 강제
- 전체 DB 스키마 + RLS 정책 + 권한(GRANT) + Storage 정책 마이그레이션

아직 비어 있는 탭(캘린더 / 추가 / 활동)은 어느 단계에서 채워지는지만 표시합니다.

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
홈("안녕하세요, 나님")이 떠야 정상입니다. 설정 탭에서 계정을 만들면 게스트 기록을 유지한 채
정식 계정으로 바뀝니다. DB 상태는 Studio(`http://127.0.0.1:54323`)에서 볼 수 있습니다.

RLS·트리거·게스트 흐름은 `npm run db:smoke`로 한 번에 확인할 수 있습니다.

클라우드 프로젝트를 쓰거나 Google/Apple 로그인까지 확인하려면 `supabase/README.md`를
보세요. 소셜 로그인은 커스텀 스킴(`calendar://`)을 쓰므로 Expo Go가 아닌
[개발 빌드](https://docs.expo.dev/develop/development-builds/introduction/)가 필요합니다.

### 기기/시뮬레이터에서

```bash
npm start          # QR 코드 → Expo Go 또는 개발 빌드
```

## 구조

```
src/
  app/                    Expo Router 라우트
    (auth)/sign-in.tsx    로그인 / 회원가입
    (app)/                로그인 필요 — 하단 5탭 (홈·캘린더·＋·활동·설정)
  features/
    auth/                 세션 컨텍스트, OAuth
    profile/              내 프로필 조회
  lib/                    supabase 클라이언트, 환경변수
  types/database.ts       DB 스키마 타입 (마이그레이션과 1:1)
supabase/migrations/      스키마 · RLS · 권한 · Storage
docs/design-notes.md      설계안 대비 변경점과 남은 결정
docs/external-calendars.md  타 서비스 캘린더 가져오기 설계 (미구현)
```

## 디자인

`src/constants/theme.ts`가 유일한 색·간격·타이포 출처입니다. 화면에 hex를 직접 쓰지 않습니다.
공통 컴포넌트는 `src/components/ui/`에 있습니다 (Screen · Card · Button · ListRow · Field ·
Segmented · EmptyState · Notice · Txt).

월간 뷰는 `src/features/calendar/month-view.tsx`입니다. 한국 달력 관례대로 일요일은 빨강,
토요일은 파랑이고, 달을 넘길 때 격자가 출렁이지 않도록 항상 6주를 그립니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm start` | 개발 서버 (QR) |
| `npm run web` | 브라우저에서 실행 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm run db:start` / `db:stop` | 로컬 Supabase 기동 / 정지 |
| `npm run db:reset` | 초기화 후 마이그레이션 재적용 |
| `npm run db:env` | 로컬 Supabase 값을 `.env`에 기록 |
| `npm run db:smoke` | RLS·트리거 스모크 테스트 (로컬 전용) |
| `npm run db:types` | 실제 스키마에서 DB 타입 재생성 |

## 다음 단계

설계안 11장 기준 2단계 — 캘린더 생성, 초대 링크 발급/수락(Edge Function), 구성원 관리.
