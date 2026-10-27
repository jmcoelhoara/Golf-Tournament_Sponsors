// Offline SQL runbook verification using a disposable PGlite database.
// This fixture is NOT a real Supabase Auth/PostgREST/Storage deployment.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const db = new PGlite();
try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth,public to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  const files = fs.readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files.filter(f => f < '20261025000000')) {
    await db.exec(read(`supabase/migrations/${file}`));
  }
  await db.exec(read('supabase/checks/upgrade-preflight.sql'));
  console.log('PASS: read-only preflight executes against baseline schema');
  for (const file of files.filter(f => f >= '20261025000000')) {
    await db.exec(read(`supabase/migrations/${file}`));
  }
  const before = await db.query('select (select count(*) from public.events) as events,(select count(*) from public.contests) as contests');
  await db.exec(read('supabase/checks/upgrade-postcheck.sql'));
  const after = await db.query('select (select count(*) from public.events) as events,(select count(*) from public.contests) as contests');
  assert.deepEqual(after.rows, before.rows);
  console.log('PASS: read-only structural postcheck executes after migration without changing event/contest counts');
  await db.exec('grant insert on public.events to authenticated');
  let rejected = false;
  try {
    await db.exec(read('supabase/checks/upgrade-postcheck.sql'));
  } catch (error) {
    rejected = error.message.includes('Unexpected direct mutation privilege');
    await db.exec('rollback');
  }
  assert.equal(rejected, true, 'postcheck must reject unexpected direct event write privilege');
  console.log('PASS: postcheck fails closed when an unexpected direct event-write grant is introduced');
  console.log('LIMIT: SQL fixture only; no hosted access, real Storage HTTP, authentication, browser or concurrency validation');
} finally {
  await db.close();
}
