# Supabase 설정

두 가지 경로가 있습니다. 혼자 개발하며 기능을 확인하는 단계라면 **A(로컬)** 를 권합니다.

---

## A. 로컬 Supabase (Docker)

계정도, 클라우드 프로젝트도 필요 없습니다. Docker Desktop이 떠 있어야 합니다.

```bash
npm run db:start   # 첫 실행은 컨테이너 이미지를 받느라 오래 걸립니다 (수 GB)
npm run db:env     # 방금 뜬 URL/anon key를 .env에 기록
npm run web        # 또는 npm start
```

`db:start`가 끝나면 Studio(`http://127.0.0.1:54323`)에서 테이블·정책·Auth 사용자를
눈으로 확인할 수 있습니다.

`migrations/`는 `db:start`와 `db:reset` 때 **파일명 순서대로 자동 적용**됩니다.
스키마를 고쳤다면:

```bash
npm run db:reset   # 볼륨을 지우고 마이그레이션을 처음부터 다시 적용
npm run db:smoke   # RLS·트리거가 의도대로 도는지 확인
```

`db:reset` 직후 API가 502를 내면 Kong이 재시작된 컨테이너를 아직 못 잡은 것입니다.
`docker restart supabase_kong_calendar` 후 10초쯤 기다리면 됩니다.

`db:smoke`는 앱과 같은 경로(anon key + GoTrue + PostgREST)로만 접근해 RLS를 검증합니다.
테스트 사용자를 실제로 만드니 로컬에서만 쓰세요. 되돌리려면 `db:reset`.

로컬 설정은 `config.toml`에 있습니다. 이 프로젝트에서 손댄 값:

- `site_url` / `additional_redirect_urls` — 웹(8081)과 앱 스킴(`timeline://auth-callback`)
- `auth.email.enable_confirmations = false` (기본값) — 가입 즉시 로그인됩니다

| 명령 | 설명 |
|---|---|
| `npm run db:start` | 로컬 스택 기동 |
| `npm run db:stop` | 정지 |
| `npm run db:reset` | 초기화 후 마이그레이션 재적용 |
| `npm run db:status` | URL·키 확인 |
| `npm run db:env` | `.env`에 URL/anon key 기록 |
| `npm run db:types` | 대조용 `src/types/database.generated.ts` 생성 (진짜는 손으로 관리하는 `database.ts`) |

---

## B. 클라우드 프로젝트

### 1. 마이그레이션 적용

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

대시보드에서 직접 실행한다면 SQL Editor에 `migrations/`의 파일을 **파일명 순서대로**
붙여넣습니다.

| 파일 | 내용 |
|---|---|
| `20260726000100_init_schema.sql` | 테이블·타입·인덱스·트리거 (설계안 4장) |
| `20260726000200_membership_rules.sql` | 소유권 이전, 역할 변경, 탈퇴 규칙 (5.3) |
| `20260726000300_rls.sql` | 헬퍼 함수 + 전 테이블 RLS 정책 (5장) |
| `20260726000400_storage.sql` | 버킷 2개와 경로 기반 정책 |
| `20260726000500_grants.sql` | 테이블 권한. **없으면 RLS 이전에 42501로 막힌다** |
| `20260726000600_fix_calendar_insert_returning.sql` | 캘린더 생성 시 RETURNING 차단 수정 |
| `20260726000700_guest_first.sql` | 게스트(익명) 사용, 공유는 계정 필요 |
| `20260726000800_invites.sql` | 초대 미리보기·수락 RPC (`accept_invite`) |
| `20260726000900_fix_ownership_transfer.sql` | 소유권 이전이 자기 가드에 걸리던 버그 |
| `20260726001000_notification_triggers.sql` | 알림 큐 적재 트리거 |
| `20260726001100_activity_log.sql` | 활동 로그 적재 트리거 |
| `20260726001200_delete_account.sql` | 계정 삭제 (`delete_my_account`), 작성자 컬럼 nullable |
| `20260726001300_column_grants.sql` | **컬럼 단위 UPDATE 권한.** 없으면 초대 우회가 뚫린다 |
| `20260726001400_exception_completeness.sql` | 회차 종일 전환·알림·활동 누락 보완 |
| `20260727000100_calendar_palette.sql` | 확정한 12색 라벨 팔레트로 기존 기본색 변환 |
| `20260727000200_notification_delivery.sql` | 워커 claim·전송내역·리마인더 후보 RPC |
| `20260727000300_notification_worker_grants.sql` | outbox·전송내역의 service role 전용 권한 |

`0004`는 `storage.objects`에 정책을 만들기 때문에 SQL Editor(= `postgres` 역할)에서
실행해야 합니다.

> **목록을 손으로 관리하지 마세요.** 위 표는 설명용이고, 실제 적용은
> `npx supabase db push`가 `migrations/` 전체를 파일명 순서대로 적용합니다.
> 새 마이그레이션을 추가하면 이 표에도 한 줄 더하되, **표에 없다고 빠뜨리면 안 됩니다.**

### 2. Auth 공급자

Authentication → Providers

- **Anonymous sign-ins** — **켜야 합니다.** 이 앱은 가입 없이 게스트로 시작합니다.
  꺼져 있으면 앱이 계정 화면으로 떨어집니다.
- **Manual linking** — 켜야 게스트가 Google/Apple 계정을 *연결*(데이터 유지)할 수 있습니다.
  꺼져 있으면 소셜 가입 시 게스트 기록이 사라집니다.
- **Email** — 켬. 개발 중에는 "Confirm email"을 꺼두면 가입 즉시 로그인됩니다.
- **Google** — 클라이언트 ID/시크릿 등록
- **Apple** — Services ID / Team ID / Key ID / Private Key 등록

익명 로그인은 남용될 수 있으니 Rate Limits의 anonymous 항목도 함께 확인하세요.

Authentication → URL Configuration → **Redirect URLs**:

```
timeline://auth-callback
exp://127.0.0.1:8081/--/auth-callback
```

두 번째는 Expo Go/개발 서버용입니다. 실제 호스트·포트는 `expo start` 출력에 맞춰
조정하세요. 앱이 쓰는 값은 `features/auth/oauth.ts`의 `oauthRedirectTo`가 결정합니다.

---

## 동작 확인

앱에서 회원가입한 뒤:

- `auth.users`에 행 1개
- `public.profiles`에 같은 id로 행 1개 (트리거 `on_auth_user_created`)
- 홈 화면에 "참여 중인 캘린더 0개" — RLS를 통과한 조회가 정상이라는 뜻

## 푸시 워커

`functions/notification-worker`가 outbox 전송, 재시도, ticket/receipt 확인,
`DeviceNotRegistered` 토큰 비활성화와 리마인더 스캔을 처리합니다. 로컬 스택에 함수
코드가 있다고 자동으로 주기 실행되지는 않습니다. Cloud 배포, secret, `pg_cron` 연결은
`docs/deployment.md`를 따르세요.

초대 수락(`accept_invite`)과 계정 삭제(`delete_my_account`)는 Edge Function 대신
security definer RPC로 구현했습니다. 이유는 `docs/design-notes.md` 12번을 보세요.
