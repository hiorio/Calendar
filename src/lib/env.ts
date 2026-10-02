import Constants from 'expo-constants';

import {
  resolvePublicRuntimeConfig,
  type PublicRuntimeConfig,
} from '@/lib/runtime-config';

/**
 * Supabase 접속 정보. `.env`(→ `.env.example` 참고)에서 읽는다.
 *
 * 값이 없어도 앱이 죽지 않도록 여기서 throw하지 않는다. 대신
 * `isSupabaseConfigured`가 false가 되고 로그인 화면이 설정 안내를 띄운다.
 */
const embedded = Constants.expoConfig?.extra?.publicRuntimeConfig as
  | PublicRuntimeConfig
  | undefined;
// Expo는 `process.env.EXPO_PUBLIC_*` 형태의 정적 접근만 번들 시점에 치환한다.
// process.env 자체를 도우미에 넘기면 직접 Xcode로 만든 Release 번들에서 값이 빠질 수 있다.
const runtimeConfig = resolvePublicRuntimeConfig(
  {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL:
      process.env.EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL,
    EXPO_PUBLIC_PUSH_ENABLED: process.env.EXPO_PUBLIC_PUSH_ENABLED,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
  embedded,
);
const url = runtimeConfig.supabaseUrl;
const anonKey = runtimeConfig.supabaseAnonKey;

function universalLinkOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export const isSupabaseConfigured = Boolean(url && anonKey);

export const env = {
  /** 미설정 시 createClient가 던지지 않도록 하는 더미 값 */
  supabaseUrl: url ?? 'http://localhost:54321',
  supabaseAnonKey: anonKey ?? 'public-anon-key-not-set',
  /** 설정되면 초대 공유에 앱 스킴 대신 이 HTTPS 원점을 쓴다. */
  universalLinkBaseUrl: universalLinkOrigin(runtimeConfig.universalLinkBaseUrl),
  /** 워커 배포와 스케줄 연결을 끝낸 환경에서만 true로 둔다. */
  pushEnabled: runtimeConfig.pushEnabled,
  /** 공개 DSN이다. 비어 있으면 오류 수집을 완전히 끈다. */
  sentryDsn: runtimeConfig.sentryDsn ?? null,
  /** iOS 네이티브 Google 로그인용 OAuth 클라이언트 ID. 공개 설정값이다. */
  googleIosClientId: runtimeConfig.googleIosClientId ?? null,
  /** 오류 환경을 preview/production으로 분리한다. */
  appVariant:
    (Constants.expoConfig?.extra?.appVariant as string | undefined) ?? 'development',
};
