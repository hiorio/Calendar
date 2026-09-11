// Supplemental SQL verification without Docker. This is actual in-memory
// PostgreSQL with minimal auth/storage fixtures, NOT Supabase integration smoke.
// Run: npx --yes deno@2.9.6 run --no-lock --node-modules-dir=none --allow-read --allow-env scripts/backend-embedded-check.mjs
import { PGlite } from 'npm:@electric-sql/pglite@0.5.8';
import { readFile, readdir } from 'node:fs/promises';

const database = new PGlite();
try {
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create schema extensions;
    create table auth.users(id uuid primary key, email text, is_anonymous boolean default false, raw_user_meta_data jsonb);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role'; $$;
    grant usage on schema auth, storage, public to anon, authenticated, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text references storage.buckets(id), name text, owner_id text);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated, service_role;
  `);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    // pg_cron/pg_net/Vault and the independent guest-transfer pgcrypto RPC need
    // the full Supabase stack, which this deliberately small fixture omits.
    if (name.includes('notification_worker_scheduler') || name.includes('guest_data_transfer')) continue;
    await database.exec(await readFile(new URL(name, directory), 'utf8'));
  }
  const results = await database.exec(await readFile(new URL('./backend-regression.sql', import.meta.url), 'utf8'));
  const row = results.flatMap((result) => result.rows).find((result) => result.result);
  console.log(row?.result ?? 'Embedded backend SQL passed');
} catch (error) {
  console.error(error.message);
  if (error.detail) console.error(error.detail);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await database.close();
}
