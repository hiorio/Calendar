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

function googleIosUrlScheme(clientId: string | undefined) {
  const suffix = '.apps.googleusercontent.com';
  const normalized = clientId?.trim();
  if (!normalized) return null;
  if (!normalized.endsWith(suffix) || normalized.length === suffix.length) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be an iOS OAuth client ID ending in .apps.googleusercontent.com',
    );
  }

  return `com.googleusercontent.apps.${normalized.slice(0, -suffix.length)}`;
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
  const googleUrlScheme = googleIosUrlScheme(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
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
    name: `TimeFlower${displaySuffix}`,
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
    plugins: [
      ...(config.plugins ?? []),
      ...(googleUrlScheme
        ? [
            [
              '@react-native-google-signin/google-signin',
              { iosUrlScheme: googleUrlScheme },
            ] as NonNullable<ExpoConfig['plugins']>[number],
          ]
        : []),
      [
        'expo-widgets',
        {
          enableAndroid: false,
          widgets: [
            {
              name: 'TimeFlowerCalendar',
              displayName: 'TimeFlower 캘린더',
              description: '다가오는 일정과 월간 캘린더를 확인하고 바로 일정을 추가합니다.',
              supportedFamilies: [
                'systemSmall',
                'systemMedium',
                'systemLarge',
                'accessoryCircular',
                'accessoryRectangular',
                'accessoryInline',
              ],
              contentMarginsDisabled: false,
              ios: {
                supportedFamilies: [
                  'systemSmall',
                  'systemMedium',
                  'systemLarge',
                  'accessoryCircular',
                  'accessoryRectangular',
                  'accessoryInline',
                ],
              },
              android: null,
            },
            {
              name: 'TimeFlowerQuickMemo',
              displayName: 'TimeFlower 빠른 메모',
              description: '남은 메모를 확인하고 홈 화면이나 잠금 화면에서 바로 기록합니다.',
              supportedFamilies: [
                'systemSmall',
                'systemMedium',
                'accessoryCircular',
                'accessoryRectangular',
                'accessoryInline',
              ],
              contentMarginsDisabled: false,
              ios: {
                supportedFamilies: [
                  'systemSmall',
                  'systemMedium',
                  'accessoryCircular',
                  'accessoryRectangular',
                  'accessoryInline',
                ],
              },
              android: null,
            },
          ],
        },
      ],
    ],
    extra,
  };
};
