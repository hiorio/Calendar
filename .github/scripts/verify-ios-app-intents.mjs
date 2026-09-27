import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const appPath = process.argv[2] ? resolve(process.argv[2]) : null;
if (!appPath) {
  console.error('Usage: node verify-ios-app-intents.mjs <TimeFlower.app>');
  process.exit(2);
}

const metadataPath = join(appPath, 'Metadata.appintents', 'extract.actionsdata');
assert(existsSync(metadataPath), `App Intent metadata is missing: ${metadataPath}`);
assert(statSync(metadataPath).isFile(), `App Intent metadata is not a file: ${metadataPath}`);
assert(statSync(metadataPath).size > 0, 'App Intent metadata is empty');

function printableStrings(path) {
  const result = spawnSync('/usr/bin/strings', ['-a', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `strings failed for ${path}`);
  // latin1 also preserves contiguous ASCII in binary plist and archive formats.
  return `${result.stdout}\n${readFileSync(path).toString('latin1')}`;
}

const metadata = printableStrings(metadataPath);
for (const required of [
  'GenerateTimeFlowerWallpaperIntent',
  'IntentFile',
]) {
  assert(metadata.includes(required), `App Intent metadata does not contain ${required}`);
}

// Xcode's extracted action metadata records the discoverable AppIntent contract,
// but it does not guarantee that the source-level AppShortcutsProvider type name
// survives serialization. The provider itself is compile-checked with the app and
// its source contract is covered by app-config-regression-check.mjs.

const plistResult = spawnSync(
  '/usr/bin/plutil',
  ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', join(appPath, 'Info.plist')],
  { encoding: 'utf8' },
);
assert.equal(plistResult.status, 0, plistResult.stderr || 'Unable to read CFBundleExecutable');
const executablePath = join(appPath, plistResult.stdout.trim());
assert(existsSync(executablePath), `App executable is missing: ${executablePath}`);
assert(
  printableStrings(executablePath).includes('TIMEFLOWER_WALLPAPER_INTENT_V1'),
  'The wallpaper App Intent marker was not linked into the main app executable',
);

console.log('Verified TimeFlower wallpaper App Intent metadata and linked implementation.');
