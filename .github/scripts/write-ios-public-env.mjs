import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

const outputArgument = process.argv[2] ?? '.env.production.local';
const workspace = resolve(process.cwd());
const outputPath = resolve(workspace, outputArgument);
const relativePath = relative(workspace, outputPath);

if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
  throw new Error('The generated Expo environment file must stay inside the workspace.');
}
if (existsSync(outputPath)) {
  throw new Error(`Refusing to overwrite an existing environment file: ${relativePath}`);
}

const requiredNames = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
];
const optionalNames = [
  'EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL',
  'EXPO_PUBLIC_PUSH_ENABLED',
  'EXPO_PUBLIC_SENTRY_DSN',
];

function normalized(name, required) {
  const value = process.env[name]?.trim();
  if (required && !value) throw new Error(`Missing required public iOS setting: ${name}`);
  if (value?.includes('\n') || value?.includes('\r')) {
    throw new Error(`Public iOS setting contains a newline: ${name}`);
  }
  return value;
}

const entries = [
  ...requiredNames.map((name) => [name, normalized(name, true)]),
  ...optionalNames
    .map((name) => [name, normalized(name, false)])
    .filter(([, value]) => value !== undefined),
];

writeFileSync(
  outputPath,
  `${entries.map(([name, value]) => `${name}=${value}`).join('\n')}\n`,
  { encoding: 'utf8', mode: 0o600, flag: 'wx' },
);
chmodSync(outputPath, 0o600);

console.log(`Prepared ${entries.length} public iOS runtime settings in ${relativePath}; values were not printed.`);
