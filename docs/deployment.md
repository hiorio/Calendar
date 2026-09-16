# iOS 개발 배포와 운영 연결

이 문서는 로컬 Docker 단계를 지나 TestFlight/내부 배포가 가능한 iOS 앱과 운영 환경을
만드는 순서입니다. Android 빌드와 배포는 범위에 포함하지 않습니다.

앱에는 첫 빌드 뒤 네이티브 재빌드를 줄이기 위한 모듈과 EAS Update 설정이 들어 있습니다.
Expo/Supabase/Sentry 계정, 고유 bundle ID, 도메인, Apple 서명은 소유자가 연결해야 하므로
저장소에 넣지 않습니다.

## 1. 환경 분리

| 환경 | 용도 | Supabase | iOS bundle ID 예시 |
|---|---|---|---|
| preview | 개발자·테스터 설치 | 별도 프로젝트 | `com.company.timeline.preview` |
| production | 실제 사용자 | 별도 프로젝트 | `com.company.timeline` |

preview와 production이 같은 DB를 쓰면 테스트 데이터·마이그레이션·푸시가 실제 사용자에게
영향을 줍니다. Supabase 프로젝트와 빌드 환경 변수, OAuth redirect URL을 분리합니다.

## 2. 첫 iOS 빌드에 포함된 네이티브 범위

첫 바이너리에 다음 모듈을 포함합니다.

| 모듈 | 준비한 용도 |
|---|---|
| `expo-updates` | EAS Update OTA 수신 |
| `expo-calendar` | 기기 캘린더 가져오기 |
| `expo-image-picker` | 사진 첨부 |
| `expo-document-picker`, `expo-file-system` | 파일 선택·처리 |
| `expo-sharing` | 일정/파일을 iOS 공유 시트로 내보내기 |
| `expo-secure-store` | 향후 작은 보안 값 저장 |
| `expo-application` | 앱 버전·설치 정보 확인 |
| `@sentry/react-native` | 네이티브 크래시와 OTA 오류 수집 |
| `@react-native-google-signin/google-signin` | iOS 네이티브 Google 로그인 |

사진은 보관함 읽기만 선언하고 카메라·마이크 권한은 넣지 않았습니다. 기기 캘린더는
가져오기를 위해 읽기 권한을 선언했습니다. 현재 앱이 사용하지 않는 권한을 미리 넓게
요청하지 않습니다.

`expo-sharing`의 config plugin은 다른 앱에서 TimeFlower로 파일을 보내는 Share Extension을
추가합니다. 현재 요구는 앱에서 iOS 공유 시트를 여는 것이므로 모듈만 포함하고 extension은
만들지 않습니다.

`expo-secure-store`도 네이티브 모듈만 포함합니다. Supabase 세션 전체는 크기가 커질 수
있어 지금처럼 AsyncStorage에 유지하고, 작은 토큰 또는 청크 저장 어댑터가 필요해질 때
OTA로 연결합니다.

## 3. Supabase Cloud

Supabase 프로젝트를 만든 뒤 CLI로 연결합니다.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy notification-worker --no-verify-jwt
```

Dashboard의 Authentication에서 다음을 설정합니다.

- Anonymous sign-ins: 켬
- Manual linking: 켬
- Email: 켬. production은 이메일 확인과 SMTP 설정 권장
- Redirect URLs:
  - `timeline-preview://auth-callback` 또는 `timeline://auth-callback`
  - 배포한 웹 주소의 `/auth-callback`
- Google/Apple을 쓸 경우 각 공급자의 클라이언트 정보 등록

### Google 로그인

1. Google Auth Platform에서 운영 bundle ID(`com.hiorio.timeline`)용 OAuth 클라이언트를
   **iOS** 유형으로 만듭니다. preview 앱을 실제 기기에서 시험한다면 preview bundle ID용
   iOS 클라이언트도 별도로 만듭니다.
2. iOS 클라이언트 ID를 빌드 환경의 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`에 등록합니다. 이 값은
   공개 식별자이며 앱 설정이 역방향 URL scheme을 자동 생성합니다.
3. Supabase Authentication → Providers → Google의 Client IDs에 기존 웹 클라이언트 ID와
   iOS 클라이언트 ID를 쉼표로 함께 넣고 `Skip nonce checks`를 켭니다. Google iOS SDK는
   Supabase가 검증할 요청 nonce를 앱에 제공하지 않기 때문입니다. 기존 웹 Client Secret은
   그대로 사용합니다.
4. 네이티브 앱은 Google SDK에서 받은 ID token을 `signInWithIdToken()`으로 Supabase에
   전달합니다. 따라서 iPhone 로그인 화면에는 Supabase 프로젝트 주소가 표시되지 않습니다.
5. Google 동의 화면의 scope는 `openid`, 이메일, 기본 프로필만 둡니다. 캘린더 scope는
   로그인에 섞지 않고 외부 캘린더 연동을 구현할 때 별도 동의로 받습니다.

네이티브 모듈이므로 Expo Go에서는 실행되지 않습니다. 클라이언트 ID나 URL scheme을 바꾸면
OTA가 아니라 새 iOS 바이너리를 빌드해야 합니다. 웹 빌드는 기존 Supabase PKCE OAuth를
계속 사용하며 웹 클라이언트의 callback URL도 유지합니다.

### Apple 로그인

1. 각 iOS bundle ID의 App ID에서 Sign in with Apple capability를 켭니다.
2. iOS 네이티브 로그인만 쓸 때는 Supabase Apple provider의 Client IDs에 해당 App ID를
   넣습니다. preview와 production bundle ID를 모두 허용해야 두 앱에서 테스트할 수 있습니다.
3. 웹 OAuth도 제공한다면 Services ID를 만들고, Apple Website URLs의 return URL에
   `https://<project-ref>.supabase.co/auth/v1/callback`을 등록합니다. Supabase Client IDs에는
   **Services ID를 첫 번째**, 네이티브 App ID들을 그 뒤에 쉼표로 넣습니다.
4. Apple OAuth용 client secret은 최대 6개월이므로 웹 OAuth를 켰다면 만료 전 교체 일정을
   별도로 관리합니다. 현재 iOS 앱의 네이티브 ID token 로그인 자체에는 이 회전 작업이
   필요하지 않습니다.

### 출시 전 계정 분리 확인

- 게스트에서 Google/Apple `계정 연결` 후 사용자 id와 기존 캘린더가 유지되는지
- A 계정에서 로그아웃 후 B 계정으로 로그인했을 때 A의 캘린더·활동·알림이 보이지 않는지
- Google 계정 선택 화면에서 다른 테스트 계정 두 개를 실제로 선택할 수 있는지
- Apple의 `나의 이메일 가리기`와 두 번째 로그인(이름이 다시 오지 않음)에서도 프로필이
  정상인지
- 인증 창 취소, 네트워크 단절, 이미 다른 계정에 연결된 identity 오류가 데이터 손실 없이
  처리되는지

### 푸시 워커

충분히 긴 임의 문자열을 만들고, **같은 값**을 Edge Function과 Vault에
각각 등록합니다. 실제 값은 명령 히스토리·마이그레이션·저장소에 남기지
않습니다.

```bash
npx supabase secrets set WORKER_SECRET=<긴-임의-문자열>
```

Supabase SQL Editor에서 스케줄러가 읽을 세 값을 Vault에 넣습니다.
`publishable_key`는 Project Settings → API Keys의 publishable key입니다.

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<publishable-key>', 'publishable_key');
select vault.create_secret('<위의-같은-임의-문자열>', 'notification_worker_secret');
```

위 세 문장은 최초 생성용입니다. 같은 이름은 유일하므로 값을 회전할 때 새 행을 만들지
말고 기존 id로 갱신합니다.

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'notification_worker_secret'),
  new_secret := '<새-임의-문자열>'
);
```

이 경우 Edge Function의 `WORKER_SECRET`도 같은 값으로 함께 바꿉니다.

`20260903021118_notification_worker_scheduler.sql`이 `pg_cron`·`pg_net`을 켜고
`notification-worker-every-minute`을 등록합니다. Vault 값이 아직 없으면 작업은
외부 요청 없이 성공하고, 세 값이 모두 생긴 다음 1분부터 워커를 호출합니다.
다음 쿼리로 스케줄과 HTTP 200을 둘 다 확인합니다.

```sql
select jobname, schedule, active
from cron.job
where jobname = 'notification-worker-every-minute';

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'notification-worker-every-minute'
)
order by start_time desc
limit 5;

select status_code, timed_out, error_msg, content, created
from net._http_response
where content like '%"reminders"%'
  and content like '%"receipts"%'
order by created desc
limit 5;
```

응답의 `claimed: 0`은 워커가 도달 가능하다는 뜻일 뿐 실제 푸시 전송 성공은 아닙니다.
실기기 토큰을 등록한 뒤 알림을 하나 발생시켜 `notification_deliveries.ticket_id`와
receipt의 `DELIVERED`까지 확인해야 APNs/FCM 경로가 검증됩니다.

Expo Push Security를 켠 프로젝트라면 access token도 등록합니다.

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=<expo-access-token>
```

워커 배포, cron `succeeded`, `net._http_response.status_code = 200`을 확인하기
전에는 `EXPO_PUBLIC_PUSH_ENABLED=false`, 확인 후 `true`로 둡니다.

## 4. Expo 프로젝트와 로컬 Mac mini 빌드

EAS Update를 사용할 환경은 Expo 계정에 프로젝트를 연결합니다. 이 연결은 OTA 업데이트용이며
네이티브 바이너리를 EAS Build에서 만들기 위한 것이 아닙니다.

```bash
npx eas-cli login
npx eas-cli init
```

`expo-notifications` 설정만으로는 Expo Push Service가 APNs에 보낼 수 없습니다.
로컬 Mac mini에서 빌드하더라도 최초 1회는 각 bundle ID의 Push Key를 Expo
프로젝트에 연결합니다.

```bash
npx eas-cli credentials --platform ios
```

해당 환경·bundle ID를 고른 뒤 **Push Notifications → Set up**을 진행합니다.
이 명령은 푸시 인증 정보만 연결하며 EAS Build를 실행하지 않습니다. 실제
바이너리는 계속 Mac mini의 `expo prebuild → pod install → xcodebuild` 경로로
만듭니다. [Expo SDK 57 푸시 설정](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)의
credentials 요구사항을 기준으로 합니다.

OTA용 `development`, `preview`, `production` 환경에 환경별 값을 넣습니다.
`EXPO_PUBLIC_*` 값은 앱 번들에 포함되므로 서버 비밀값을 넣으면 안 됩니다.

```text
EAS_PROJECT_ID
APP_IOS_BUNDLE_IDENTIFIER
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
EXPO_PUBLIC_PUSH_ENABLED
EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL
EXPO_PUBLIC_SENTRY_DSN
SENTRY_ORG
SENTRY_PROJECT
```

Sentry 소스맵 업로드용 `SENTRY_AUTH_TOKEN`은 GitHub의 보호된 release environment 또는
Mac mini의 저장소 밖 권한 제한 파일에만 둡니다. 저장소나 로컬 `.env`에 커밋하지 않습니다.

환경값을 받은 상태에서 검사합니다.

```bash
npx eas-cli env:exec --environment preview "npm run deploy:check"
```

Mac mini의 Simulator 검증은 EAS 명령 밖에서 먼저 실행되므로 production의 공개 클라이언트
설정을 GitHub Actions에도 동기화합니다. Supabase anon key는 바이너리에 포함되는 공개 키지만
로그에서 마스킹되도록 GitHub secret으로 저장하고, 나머지는 repository variable로 둡니다.
다음 명령은 값을 출력하지 않습니다.

```bash
npx eas-cli@23.2.0 env:exec production \
  "node .github/scripts/sync-ios-runtime-env-to-github.mjs" \
  --non-interactive
```

네이티브 앱과 Widget Extension 검증은 로컬 Mac mini의 self-hosted runner에서 수행합니다.
EAS Build와 `eas build --local`은 사용하지 않습니다. 원격 작업 브랜치에 커밋이 있을 때:

```powershell
$branch = git branch --show-current
gh workflow run ios.yml --ref $branch
gh run list --workflow=ios.yml --branch $branch --limit 5
gh run watch <run-id> --exit-status
```

`.github/workflows/ios.yml`은 production 공개 설정을 임시 `.env.production.local`로 만든 뒤
`expo prebuild → pod install → xcodebuild`로 앱과 위젯을 Simulator용 로컬 서명으로 함께
컴파일합니다. 완성된 JS bundle에 Supabase URL과 anon key가 실제 포함됐는지 검사하고, 새
Simulator에서 앱을 처음 열어 익명 세션 생성 후 월간 캘린더에 도달해야만 통과합니다.
`Supabase 설정이 필요합니다`, `게스트로 시작할 수 없습니다`, 계정 만들기 화면 중 하나라도
보이면 즉시 실패합니다. App Group을 사용하는 위젯은 서명 없는 Simulator 빌드에서도 빈
화면이 되므로 이어서 실제 홈 화면에 추가해 6주 월간 격자를 캡처합니다. 내부
설치용 개발 빌드와 production archive도 같은 Mac mini에서 직접 서명해야 합니다. Apple
인증서와 프로파일을 연결한 별도 보호 workflow는 TestFlight 또는 실기기 배포를 명시적으로
요청했을 때만 실행합니다.

App Store용 archive와 TestFlight 업로드는 `.github/workflows/app-store.yml`을 수동으로
실행합니다. 이 workflow는 `app-store-production` environment와
`codex/timeline-release` 브랜치로 제한하고, 확인 문구와 빌드 번호를 입력받습니다. 앱과
위젯의 배포 인증서·프로비저닝 프로파일을 임시 keychain에만 설치하고 종료 시 복구합니다.
빌드는 Mac mini의 `expo prebuild → pod install → xcodebuild archive`로 만들며 EAS Build나
`eas build --local`을 호출하지 않습니다. 완성된 IPA의 업로드만 EAS Submit에 맡깁니다.

environment에는 다음 secret이 필요합니다. 인증 자료 원문은 저장소에 두지 않습니다.

```text
APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64
APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD
APPLE_APP_PROVISIONING_PROFILE_BASE64
APPLE_WIDGET_PROVISIONING_PROFILE_BASE64
EXPO_TOKEN
```

`EXPO_TOKEN`은 최소 권한의 별도 토큰을 권장합니다. 긴급 1회 실행에서만 로컬 Expo 로그인
상태를 `EXPO_AUTH_STATE_JSON`으로 임시 전달할 수 있으며, 실행 직후 environment secret을
삭제하고 runner의 기존 상태 파일을 복구합니다. App Store Connect 심사 제출은 업로드된
빌드가 처리 완료된 뒤 필요한 메타데이터와 빌드를 확인하고 별도로 수행합니다.

```powershell
gh workflow run app-store.yml --ref codex/timeline-release `
  -f confirmation=SUBMIT `
  -f build_number=29
```

## 5. EAS Update와 재빌드 기준

`app.config.ts`는 EAS project ID로 `updates.url`을 만들고
`runtimeVersion: { policy: "appVersion" }`을 사용합니다. 이 프로젝트는 EAS Build가 아닌
직접 Xcode 빌드이므로 `eas.json`만으로는 채널이 네이티브 파일에 주입되지 않습니다.
따라서 app config의 `updates.requestHeaders`에도 preview/production의
`expo-channel-name`을 명시하고, workflow가 생성된 `Expo.plist` 값을 검사합니다.

OTA 배포 예:

```bash
APP_VARIANT=preview npx eas-cli update --channel preview --environment preview --message "달력 화면 개선"
APP_VARIANT=production npx eas-cli update --channel production --environment production --message "1.0.0 수정"
```

`APP_VARIANT`를 생략하면 채널과 다른 앱 설정으로 번들할 수 있으므로 반드시 함께 지정합니다.
특히 production은 Supabase 공개 설정이 없으면 app config 생성 단계에서 중단합니다. 게시 전에는
같은 환경에서 iOS export를 만든 뒤 `npm run update:verify -- <export-directory>`로 실제 Hermes
번들과 manifest용 설정을 검사합니다.

다음 변경은 OTA만으로 전달할 수 없습니다. `app.json`의 `version`을 올리고 새 iOS 빌드를
만듭니다.

- 네이티브 패키지 추가·제거·버전 변경
- config plugin, iOS 권한 문구, entitlement, URL scheme 변경
- Expo SDK/React Native 업데이트
- 앱 아이콘·스플래시처럼 네이티브 번들에 들어가는 자산 변경

배포 전 네이티브 지문을 비교하면 실수로 OTA를 보낼지 새 빌드를 만들지 판단하기 쉽습니다.

```bash
npx eas-cli fingerprint:generate --platform ios --build-profile preview
```

JS/TS 화면·상태·쿼리 로직, 서버 API 사용 방식, 번들에 포함되는 일반 이미지 수정은 현재
runtime과 호환되는 범위에서 OTA로 보낼 수 있습니다.

## 6. Sentry

`EXPO_PUBLIC_SENTRY_DSN`이 비어 있으면 오류 수집은 꺼져 있습니다. 값을 연결하면
preview/production 환경과 EAS Update ID를 태그로 기록합니다. 개인정보는 기본 전송하지
않고 성능 샘플링은 5%로 시작합니다.

네이티브 release 빌드는 Mac mini의 보호된 `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT`로 소스맵을 업로드합니다. OTA를 배포한 뒤에도 해당 update의 JS
소스맵이 Sentry에 올라갔는지 확인합니다. `eas update`가 만든 `dist`를 같은 환경 변수로
업로드합니다.

```bash
npm run sentry:upload-update
```

## 7. iOS 유니버설 링크

`EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL`에는 HTTPS 원점만 넣습니다.

```text
https://calendar.example.com
```

앱 설정은 이 값으로 iOS `associatedDomains`와 초대 URL
`https://.../join?code=...`을 만듭니다.

다음 값을 준비하고 파일을 생성합니다.

```text
APPLE_TEAM_ID
APP_IOS_BUNDLE_IDENTIFIER
```

```bash
npm run links:generate
```

생성되는 `public/.well-known/apple-app-site-association`은 환경과 서명마다 달라 커밋하지
않습니다. HTTPS로 배포하고 `Content-Type: application/json`으로 제공되는지 확인한 뒤
associated domain이 들어간 iOS 앱을 빌드합니다.

## 8. 출시 전 확인

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:regression
npm run db:reset
npm run db:smoke
npm run db:regression
npm run deploy:check
```

실제 iPhone 두 대와 서로 다른 계정으로 확인합니다.

1. 초대 HTTPS 링크가 설치된 앱의 `/join`으로 열린다.
2. 일정 생성·수정·삭제와 댓글 알림이 상대 기기에 온다.
3. 리마인더가 지정 시각에 오고 알림을 누르면 일정 화면이 열린다.
4. 음소거한 캘린더는 푸시 큐에도 들어가지 않는다.
5. 로그아웃한 기기에 이전 사용자의 알림이 오지 않는다.
6. preview OTA는 preview 앱에만, production OTA는 production 앱에만 적용된다.
7. Sentry 테스트 오류가 올바른 환경·update ID와 함께 표시된다.

### 2026-09-05 결함 수정의 배포 경계 (아직 배포하지 않음)

`20260905120904_audited_server_defects.sql`과 변경된 `notification-worker`는 함께
검증·배포해야 합니다. 새 워커는 `begin_notification_delivery`, `SENDING` 상태,
`storage_cleanup_jobs`와 `claim_storage_cleanup`에 의존합니다. 이전 워커와 새
상태 처리가 섞이지 않도록 스케줄을 잠시 정지하고 진행 중 실행을 마친 뒤 마이그레이션,
함수 교체, 스케줄 재개 순서로 적용합니다. 변경을 저장소에 반영한 것만으로 운영 반영된
것은 아닙니다. cron HTTP 200, 각 기기의 ticket/receipt, 정리 큐의 재시도까지 확인합니다.

삭제된 첨부·캘린더·프로필 소유 Storage 경로는 서버 전용 큐에서 정리합니다. Storage
장애 시 경로를 잃지 않고 재시도하며, 큐를 클라이언트에 열지 않습니다. 이미 오래전에
행과 경로가 모두 지워진 고아 파일까지 추측해서 일괄 삭제하지는 않습니다.

Expo의 발송 수락 여부를 알 수 없는 응답 유실/프로세스 중단은 자동 중복 발송하지 않고
실패 사유를 남깁니다. 서버가 수락한 알림을 이후 계정 전환으로 회수할 수는 없습니다.

`expo-network`가 추가되어 완전한 네이티브 연결 복구 감지는 새 바이너리가 필요합니다.
구형 바이너리는 모듈 존재 검사 후 전경 재시도 방식으로 동작합니다. 위젯·네이티브
변경은 Mac mini iOS workflow와 실기기 표시를 확인하기 전 완료로 처리하지 않습니다.
대형은 6주 전체, 중형은 현재 주, 소형은 오늘로 구분되며 앱을 열어 timeline을 다시
써야 최신 표시가 전달됩니다. 이 작업에서 commit/push, OTA, TestFlight 제출은 하지 않았습니다.
