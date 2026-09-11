import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';

const appArgument = process.argv[2];
if (!appArgument) {
  throw new Error('usage: verify-ios-runtime-config.mjs <compiled-app-path>');
}

const appPath = resolve(appArgument);
if (!statSync(appPath).isDirectory() || !appPath.endsWith('.app')) {
  throw new Error('The compiled iOS app bundle was not found.');
}

const expected = [
  ['Supabase URL', process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()],
  ['Supabase anon key', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()],
];
for (const [label, value] of expected) {
  if (!value) throw new Error(`${label} is unavailable to the compiled-bundle verifier.`);
}

function collectBundles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      collectBundles(path, found);
    } else if (entry.isFile() && /(?:\.jsbundle|\.bundle)$/i.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

const bundles = collectBundles(appPath);
if (!bundles.length) throw new Error('No JavaScript bundle was found in the compiled iOS app.');
const contents = bundles.map((path) => ({ path, content: readFileSync(path) }));

for (const [label, value] of expected) {
  const needle = Buffer.from(value, 'utf8');
  if (!contents.some(({ content }) => content.includes(needle))) {
    throw new Error(`${label} is missing from every compiled JavaScript bundle.`);
  }
}

console.log(
  `Verified ${expected.length} production runtime settings in ${bundles.length} compiled JavaScript bundle(s): ${bundles.map((path) => basename(path)).join(', ')}`,
);
