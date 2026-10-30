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

let metadata;
try {
  metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
} catch (error) {
  assert.fail(`App Intent metadata is not valid JSON: ${error}`);
}

const actionIdentifier = 'GenerateTimeFlowerWallpaperIntent';
const action = metadata.actions?.[actionIdentifier];
assert(action, `App Intent metadata does not contain ${actionIdentifier}`);
assert.equal(action.identifier, actionIdentifier);
assert.equal(action.isDiscoverable, true, 'The wallpaper action must be discoverable');
assert.equal(action.title?.key, 'TimeFlower 잠금화면 배경 만들기');
assert(action.outputType?.intents, 'The wallpaper action must publish an intent output');

assert.equal(
  typeof metadata.autoShortcutProviderMangledName,
  'string',
  'App Shortcuts provider metadata is missing',
);
assert(metadata.autoShortcutProviderMangledName.length > 0, 'App Shortcuts provider is empty');
const shortcut = metadata.autoShortcuts?.find(
  (candidate) => candidate.actionIdentifier === actionIdentifier,
);
assert(shortcut, 'The wallpaper action is missing from the generated App Shortcuts');
assert.equal(shortcut.shortTitle?.key, 'TimeFlower 잠금화면 배경 만들기');
assert.equal(shortcut.systemImageName, 'calendar.badge.clock');
const phrases = new Set(shortcut.phraseTemplates?.map((phrase) => phrase.key));
for (const phrase of [
  '${applicationName} 잠금화면 배경 만들기',
  '${applicationName} 배경화면 만들기',
  '${applicationName} 일정 배경화면 만들기',
]) {
  assert(phrases.has(phrase), `Generated App Shortcuts are missing phrase: ${phrase}`);
}

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

console.log('Verified TimeFlower wallpaper App Intent, App Shortcut, and linked implementation.');
