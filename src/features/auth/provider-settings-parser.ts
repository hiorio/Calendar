export type SocialProviderAvailability = {
  google: boolean;
  apple: boolean;
};

/**
 * GoTrue의 공개 settings 응답에서 앱이 제공하는 로그인 방식만 좁혀 읽는다.
 * 알 수 없는 응답을 활성 상태로 오인하지 않는다.
 */
export function parseSocialProviderAvailability(value: unknown): SocialProviderAvailability {
  const external =
    value && typeof value === 'object' && 'external' in value
      ? (value.external as Record<string, unknown> | null)
      : null;

  return {
    google: external?.google === true,
    apple: external?.apple === true,
  };
}
