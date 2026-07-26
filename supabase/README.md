# Supabase 설정

## 1. 마이그레이션 적용

### CLI (권장)

```bash
npx supabase init
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### 대시보드에서 직접

SQL Editor에 `migrations/` 의 파일을 **파일명 순서대로** 붙여넣어 실행합니다.
순서가 중요합니다 (0001 → 0002 → 0003 → 0004).

| 파일 | 내용 |
|---|---|
| `20260726000100_init_schema.sql` | 테이블·타입·인덱스·트리거 (설계안 4장) |
| `20260726000200_membership_rules.sql` | 소유권 이전, 역할 변경, 탈퇴 규칙 (5.3) |
| `20260726000300_rls.sql` | 헬퍼 함수 + 전 테이블 RLS 정책 (5장) |
| `20260726000400_storage.sql` | 버킷 2개와 경로 기반 정책 |

`0004`는 `storage.objects`에 정책을 만들기 때문에 대시보드 SQL Editor(= `postgres` 역할)
에서 실행해야 합니다.

## 2. Auth 공급자

Authentication → Providers

- **Email** — 켬. 개발 중에는 "Confirm email"을 꺼두면 가입 즉시 로그인됩니다.
- **Google** — 클라이언트 ID/시크릿 등록
- **Apple** — Services ID / Team ID / Key ID / Private Key 등록

Authentication → URL Configuration → **Redirect URLs** 에 아래를 추가합니다.

```
calendar://auth-callback
exp://127.0.0.1:8081/--/auth-callback
```

두 번째 항목은 Expo Go/개발 서버용입니다. 실제 호스트·포트는 `expo start` 출력에 맞춰
조정하세요. 앱이 사용하는 값은 로그인 화면 진입 시
`features/auth/oauth.ts`의 `oauthRedirectTo`로 결정됩니다.

## 3. 확인

앱에서 회원가입 후:

- `auth.users`에 행 1개
- `public.profiles`에 같은 id로 행 1개 (트리거 `on_auth_user_created`)
- 홈 화면에 "참여 중인 캘린더 0개" — RLS를 통과한 조회가 정상 동작한다는 뜻

## 아직 없는 것

- Edge Functions (`invite/accept`, `events/mutate`, `push/dispatch`, `reminder/scan`)
- `activity_logs` / `notification_outbox` 적재 트리거 (6단계)
- 계정 삭제 RPC (8단계, 스토어 심사 필수)
