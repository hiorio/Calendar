import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { getConfig } from '@expo/config';

const exportDirectory = resolve(process.argv[2] ?? '.tmp/ota-preflight');
const metadataPath = resolve(exportDirectory, 'metadata.json');
assert.ok(statSync(exportDirectory).isDirectory(), 'OTA export directory was not found.');

const expectedUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const expectedAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
assert.ok(expectedUrl, 'EXPO_PUBLIC_SUPABASE_URL is unavailable.');
assert.ok(expectedAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is unavailable.');
assert.equal(process.env.APP_VARIANT, 'production', 'APP_VARIANT must be production.');

const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const relativeBundle = metadata.fileMetadata?.ios?.bundle;
assert.equal(typeof relativeBundle, 'string', 'The iOS OTA bundle is missing from metadata.');
const bundle = readFileSync(resolve(exportDirectory, relativeBundle));

for (const [label, value] of [
  ['Supabase URL', expectedUrl],
  ['Supabase anon key', expectedAnonKey],
  ['stable auth storage key', 'timeflower.auth.session.v1'],
  ['calendar-first recovery UI', 'calendar-first-recovery'],
]) {
  assert.ok(bundle.includes(Buffer.from(value, 'utf8')), `${label} is missing from the OTA bundle.`);
}

const config = getConfig(process.cwd()).exp;
assert.equal(config.extra?.appVariant, 'production');
assert.equal(config.extra?.publicRuntimeConfig?.supabaseUrl, expectedUrl);
assert.equal(config.extra?.publicRuntimeConfig?.supabaseAnonKey, expectedAnonKey);
assert.equal(config.updates?.requestHeaders?.['expo-channel-name'], 'production');
assert.equal(config.runtimeVersion?.policy, 'appVersion');

console.log(
  `Verified production runtime settings, stable session migration, and calendar-first recovery in ${relativeBundle}; values were not printed.`,
);
