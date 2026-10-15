import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const SEED = new URL('../seed.sql', import.meta.url);
const db = new PGlite();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Supabase stand-ins
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);

// Apply every migration in order
const MIG_DIR = new URL('../migrations/', import.meta.url);
for (const f of fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(new URL(f, MIG_DIR), 'utf8'));
}
await db.exec(fs.readFileSync(SEED, 'utf8'));
console.log('migration + seed applied');

// Users: platform admin, org A owner, org A staff, org B owner
const U = {
  admin: '10000000-0000-0000-0000-000000000001',
  ownerA: '10000000-0000-0000-0000-000000000002',
  staffA: '10000000-0000-0000-0000-000000000003',
  ownerB: '10000000-0000-0000-0000-000000000004',
};
const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const ORG_B = '00000000-0000-0000-0000-0000000000a2';
await db.exec(`
  insert into auth.users values
    ('${U.admin}','admin@x'),('${U.ownerA}','a@x'),('${U.staffA}','s@x'),('${U.ownerB}','b@x');
  insert into private.platform_admins values ('${U.admin}', now());
  insert into public.organizations (id, name) values ('${ORG_B}', 'Other Course');
  insert into public.organization_members values
    ('${ORG_A}','${U.ownerA}','owner',now()),('${ORG_A}','${U.staffA}','staff',now()),
    ('${ORG_B}','${U.ownerB}','owner',now());
  insert into public.events (id, organization_id, name, status) values
    ('00000000-0000-0000-0000-0000000000e2','${ORG_B}','Other Event','live');
`);

async function as(role, sub, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role;'); }
}
const anon = (sql, p) => as('anon', null, sql, p);
const user = (u, sql, p) => as('authenticated', u, sql, p);
async function fails(fn) { try { await fn(); return false; } catch { return true; } }
const uuid = () => crypto.randomUUID();
const submit = async (token, golfer, value, req = uuid()) =>
  (await anon('select public.submit_contest_entry($1,$2,$3,$4) r', [token, golfer, value, req])).rows[0].r;

console.log('\nGolfer (anonymous) access');
const pub = (await anon(`select public.get_contest_public('dev-men-ctp') r`)).rows[0].r;
check('contest details visible by QR token', pub.available && pub.sponsor.name === 'West Coast Development', pub);
check('bad token reveals nothing', (await anon(`select public.get_contest_public('nope') r`)).rows[0].r.available === false);
const roster = (await anon(`select * from public.get_contest_roster('dev-men-ctp')`)).rows;
check('roster filtered to Men division (72)', roster.length === 72, roster.length);
check('roster has no contact details', !('email' in roster[0]) && !('phone' in roster[0]));
check('anon cannot read golfers table', await fails(() => anon('select * from public.golfers')));
check('anon cannot read entries table', await fails(() => anon('select * from public.contest_entries')));
check('anon cannot insert entries directly', await fails(() =>
  anon(`insert into public.contest_entries (organization_id,event_id,contest_id,golfer_id,status,client_request_id)
        values ('${ORG_A}','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3','${roster[0].golfer_id}','accepted','${uuid()}')`)));
check('anon cannot call staff functions', await fails(() =>
  anon(`select public.check_in_golfer('${roster[0].golfer_id}')`)));

console.log('\nClosest to the Pin (lowest wins)');
const [g1, g2, g3] = roster;
let r = await submit('dev-men-ctp', g1.golfer_id, 60);
check('first entry accepted', r.ok && r.status === 'accepted' && r.leader.name === g1.display_name, r);
r = await submit('dev-men-ctp', g2.golfer_id, 30.5);
check('closer shot takes lead', r.leader.name === g2.display_name && Number(r.leader.value) === 30.5, r);
r = await submit('dev-men-ctp', g3.golfer_id, 45);
check('worse shot does not take lead', r.leader.name === g2.display_name, r);
const req = uuid();
const first = await submit('dev-men-ctp', roster[3].golfer_id, 80, req);
const retry = await submit('dev-men-ctp', roster[3].golfer_id, 80, req);
check('retry with same request id counted once', retry.ok && retry.repeat && retry.entry_id === first.entry_id, retry);
r = await submit('dev-men-ctp', g1.golfer_id, 1);
check('second entry by same golfer blocked', !r.ok && r.error === 'already_submitted', r);
r = await submit('dev-men-ctp', roster[4].golfer_id, 5000);
check('out-of-range value rejected', r.error === 'value_out_of_range', r);
r = await submit('dev-men-ctp', roster[4].golfer_id, null);
check('missing value rejected', r.error === 'value_required', r);
const woman = (await anon(`select * from public.get_contest_roster('dev-women-ctp')`)).rows[0];
r = await submit('dev-men-ctp', woman.golfer_id, 10);
check('wrong division rejected', r.error === 'wrong_division', r);
r = await submit('dev-men-ctp', '00000000-0000-0000-0000-00000000dead', 10);
check('unknown golfer rejected', r.error === 'golfer_not_in_event', r);
const leaders = (await anon(`select * from public.contest_leaders where contest_id='00000000-0000-0000-0000-0000000000c3'`)).rows;
check('public leaderboard row readable by anon', leaders.length === 1 && leaders[0].entry_count === 4, leaders);

console.log('\nLong Drive (latest accepted claim wins)');
const ld = (await anon(`select * from public.get_contest_roster('dev-men-long-drive')`)).rows;
await submit('dev-men-long-drive', ld[10].golfer_id, null);
r = await submit('dev-men-long-drive', ld[11].golfer_id, null);
check('newest claim leads', r.leader.name === ld[11].display_name, r);

console.log('\nStaff actions');
const entry = (await user(U.staffA, `select id from public.contest_entries where golfer_id=$1 and contest_id='00000000-0000-0000-0000-0000000000c3'`, [g2.golfer_id])).rows[0];
check('staff sees own org entries', !!entry);
r = (await user(U.staffA, `select public.review_contest_entry($1,'void','disqualified') r`, [entry.id])).rows[0].r;
check('void leader -> next best leads', r.ok && r.leader.name === g3.display_name, r);
r = (await user(U.staffA, `select public.correct_contest_entry($1, 2, 'typo') r`, [entry.id])).rows[0].r;
check('staff cannot correct values (admins only)', r.error === 'not_allowed', r);
const e3 = (await user(U.ownerA, `select id from public.contest_entries where golfer_id=$1 and contest_id='00000000-0000-0000-0000-0000000000c3'`, [g1.golfer_id])).rows[0];
r = (await user(U.ownerA, `select public.correct_contest_entry($1, 6, 'golfer typed 60 instead of 6') r`, [e3.id])).rows[0].r;
check('owner correction updates leader', r.ok && r.leader.name === g1.display_name, r);
r = (await user(U.staffA, `select public.check_in_golfer($1) r`, [g1.golfer_id])).rows[0].r;
check('staff can check in golfer', r.ok);
check('staff cannot edit golfers directly', (await user(U.staffA,
  `update public.golfers set first_name='X' where id=$1 returning id`, [g1.golfer_id])).rows.length === 0);
check('staff cannot add contests', await fails(() => user(U.staffA,
  `insert into public.contests (event_id,name,kind,scoring_mode,unit) values ('00000000-0000-0000-0000-0000000000e1','x','other','latest_claim','none')`)));
const audit = (await user(U.ownerA, `select count(*)::int n from public.audit_log where table_name='contest_entries'`)).rows[0].n;
check('audit log records entry changes', audit >= 7, audit);
check('staff cannot read audit log', (await user(U.staffA, `select * from public.audit_log`)).rows.length === 0);

console.log('\nApproval mode');
await db.exec(`update public.contests set requires_approval = true where id='00000000-0000-0000-0000-0000000000c4'`);
const wr = (await anon(`select * from public.get_contest_roster('dev-women-ctp')`)).rows;
r = await submit('dev-women-ctp', wr[0].golfer_id, 20);
check('entry pending, no leader yet', r.status === 'pending' && r.leader.name === null, r);
r = (await user(U.staffA, `select public.review_contest_entry($1,'accepted') r`, [r.entry_id])).rows[0].r;
check('approval makes leader', r.ok && r.leader.name === wr[0].display_name, r);

console.log('\nSeparation between customers');
check('org B owner sees no org A golfers', (await user(U.ownerB, 'select * from public.golfers')).rows.length === 0);
check('org B owner sees no org A entries', (await user(U.ownerB, 'select * from public.contest_entries')).rows.length === 0);
check('org B owner cannot add golfer to org A event', await fails(() => user(U.ownerB,
  `insert into public.golfers (event_id, first_name, last_name) values ('00000000-0000-0000-0000-0000000000e1','Bad','Actor')`)));
r = (await user(U.ownerB, `select public.review_contest_entry($1,'void') r`, [e3.id])).rows[0].r;
check('org B owner cannot void org A entry', r.error === 'not_allowed', r);
check('org A owner sees 144 golfers', (await user(U.ownerA, 'select count(*)::int n from public.golfers')).rows[0].n === 144);
check('platform admin sees all orgs', (await user(U.admin, 'select count(*)::int n from public.organizations')).rows[0].n === 2);
check('owner cannot create organizations', await fails(() => user(U.ownerA, `insert into public.organizations (name) values ('x')`)));

console.log('\nEvent sponsor strip');
const EV = '00000000-0000-0000-0000-0000000000e1';
await user(U.ownerA, `insert into public.event_sponsors (event_id, sponsor_id, sort_order) values
  ('${EV}','00000000-0000-0000-0000-0000000000b3',2),('${EV}','00000000-0000-0000-0000-0000000000b1',1)`);
const strip = (await anon(`select public.get_contest_public('dev-women-long-drive') r`)).rows[0].r.event_sponsors;
check('strip returned in sort order', strip.length === 2 && strip[0].name === 'ABC Construction' && strip[1].name === 'Pacific Insurance', strip);
check('staff cannot change the strip', await fails(() => user(U.staffA,
  `insert into public.event_sponsors (event_id, sponsor_id) values ('${EV}','00000000-0000-0000-0000-0000000000b2')`)));
check('anon cannot read event_sponsors table', await fails(() => anon('select * from public.event_sponsors')));
check('org B owner cannot add to org A strip', await fails(() => user(U.ownerB,
  `insert into public.event_sponsors (event_id, sponsor_id) values ('${EV}','00000000-0000-0000-0000-0000000000b2')`)));
check('org B owner sees no org A strip rows', (await user(U.ownerB, 'select * from public.event_sponsors')).rows.length === 0);
await user(U.ownerA, `delete from public.sponsors where id='00000000-0000-0000-0000-0000000000b3'`);
const strip2 = (await anon(`select public.get_contest_public('dev-women-long-drive') r`)).rows[0].r.event_sponsors;
check('deleting a sponsor removes it from the strip', strip2.length === 1, strip2);

console.log('\nClosing');
await db.exec(`update public.contests set status='closed' where public_token='dev-men-ctp'`);
r = await submit('dev-men-ctp', roster[20].golfer_id, 3);
check('closed contest refuses entries', r.error === 'contest_closed', r);
check('closed contest leaderboard still public', (await anon(`select * from public.contest_leaders where contest_id='00000000-0000-0000-0000-0000000000c3'`)).rows.length === 1);
await db.exec(`update public.events set status='draft' where id='00000000-0000-0000-0000-0000000000e1'`);
check('draft event hides leaderboard from public', (await anon(`select * from public.contest_leaders`)).rows.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
