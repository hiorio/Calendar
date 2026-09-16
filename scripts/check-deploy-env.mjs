import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const variant = process.env.APP_VARIANT ?? 'preview';
const errors = [];
const warnings = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) errors.push(`${name} 값이 없습니다.`);
  return value;
}

function publicHttpsUrl(name) {
  const value = required(name);
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') errors.push(`${name}은 https URL이어야 합니다.`);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      errors.push(`${name}에 로컬 주소를 사용할 수 없습니다.`);
    }
    return url;
  } catch {
    errors.push(`${name}이 올바른 URL이 아닙니다.`);
    return null;
  }
}

if (!['development', 'preview', 'production'].includes(variant)) {
  errors.push('APP_VARIANT는 development, preview, production 중 하나여야 합니다.');
}

publicHttpsUrl('EXPO_PUBLIC_SUPABASE_URL');
required('EXPO_PUBLIC_SUPABASE_ANON_KEY');

const iosBundleIdentifier = required('APP_IOS_BUNDLE_IDENTIFIER');
if (
  iosBundleIdentifier &&
  (iosBundleIdentifier.startsWith('com.example.') ||
    iosBundleIdentifier.startsWith('com.yourcompany.'))
) {
  errors.push('APP_IOS_BUNDLE_IDENTIFIER에 예시 값을 사용할 수 없습니다.');
}

const googleIosClientId = required('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
if (
  googleIosClientId &&
  !/^[^.]+\.apps\.googleusercontent\.com$/.test(googleIosClientId)
) {
  errors.push(
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID는 Google의 iOS OAuth 클라이언트 ID 형식이어야 합니다.',
  );
}

let easProjectId = process.env.EAS_PROJECT_ID?.trim();
if (!easProjectId && existsSync('app.json')) {
  const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
  easProjectId = appJson.expo?.extra?.eas?.projectId;
}
if (!easProjectId) {
  errors.push('EAS_PROJECT_ID가 없습니다. `eas init`으로 프로젝트를 연결하세요.');
} else if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    easProjectId,
  )
) {
  errors.push('EAS_PROJECT_ID가 UUID 형식이 아닙니다.');
}

const universalBaseUrl = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL?.trim();
if (variant === 'production' && !universalBaseUrl) {
  warnings.push(
    'EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL이 없어 초대 링크는 커스텀 URL 스킴만 사용합니다.',
  );
}
if (universalBaseUrl) {
  const universalUrl = publicHttpsUrl('EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL');
  if (
    universalUrl &&
    (universalUrl.pathname !== '/' || universalUrl.search || universalUrl.hash)
  ) {
    errors.push(
      'EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL에는 경로·쿼리·해시 없이 원점만 넣어야 합니다.',
    );
  }
  if (!process.env.APPLE_TEAM_ID) {
    warnings.push(
      'APPLE_TEAM_ID가 없어 apple-app-site-association을 생성할 수 없습니다.',
    );
  }
}

if (process.env.EXPO_PUBLIC_PUSH_ENABLED !== 'true') {
  warnings.push(
    'EXPO_PUBLIC_PUSH_ENABLED가 true가 아니므로 앱이 원격 푸시 미연결 안내를 표시합니다.',
  );
}

if (!process.env.EXPO_PUBLIC_SENTRY_DSN) {
  warnings.push('EXPO_PUBLIC_SENTRY_DSN이 없어 오류 수집이 비활성화됩니다.');
}
if (!process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT) {
  warnings.push(
    'SENTRY_ORG 또는 SENTRY_PROJECT가 없어 네이티브/OTA 소스맵 업로드를 할 수 없습니다.',
  );
}

for (const warning of warnings) console.warn(`경고: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`오류: ${error}`);
  process.exit(1);
}

console.log(`${variant} iOS 배포 환경 검사가 통과했습니다.`);
