import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// 웹에서 리다이렉트로 돌아온 인증 세션을 닫아준다 (네이티브에서는 no-op)
WebBrowser.maybeCompleteAuthSession();

/**
 * Supabase 대시보드 → Authentication → URL Configuration →
 * Redirect URLs 에 이 값을 등록해야 한다. (예: `timeline://auth-callback`)
 */
export const oauthRedirectTo = AuthSession.makeRedirectUri({ path: 'auth-callback' });

export type OAuthProvider = 'google' | 'apple';

/** 사용자가 로그인 창을 닫은 경우 */
export class SignInCancelledError extends Error {
  constructor() {
    super('로그인이 취소되었습니다');
    this.name = 'SignInCancelledError';
  }
}

/** 브라우저를 열고 돌아온 code를 세션으로 교환하는 공통 흐름 (PKCE) */
async function runBrowserFlow(url: string | null) {
  if (!url) throw new Error('OAuth URL을 받지 못했습니다');

  const result = await WebBrowser.openAuthSessionAsync(url, oauthRedirectTo);
  if (result.type !== 'success') throw new SignInCancelledError();

  const returned = new URL(result.url);
  const errorDescription = returned.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  const code = returned.searchParams.get('code');
  if (!code) throw new Error('인증 코드를 받지 못했습니다');

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}

/**
 * 이미 있는 계정으로 로그인한다. 게스트로 쌓은 데이터는 따라오지 않는다.
 * 게스트를 정식 계정으로 올릴 때는 `linkOAuthAccount`를 쓸 것.
 */
export async function signInWithOAuth(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  return runBrowserFlow(data.url);
}

/**
 * 게스트 세션에 소셜 계정을 **연결**한다. user.id가 그대로라 데이터가 유지된다.
 * (대시보드에서 Manual Linking이 켜져 있어야 한다)
 */
export async function linkOAuthAccount(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  return runBrowserFlow(data.url);
}

export const isNativeAppleSignInSupported = Platform.OS === 'ios';

/**
 * iOS 네이티브 Apple 로그인. **기존 계정 로그인 전용**이다.
 * id_token 방식은 연결(link)을 지원하지 않아 게스트 데이터가 유지되지 않는다.
 * 게스트를 올릴 때는 `linkOAuthAccount('apple')`(웹 플로우)을 쓴다.
 */
export async function signInWithAppleNative() {
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

  // Apple은 이름을 최초 1회만 내려준다. 그때 프로필에 반영한다.
  const nickname = [credential.fullName?.familyName, credential.fullName?.givenName]
    .filter(Boolean)
    .join('');

  if (nickname && data.user) {
    await supabase.from('profiles').update({ nickname }).eq('id', data.user.id);
  }

  return data.session;
}
