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
영향을 줍니다. Supabase 프로젝트와 EAS 환경 변수, OAuth redirect URL을 분리합니다.

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

사진은 보관함 읽기만 선언하고 카메라·마이크 권한은 넣지 않았습니다. 기기 캘린더는
가져오기를 위해 읽기 권한을 선언했습니다. 현재 앱이 사용하지 않는 권한을 미리 넓게
요청하지 않습니다.

`expo-sharing`의 config plugin은 다른 앱에서 TimeLine으로 파일을 보내는 Share Extension을
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

1. Google Auth Platform에서 OAuth 클라이언트를 **웹 애플리케이션**으로 만듭니다.
2. Authorized redirect URI에는 앱 스킴이 아니라 Supabase가 표시하는
   `https://<project-ref>.supabase.co/auth/v1/callback`을 등록합니다.
3. Supabase Authentication → Providers → Google에 Client ID와 Client Secret을 넣고
   활성화합니다.
4. Google 동의 화면의 scope는 `openid`, 이메일, 기본 프로필만 둡니다. 캘린더 scope는
   로그인에 섞지 않고 외부 캘린더 연동을 구현할 때 별도 동의로 받습니다.

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

충분히 긴 임의 문자열을 Edge Function secret으로 등록합니다.

```bash
npx supabase secrets set WORKER_SECRET=<긴-임의-문자열>
```

Expo Push Security를 켠 프로젝트라면 access token도 등록합니다.

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=<expo-access-token>
```

Dashboard에서 `pg_cron`, `pg_net`, Vault를 활성화하고 기존 마이그레이션의
`notification-worker` 호출을 1분 주기로 연결합니다. 워커 배포와 cron 호출을 확인하기
전에는 `EXPO_PUBLIC_PUSH_ENABLED=false`, 확인 후 `true`로 둡니다.

## 4. EAS 프로젝트와 환경 변수

Expo 계정으로 로그인하고 프로젝트를 연결합니다.

```bash
npx eas-cli login
npx eas-cli init
```

EAS의 `development`, `preview`, `production` 환경에 환경별 값을 넣습니다.
`EXPO_PUBLIC_*` 값은 앱 번들에 포함되므로 서버 비밀값을 넣으면 안 됩니다.

```text
EAS_PROJECT_ID
APP_IOS_BUNDLE_IDENTIFIER
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_PUSH_ENABLED
EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL
EXPO_PUBLIC_SENTRY_DSN
SENTRY_ORG
SENTRY_PROJECT
```

Sentry 소스맵 업로드용 `SENTRY_AUTH_TOKEN`은 EAS의 **secret** 환경 변수로만 등록합니다.
저장소나 로컬 `.env`에 커밋하지 않습니다.

환경값을 받은 상태에서 검사합니다.

```bash
npx eas-cli env:exec --environment preview "npm run deploy:check"
```

설치 가능한 iOS 빌드:

```bash
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform ios
```

내부 iOS 배포에는 Apple Developer 계정과 테스트 기기 등록이 필요하고, production은
TestFlight/App Store Connect로 제출합니다.

## 5. EAS Update와 재빌드 기준

`app.config.ts`는 EAS project ID로 `updates.url`을 만들고
`runtimeVersion: { policy: "appVersion" }`을 사용합니다. `eas.json`의 preview와
production 빌드는 각각 같은 이름의 OTA 채널을 구독합니다.

OTA 배포 예:

```bash
npx eas-cli update --channel preview --environment preview --message "달력 화면 개선"
npx eas-cli update --channel production --environment production --message "1.0.0 수정"
```

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

네이티브 빌드는 EAS의 `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`로 소스맵을
업로드합니다. OTA를 배포한 뒤에도 해당 update의 JS 소스맵이 Sentry에 올라갔는지
확인합니다. `eas update`가 만든 `dist`를 같은 환경 변수로 업로드합니다.

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
npm run db:reset
npm run db:smoke
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
