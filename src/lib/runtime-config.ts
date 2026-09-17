export type PublicRuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  universalLinkBaseUrl?: string;
  pushEnabled?: boolean;
  sentryDsn?: string;
  googleIosClientId?: string;
};

type RuntimeEnvironment = Record<string, string | undefined>;

function nonEmpty(value: string | undefined) {
  return value?.trim() || undefined;
}

/**
 * Expo normally inlines EXPO_PUBLIC_* values in the JavaScript bundle. Direct
 * Xcode archives add another process boundary, though, so the embedded app
 * config is also accepted as a release-safe fallback. All values here are
 * public client configuration; privileged Supabase keys must never be added.
 */
export function resolvePublicRuntimeConfig(
  runtimeEnvironment: RuntimeEnvironment,
  embedded: PublicRuntimeConfig | undefined,
): Required<Pick<PublicRuntimeConfig, 'pushEnabled'>> &
  Omit<PublicRuntimeConfig, 'pushEnabled'> {
  const pushValue = nonEmpty(runtimeEnvironment.EXPO_PUBLIC_PUSH_ENABLED);

  return {
    supabaseUrl:
      nonEmpty(runtimeEnvironment.EXPO_PUBLIC_SUPABASE_URL) ??
      nonEmpty(embedded?.supabaseUrl),
    supabaseAnonKey:
      nonEmpty(runtimeEnvironment.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
      nonEmpty(embedded?.supabaseAnonKey),
    universalLinkBaseUrl:
      nonEmpty(runtimeEnvironment.EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL) ??
      nonEmpty(embedded?.universalLinkBaseUrl),
    pushEnabled:
      pushValue === undefined ? embedded?.pushEnabled === true : pushValue === 'true',
    sentryDsn:
      nonEmpty(runtimeEnvironment.EXPO_PUBLIC_SENTRY_DSN) ??
      nonEmpty(embedded?.sentryDsn),
    googleIosClientId:
      nonEmpty(runtimeEnvironment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) ??
      nonEmpty(embedded?.googleIosClientId),
  };
}
