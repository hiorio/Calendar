import assert from 'node:assert/strict';

import { getConfig } from '@expo/config';

const originalVariant = process.env.APP_VARIANT;

function configFor(variant) {
  process.env.APP_VARIANT = variant;
  return getConfig(process.cwd()).exp;
}

try {
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

  console.log('\nApp config regressions: 6 passed');
} finally {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
}
