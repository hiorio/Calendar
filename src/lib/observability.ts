import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

import { env } from '@/lib/env';

Sentry.init({
  dsn: env.sentryDsn ?? undefined,
  enabled: Boolean(env.sentryDsn),
  environment: env.appVariant,
  sendDefaultPii: false,
  tracesSampleRate: env.sentryDsn ? 0.05 : 0,
});

Sentry.setTag('expo-update-id', Updates.updateId ?? 'embedded');
Sentry.setTag('expo-is-embedded-update', String(Updates.isEmbeddedLaunch));

export { Sentry };
