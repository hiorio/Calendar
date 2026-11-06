/** Rollback-only SQL assertions against this project's local Supabase Postgres, never --linked. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const endpoint = process.env.DOCKER_HOST || execFileSync('docker', [
  'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}',
], { encoding: 'utf8', timeout: 15_000 }).trim();
if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')) {
  throw new Error('DB regressions require a local Docker socket, not a remote Docker host.');
}
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(config)?.[1];
if (!projectId) throw new Error('Local Supabase project_id not found.');
const sql = readFileSync(new URL('./backend-regression.sql', import.meta.url), 'utf8');
process.stdout.write(execFileSync('docker', ['exec', '-i', `supabase_db_${projectId}`,
  'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: sql, encoding: 'utf8', timeout: 60_000 }));
