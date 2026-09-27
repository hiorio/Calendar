import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.equal(production.version, '1.5.0');
  const pluginNames = production.plugins?.map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin,
  ) ?? [];
  assert.equal(pluginNames.filter((name) => name === 'expo-widgets').length, 1);
  assert.equal(
    pluginNames.filter((name) => name === './plugins/with-timeflower-wallpaper-intent').length,
    1,
  );
  const wallpaperIntent = readFileSync(
    new URL('../plugins/ios/TimeFlowerWallpaperIntent.swift', import.meta.url),
    'utf8',
  );
  assert.match(wallpaperIntent, /TIMEFLOWER_WALLPAPER_INTENT_V1/);
  assert.match(
    wallpaperIntent,
    /TimeFlower 잠금화면 배경 만들기/,
  );
  assert.match(
    wallpaperIntent,
    /struct TimeFlowerWallpaperShortcuts: AppShortcutsProvider/,
  );
  assert.match(wallpaperIntent, /intent: GenerateTimeFlowerWallpaperIntent\(\)/);
  assert.match(wallpaperIntent, /\\\(\.applicationName\) 잠금화면 배경 만들기/);
  assert.match(wallpaperIntent, /ReturnsValue<IntentFile>/);
  assert.match(wallpaperIntent, /snapshotFileName = "TimeFlowerWallpaperSnapshot\.json"/);
  assert.match(wallpaperIntent, /removedOnCompletion = true/);
  assert.match(wallpaperIntent, /loadSnapshotWithRetry/);
  assert.match(wallpaperIntent, /@MainActor/);
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

  console.log('\nApp config regressions: 20 passed');
} finally {
  for (const name of managedEnvironment) {
    const original = originalEnvironment[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}
