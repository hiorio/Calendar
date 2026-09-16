import assert from 'node:assert/strict';

import { getConfig } from '@expo/config';

const managedEnvironment = [
  'APP_VARIANT',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_PUSH_ENABLED',
];
const originalEnvironment = Object.fromEntries(
  managedEnvironment.map((name) => [name, process.env[name]]),
);

function configFor(variant) {
  process.env.APP_VARIANT = variant;
  return getConfig(process.cwd()).exp;
}

try {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://runtime-test.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'public-runtime-test-key';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
    '123456-runtime-test.apps.googleusercontent.com';
  process.env.EXPO_PUBLIC_PUSH_ENABLED = 'true';

  const development = configFor('development');
  const preview = configFor('preview');
  const production = configFor('production');

  assert.equal(
    development.updates?.requestHeaders?.['expo-channel-name'],
    undefined,
    'development builds must not silently subscribe to a release channel',
  );
  assert.equal(preview.updates?.requestHeaders?.['expo-channel-name'], 'preview');
  assert.equal(production.updates?.requestHeaders?.['expo-channel-name'], 'production');
  assert.match(production.updates?.url ?? '', /^https:\/\/u\.expo\.dev\//);
  assert.equal(production.runtimeVersion?.policy, 'appVersion');
  assert.equal(production.version, '1.4.1');
  assert.deepEqual(production.extra?.publicRuntimeConfig, {
    supabaseUrl: 'https://runtime-test.supabase.co',
    supabaseAnonKey: 'public-runtime-test-key',
    universalLinkBaseUrl: undefined,
    pushEnabled: true,
    sentryDsn: undefined,
    googleIosClientId: '123456-runtime-test.apps.googleusercontent.com',
  });

  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  assert.throws(
    () => configFor('production'),
    /Production config requires EXPO_PUBLIC_SUPABASE_URL/,
    'production config must fail before emitting a bundle without backend settings',
  );

  console.log('\nApp config regressions: 8 passed');
} finally {
  for (const name of managedEnvironment) {
    const original = originalEnvironment[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}
