import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// 웹에서 리다이렉트로 돌아온 인증 세션을 닫아준다 (네이티브에서는 no-op)
WebBrowser.maybeCompleteAuthSession();

/**
 * Supabase 대시보드 → Authentication → URL Configuration →
 * Redirect URLs 에 이 값을 등록해야 한다. (예: `calendar://auth-callback`)
 */
export const oauthRedirectTo = AuthSession.makeRedirectUri({ path: 'auth-callback' });

/** 사용자가 로그인 창을 닫은 경우 */
export class SignInCancelledError extends Error {
  constructor() {
    super('로그인이 취소되었습니다');
    this.name = 'SignInCancelledError';
  }
}

/**
 * Google 로그인. PKCE 플로우이므로 브라우저가 돌려준 `code`를 세션으로 교환한다.
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('OAuth URL을 받지 못했습니다');

  const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);
  if (result.type !== 'success') throw new SignInCancelledError();

  const url = new URL(result.url);
  const errorDescription = url.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  const code = url.searchParams.get('code');
  if (!code) throw new Error('인증 코드를 받지 못했습니다');

  const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return exchanged.session;
}

export const isAppleSignInSupported = Platform.OS === 'ios';

/**
 * Apple 로그인. Apple은 이름을 **최초 1회만** 내려주므로 그때 프로필에 반영한다.
 */
export async function signInWithApple() {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      throw new SignInCancelledError();
    }
    throw e;
  }

  if (!credential.identityToken) throw new Error('Apple 인증 토큰을 받지 못했습니다');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  const nickname = [credential.fullName?.familyName, credential.fullName?.givenName]
    .filter(Boolean)
    .join('');

  if (nickname && data.user) {
    await supabase.from('profiles').update({ nickname }).eq('id', data.user.id);
  }

  return data.session;
}
