import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import {
  SignInCancelledError,
  finishIdentityLink,
} from '@/features/auth/oauth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

const iosClientId = env.googleIosClientId;

export const isNativeGoogleSignInSupported = Boolean(iosClientId);

if (iosClientId) {
  GoogleSignin.configure({
    iosClientId,
    // 추가 scope를 넣지 않아 기본 식별 정보(email/profile)만 요청한다.
  });
}

async function requestGoogleIdToken() {
  if (!iosClientId) {
    throw new Error('iOS Google 로그인 설정이 이 앱 빌드에 포함되지 않았습니다');
  }

  // 직전에 선택한 계정을 자동 재사용하지 않고 매번 Google 계정 선택 화면을 연다.
  await GoogleSignin.signOut();
  let response: Awaited<ReturnType<typeof GoogleSignin.signIn>>;
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    // 현재 SDK는 취소 응답을 반환하지만 이전 네이티브 구현의 오류 코드도 안전하게 받는다.
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new SignInCancelledError();
    }
    throw error;
  }

  if (isCancelledResponse(response)) throw new SignInCancelledError();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google 인증 토큰을 받지 못했습니다');
  }

  return response.data.idToken;
}

/** iOS Google SDK의 ID token으로 기존 계정 세션을 시작한다. */
export async function signInWithGoogleNative() {
  const token = await requestGoogleIdToken();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token,
  });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('Google 로그인 세션을 만들지 못했습니다');

  return data.session;
}

/** 현재 게스트에 Google identity를 연결해 기존 캘린더의 user.id를 유지한다. */
export async function linkGoogleNative(
  expectedUserId: string,
  nickname?: string,
) {
  const token = await requestGoogleIdToken();
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    token,
  });
  if (error) throw error;

  return finishIdentityLink(expectedUserId, nickname);
}
