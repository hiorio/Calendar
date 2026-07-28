import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

function appVariant(): AppVariant {
  const value = process.env.APP_VARIANT;
  if (value === 'preview' || value === 'production') return value;
  return 'development';
}

function httpsHost(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.hostname : null;
  } catch {
    return null;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = appVariant();
  const isProduction = variant === 'production';
  const suffix = variant === 'development' ? '.dev' : variant === 'preview' ? '.preview' : '';
  const displaySuffix = variant === 'development' ? ' Dev' : variant === 'preview' ? ' Preview' : '';

  const bundleBase = process.env.APP_BUNDLE_ID ?? 'com.hiorio.timeline';
  const iosBundleIdentifier =
    process.env.APP_IOS_BUNDLE_IDENTIFIER ?? `${bundleBase}${suffix}`;
  const universalLinkHost = httpsHost(process.env.EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL);
  const existingEas = config.extra?.eas as { projectId?: string } | undefined;
  const easProjectId =
    process.env.EAS_PROJECT_ID ?? existingEas?.projectId;

  const extra: ExpoConfig['extra'] = {
    ...config.extra,
    appVariant: variant,
    ...(easProjectId ? { eas: { ...existingEas, projectId: easProjectId } } : {}),
  };

  return {
    ...config,
    name: `TimeLine${displaySuffix}`,
    slug: 'timeline',
    scheme: isProduction ? 'timeline' : `timeline-${variant}`,
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundleIdentifier,
      config: {
        ...config.ios?.config,
        usesNonExemptEncryption: false,
      },
      associatedDomains: universalLinkHost ? [`applinks:${universalLinkHost}`] : undefined,
    },
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      ...config.updates,
      ...(easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : {}),
    },
    extra,
  };
};
