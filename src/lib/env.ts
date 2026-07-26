/**
 * Supabase 접속 정보. `.env`(→ `.env.example` 참고)에서 읽는다.
 *
 * 값이 없어도 앱이 죽지 않도록 여기서 throw하지 않는다. 대신
 * `isSupabaseConfigured`가 false가 되고 로그인 화면이 설정 안내를 띄운다.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const env = {
  /** 미설정 시 createClient가 던지지 않도록 하는 더미 값 */
  supabaseUrl: url ?? 'http://localhost:54321',
  supabaseAnonKey: anonKey ?? 'public-anon-key-not-set',
};
