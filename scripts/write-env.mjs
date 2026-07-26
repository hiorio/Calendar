/**
 * 로컬 Supabase(`npm run db:start`)가 띄운 URL/anon key를 읽어 `.env`에 씁니다.
 *
 *   node scripts/write-env.mjs
 *
 * 이미 `.env`가 있으면 EXPO_PUBLIC_SUPABASE_* 두 줄만 교체하고 나머지는 둡니다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_PATH = new URL('../.env', import.meta.url);

function readStatus() {
  try {
    return execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const detail = (e.stderr || e.stdout || e.message || '').toString().trim();
    console.error('supabase status 실패. 먼저 `npm run db:start`를 실행하세요.\n' + detail);
    process.exit(1);
  }
}

/** KEY="value" 형태를 파싱 */
function parse(output) {
  const map = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line.trim());
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

const status = parse(readStatus());
const url = status.get('API_URL');
const anonKey = status.get('ANON_KEY') ?? status.get('PUBLISHABLE_KEY');

if (!url || !anonKey) {
  console.error('supabase status 출력에서 API_URL / ANON_KEY를 찾지 못했습니다.');
  process.exit(1);
}

const wanted = {
  EXPO_PUBLIC_SUPABASE_URL: url,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
};

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
const lines = existing ? existing.split(/\r?\n/) : [];

for (const [key, value] of Object.entries(wanted)) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}

writeFileSync(ENV_PATH, lines.filter((line, i) => line !== '' || i < lines.length - 1).join('\n') + '\n');

console.log('.env 갱신 완료');
console.log(`  EXPO_PUBLIC_SUPABASE_URL=${url}`);
console.log('개발 서버를 재시작해야 값이 반영됩니다 (EXPO_PUBLIC_*은 번들 타임에 주입).');
