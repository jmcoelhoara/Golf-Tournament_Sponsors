// Applies every migration to a fresh PGlite database, then every course catalog script in
// supabase/courses/ (twice, to prove it is re-runnable), and checks the data a contest uses.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
let count = 0;
function check(name, actual, expected = true) { assert.deepEqual(actual, expected, name); console.log(`ok ${++count} ${name}`); }
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
`);
const migrations = new URL('../migrations/', import.meta.url);
for (const f of fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(new URL(f, migrations), 'utf8'));

const coursesDir = new URL('../courses/', import.meta.url);
const scripts = fs.readdirSync(coursesDir).filter(f => f.endsWith('.sql')).sort();
for (let i = 0; i < 2; i++) for (const f of scripts) await db.exec(fs.readFileSync(new URL(f, coursesDir), 'utf8'));
check('course scripts apply twice without error', scripts.length > 0);

const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const COURSE = '5d0a1e00-0000-4000-8000-00000000c001';
check('Westwood Plateau course exists once', (await q(`select count(*)::int n from public.courses where id=$1`, [COURSE]))[0].n, 1);
const tees = await q(`select t.label, count(y.*)::int holes, sum(y.yardage)::int total
  from public.course_tees t join public.course_hole_yardages y on y.tee_id=t.id
  where t.course_id=$1 group by t.label, t.sort_order order by t.sort_order`, [COURSE]);
check('five official tees, 18 holes each, scorecard totals', tees, [
  { label: 'Gold', holes: 18, total: 6770 }, { label: 'Blue', holes: 18, total: 6355 },
  { label: 'White', holes: 18, total: 5893 }, { label: 'Red', holes: 18, total: 5219 },
  { label: 'Green', holes: 18, total: 5014 },
]);
const nines = await q(`select t.label, sum(y.yardage) filter (where y.hole_number<=9)::int out_, sum(y.yardage) filter (where y.hole_number>9)::int in_
  from public.course_tees t join public.course_hole_yardages y on y.tee_id=t.id where t.course_id=$1 group by t.label, t.sort_order order by t.sort_order`, [COURSE]);
check('front and back nine match the scorecard', nines.map(r => [r.label, r.out_, r.in_]), [
  ['Gold', 3444, 3326], ['Blue', 3222, 3133], ['White', 2931, 2962], ['Red', 2646, 2573], ['Green', 2521, 2493],
]);

// A platform admin can run an event at the course and a contest picks up the catalog yardage.
const ADMIN = '10000000-0000-0000-0000-0000000000f1';
await db.exec(`insert into auth.users values ('${ADMIN}','platform@test.invalid'); insert into private.platform_admins(user_id) values ('${ADMIN}');`);
async function asAdmin(sql, args = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${ADMIN}',false); set role authenticated;`);
  try { return (await db.query(sql, args)).rows; } finally { await db.exec('reset role'); }
}
const created = (await asAdmin(`select public.create_event('5d0a1e00-0000-4000-8000-00000000a001','Charity Classic','${COURSE}','2027-06-12') r`))[0].r;
check('event can be created at the course', created.ok, true);
const eventId = created.event_id ?? created.id;
const gold = '5d0a1e00-0000-4000-8000-000000007101';
const added = (await asAdmin(`select public.add_event_contest($1::uuid,'mens-closest-to-pin',3::smallint,$2::uuid) r`, [eventId, gold]))[0].r;
check('closest-to-pin contest can be placed on hole 3 Gold', added.ok, true);
const snap = await q(`select tees, hole_yardage from public.contests where event_id=$1`, [eventId]);
check('contest snapshot uses the catalog yardage', snap, [{ tees: 'Gold', hole_yardage: 205 }]);
console.log(`courses: ${count} checks passed`);
await db.close();
