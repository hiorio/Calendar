/**
 * 웹·Android에서는 기존 Supabase 브라우저 OAuth를 사용한다.
 * 네이티브 패키지를 여기서 import하지 않아 웹 번들과 Android 빌드에 iOS 모듈 로드를
 * 요구하지 않는다. Metro는 iOS에서 google-native.ios.ts를 선택한다.
 */
export const isNativeGoogleSignInSupported = false;

export async function signInWithGoogleNative(): Promise<never> {
  throw new Error('이 플랫폼에서는 네이티브 Google 로그인을 사용할 수 없습니다');
}

export async function linkGoogleNative(
  _expectedUserId: string,
  _nickname?: string,
): Promise<never> {
  throw new Error('이 플랫폼에서는 네이티브 Google 계정 연결을 사용할 수 없습니다');
}
