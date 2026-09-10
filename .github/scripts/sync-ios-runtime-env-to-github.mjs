import { spawnSync } from 'node:child_process';
import process from 'node:process';

const settings = [
  { name: 'EXPO_PUBLIC_SUPABASE_URL', kind: 'variable', required: true },
  { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', kind: 'secret', required: true },
  { name: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', kind: 'variable', required: true },
  { name: 'EXPO_PUBLIC_PUSH_ENABLED', kind: 'variable', required: false },
  { name: 'EXPO_PUBLIC_UNIVERSAL_LINK_BASE_URL', kind: 'variable', required: false },
  { name: 'EXPO_PUBLIC_SENTRY_DSN', kind: 'variable', required: false },
];

let synced = 0;
for (const setting of settings) {
  const value = process.env[setting.name]?.trim();
  if (!value) {
    if (setting.required) throw new Error(`Missing required production setting: ${setting.name}`);
    continue;
  }

  const args = setting.kind === 'secret'
    ? ['secret', 'set', setting.name]
    : ['variable', 'set', setting.name, '--body', value];
  const result = spawnSync('gh', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: setting.kind === 'secret' ? value : undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Could not sync ${setting.name}: ${result.stderr.trim() || 'gh failed'}`);
  }
  synced += 1;
  console.log(`Synced ${setting.name} as a GitHub ${setting.kind}; value was not printed.`);
}

console.log(`Synchronized ${synced} production runtime settings for the Mac mini workflow.`);
