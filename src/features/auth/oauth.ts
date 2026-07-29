import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { parseOAuthCallback } from '@/features/auth/oauth-callback';
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

  const callback = parseOAuthCallback(result.url, oauthRedirectTo);
  if (!callback.ok) throw new Error(callback.message);

  const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
  if (error) throw error;
  if (!data.session) throw new Error('로그인 세션을 만들지 못했습니다');
  return data.session;
}

function oauthOptions(provider: OAuthProvider) {
  return {
    redirectTo: oauthRedirectTo,
    skipBrowserRedirect: true,
    // 로그인 쿠키가 남아 있어도 사용자가 어느 Google 계정으로 들어가는지 직접 고르게 한다.
    // 캘린더 앱에서는 계정을 잘못 고르는 것이 곧 다른 사람의 데이터로 전환되는 문제다.
    queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
  };
}

/**
 * 이미 있는 계정으로 로그인한다. 게스트로 쌓은 데이터는 따라오지 않는다.
 * 게스트를 정식 계정으로 올릴 때는 `linkOAuthAccount`를 쓸 것.
 */
export async function signInWithOAuth(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: oauthOptions(provider),
  });
  if (error) throw error;
  return runBrowserFlow(data.url);
}

/**
 * 게스트 세션에 소셜 계정을 **연결**한다. user.id가 그대로라 데이터가 유지된다.
 * (대시보드에서 Manual Linking이 켜져 있어야 한다)
 */
export async function linkOAuthAccount(
  provider: OAuthProvider,
  expectedUserId: string,
  nickname?: string,
) {
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: oauthOptions(provider),
  });
  if (error) throw error;
  await runBrowserFlow(data.url);
  return finishIdentityLink(expectedUserId, nickname);
}

export const isNativeAppleSignInSupported = Platform.OS === 'ios';

/**
 * 실제 런타임에서도 Apple 로그인을 제공하는지 확인한다.
 * Expo 문서상 플랫폼만 보고 버튼을 렌더하면 안 된다.
 */
export async function isAppleSignInAvailable() {
  return isNativeAppleSignInSupported && AppleAuthentication.isAvailableAsync();
}

async function requestAppleCredential() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  const state = Crypto.randomUUID();

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      state,
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
  if (credential.state !== state) throw new Error('Apple 로그인 요청을 확인할 수 없습니다');

  return { credential, rawNonce };
}

function appleTokenCredentials(
  credential: AppleAuthentication.AppleAuthenticationCredential,
  rawNonce: string,
) {
  return {
    provider: 'apple' as const,
    token: credential.identityToken!,
    nonce: rawNonce,
    ...(credential.authorizationCode ? { access_token: credential.authorizationCode } : {}),
  };
}

/** iOS 네이티브 Apple 로그인. nonce/state를 모두 검증한다. */
export async function signInWithAppleNative() {
  const { credential, rawNonce } = await requestAppleCredential();

  const { data, error } = await supabase.auth.signInWithIdToken({
    ...appleTokenCredentials(credential, rawNonce),
  });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('Apple 로그인 세션을 만들지 못했습니다');

  await saveAppleName(data.user.id, credential);

  return data.session;
}

/**
 * 게스트 세션에 iOS 네이티브 Apple identity를 연결한다.
 * Supabase의 ID token linking을 사용하므로 user.id와 기존 캘린더가 그대로 유지된다.
 */
export async function linkAppleNative(
  expectedUserId: string,
  nickname?: string,
) {
  const { credential, rawNonce } = await requestAppleCredential();
  const { error } = await supabase.auth.linkIdentity(
    appleTokenCredentials(credential, rawNonce),
  );
  if (error) throw error;

  const preferredNickname =
    nickname?.trim() ||
    [credential.fullName?.familyName, credential.fullName?.givenName].filter(Boolean).join('');

  return finishIdentityLink(expectedUserId, preferredNickname);
}

async function finishIdentityLink(expectedUserId: string, nickname?: string) {
  // 연결 직후 토큰에 익명 claim이 남지 않도록 새 세션을 받고, 같은 user인지 확인한다.
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  if (!data.session || data.user?.id !== expectedUserId) {
    throw new Error('현재 사용자에게 소셜 계정이 연결되었는지 확인할 수 없습니다');
  }

  if (nickname?.trim()) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() })
      .eq('id', expectedUserId);
    if (profileError) throw profileError;
  }

  return data.session;
}

async function saveAppleName(
  userId: string,
  credential: AppleAuthentication.AppleAuthenticationCredential,
) {
  // Apple은 이름을 최초 동의 때 한 번만 내려준다.
  const nickname = [credential.fullName?.familyName, credential.fullName?.givenName]
    .filter(Boolean)
    .join('');
  if (!nickname) return;

  const { error } = await supabase.from('profiles').update({ nickname }).eq('id', userId);
  if (error) throw error;
}
