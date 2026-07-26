# 함께캘린더

가족·연인·친구·소모임이 하나의 캘린더를 공유하고, 일정마다 대화 스레드를 갖는 모바일 앱.

Expo (React Native) + Supabase. 설계안 11장의 **1단계** — Supabase 스키마 · RLS · Auth,
그리고 로그인이 동작하는 앱 셸 — 까지 구현되어 있습니다.

## 지금 되는 것

- 이메일 회원가입/로그인, Google 로그인, Apple 로그인(iOS)
- 가입 시 `profiles` 자동 생성, 세션 영속화 및 자동 갱신
- 로그인 여부에 따른 라우팅 가드, 로그아웃
- 전체 DB 스키마 + RLS 정책 + Storage 정책 마이그레이션

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

`migrations/`는 `db:start` 때 자동 적용됩니다. 이메일 확인이 꺼져 있어 가입하면 바로
로그인되고, 홈에서 "참여 중인 캘린더 0개"가 보이면 인증 → RLS 경로가 정상입니다.
DB 상태는 Studio(`http://127.0.0.1:54323`)에서 볼 수 있습니다.

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
supabase/migrations/      스키마 · RLS · Storage
docs/design-notes.md      설계안 대비 변경점과 남은 결정
```

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
| `npm run db:types` | 실제 스키마에서 DB 타입 재생성 |

## 다음 단계

설계안 11장 기준 2단계 — 캘린더 생성, 초대 링크 발급/수락(Edge Function), 구성원 관리.
