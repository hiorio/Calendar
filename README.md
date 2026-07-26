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

## 시작하기

### 1. Supabase 프로젝트 준비

`supabase/README.md`의 순서대로 마이그레이션을 적용하고 Auth 공급자를 설정합니다.

### 2. 환경변수

```bash
cp .env.example .env
```

`.env`에 프로젝트 URL과 anon key를 채웁니다. 값을 바꾼 뒤에는 개발 서버를 다시 시작해야
합니다(`EXPO_PUBLIC_*`는 번들 타임에 주입됩니다).

### 3. 실행

```bash
npm install
npx expo start
```

Google/Apple 로그인은 커스텀 스킴(`calendar://`)이 필요하므로 Expo Go가 아닌
[개발 빌드](https://docs.expo.dev/develop/development-builds/introduction/)에서 테스트하세요.
이메일 로그인은 Expo Go에서도 동작합니다.

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
| `npm start` | 개발 서버 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

## 다음 단계

설계안 11장 기준 2단계 — 캘린더 생성, 초대 링크 발급/수락(Edge Function), 구성원 관리.
