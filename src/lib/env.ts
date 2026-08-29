import Constants from 'expo-constants';

/**
 * Supabase 접속 정보. `.env`(→ `.env.example` 참고)에서 읽는다.
 *
 * 값이 없어도 앱이 죽지 않도록 여기서 throw하지 않는다. 대신
 * `isSupabaseConfigured`가 false가 되고 로그인 화면이 설정 안내를 띄운다.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
  universalLinkBaseUrl: universalLinkOrigin(process.env.EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL),
  /** 워커 배포와 스케줄 연결을 끝낸 환경에서만 true로 둔다. */
  pushEnabled: process.env.EXPO_PUBLIC_PUSH_ENABLED === 'true',
  /** 공개 DSN이다. 비어 있으면 오류 수집을 완전히 끈다. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || null,
  /** iOS 네이티브 Google 로그인용 OAuth 클라이언트 ID. 공개 설정값이다. */
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || null,
  /** 오류 환경을 preview/production으로 분리한다. */
  appVariant:
    (Constants.expoConfig?.extra?.appVariant as string | undefined) ?? 'development',
};
