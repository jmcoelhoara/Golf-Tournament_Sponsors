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
-- Honest SQL Storage fixture: metadata, bucket config and RLS, NOT HTTP/object service.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated;
`);
const dir = new URL('../migrations/', import.meta.url);
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
for (const f of files.filter(f=>f<'20261025000000')) await db.exec(fs.readFileSync(new URL(f,dir),'utf8'));
await db.exec(fs.readFileSync(new URL('../seed.sql',import.meta.url),'utf8'));
const U={platform:'10000000-0000-0000-0000-000000000001',owner:'10000000-0000-0000-0000-000000000002',staff:'10000000-0000-0000-0000-000000000003',other:'10000000-0000-0000-0000-000000000004',manager:'10000000-0000-0000-0000-000000000005'};
const ORG='00000000-0000-0000-0000-0000000000a1', OTHER='00000000-0000-0000-0000-0000000000a2', LEGACY='00000000-0000-0000-0000-0000000000e1';
await db.exec(`insert into auth.users values ${Object.entries(U).map(([k,v])=>`('${v}','${k}@test.invalid')`).join(',')};
insert into private.platform_admins(user_id) values('${U.platform}');
insert into public.organizations(id,name) values('${OTHER}','Other');
insert into public.organization_members(organization_id,user_id,role) values('${ORG}','${U.owner}','owner'),('${ORG}','${U.staff}','staff'),('${ORG}','${U.manager}','admin'),('${OTHER}','${U.other}','owner');`);
for (const f of files.filter(f=>f>='20261025000000')) await db.exec(fs.readFileSync(new URL(f,dir),'utf8'));
async function as(who,sql,args=[]) {
 await db.exec(`reset role; select set_config('request.jwt.claim.sub','${who ? U[who] : ''}',false); set role ${who?'authenticated':'anon'};`);
 try { return (await db.query(sql,args)).rows; } finally { await db.exec('reset role'); }
}
const rpc=async(who,sql,args=[]) => (await as(who,`select public.${sql} r`,args))[0].r;
async function denied(who,sql,args=[]) {
 try { const rows=await as(who,sql,args); return rows.length===0; }
 catch(error) {
  // A typo, missing RPC or broken fixture must not count as authorization enforcement.
  if(!['42501','P0001','23503','23514'].includes(error.code)) throw error;
  return true;
 }
}
check('legacy same-org ungranted owner sees no events',(await as('owner','select * from public.events')).length,0);
check('no inferred legacy grants',(await db.query('select * from public.event_staff_access')).rows.length,0);
check('platform sees legacy event',(await as('platform','select * from public.events')).length,1);
check('context lists creation organization without revealing events',(await rpc('staff','get_staff_context()')).creation_organizations.map(o=>o.id),[ORG]);
check('nonplatform staff account enumeration denied',await denied('owner','select * from public.list_staff_accounts($1)',[ORG]));
check('platform staff list contains existing members',(await as('platform','select * from public.list_staff_accounts($1)',[ORG])).length,3);
check('raw legacy event update denied',await denied('owner',`update public.events set name='hijack' returning id`));
check('raw event deletion denied even platform',await denied('platform','delete from public.events returning id'));
const course=crypto.randomUUID(), tee=crypto.randomUUID(), course2=crypto.randomUUID(), tee2=crypto.randomUUID(), otherCourse=crypto.randomUUID();
await as('platform','insert into public.courses(id,organization_id,name) values($1,$2,$3),($4,$2,$5),($6,$7,$8)',[course,ORG,'North',course2,'South',otherCourse,OTHER,'Other']);
await as('platform',`insert into public.course_tees(id,course_id,label) values($1,$2,'Blue'),($3,$4,'Blue')`,[tee,course,tee2,course2]);
await as('platform','insert into public.course_hole_yardages(tee_id,hole_number,yardage) values($1,12,396),($1,6,250),($2,12,410),($2,6,280)',[tee,tee2]);
check('staff cannot maintain course catalog',await denied('staff',`update public.course_hole_yardages set yardage=1 returning tee_id`));
check('exactly four initial presets',(await as('staff','select key from public.contest_presets order by key')).map(x=>x.key),['mens-closest-to-pin','mens-long-drive','womens-closest-to-pin','womens-long-drive']);
check('staff cannot inject preset',await denied('staff',`insert into public.contest_presets(key,name,kind,scoring_mode,unit) values('inject','Bad','other','highest_value','yards') returning key`));
let r=await rpc('staff','create_event($1,$2,$3,$4)',[OTHER,'Wrong',otherCourse,'2026-11-01']);
check('cannot create other org event',r.error,'not_allowed');
r=await rpc('staff','create_event($1,$2,$3,$4)',[ORG,'Wrong course',otherCourse,'2026-11-01']);
check('cross-org course rejected',r.error,'invalid_course');
r=await rpc('staff','create_event($1,$2,$3,$4)',[ORG,'Autumn',course,'2026-11-01']);
check('member creates event',r.ok); const event=r.event_id;
check('creator gets initial grant',(await as('staff','select id from public.events where id=$1',[event])).length,1);
check('new event starts draft',(await as('staff','select status from public.events where id=$1',[event]))[0].status,'draft');
check('same-org owner still cannot see created event',(await as('owner','select id from public.events where id=$1',[event])).length,0);
check('creator cannot grant access',(await rpc('staff','set_event_staff_access($1,$2,true)',[event,U.owner])).error,'not_allowed');
check('raw ACL writes denied',await denied('staff','update public.event_staff_access set revoked_at=null returning id'));
check('platform cannot grant to nonmember',(await rpc('platform','set_event_staff_access($1,$2,true)',[event,U.other])).error,'not_allowed');
check('platform revokes creator',(await rpc('platform','set_event_staff_access($1,$2,false)',[event,U.staff])).ok);
check('revoked creator has no persistent bypass',(await as('staff','select id from public.events where id=$1',[event])).length,0);
check('creator cannot self-regrant',(await rpc('staff','set_event_staff_access($1,$2,true)',[event,U.staff])).error,'not_allowed');
check('platform regrants creator',(await rpc('platform','set_event_staff_access($1,$2,true)',[event,U.staff])).ok);
check('free-form preset key rejected',(await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[event,'inject',12,tee])).error,'invalid_preset');
check('cross-course tee rejected',(await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[event,'mens-long-drive',12,tee2])).error,'invalid_placement');
check('missing tee hole rejected',(await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[event,'mens-long-drive',1,tee])).error,'invalid_placement');
r=await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[event,'mens-long-drive',12,tee]);
check('staff adds preset contest',r.ok); const contest=r.contest_id, token=r.public_token;
r=await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[event,'mens-closest-to-pin',6,tee]);
check('second contest added',r.ok); const contest2=r.contest_id, token2=r.public_token;
let snap=(await as('staff','select name,tees,hole_yardage,unit,scoring_mode,status from public.contests where id=$1',[contest]))[0];
check('DB derives exact scoring and placement snapshot',snap,{name:"Men's Long Drive",tees:'Blue',hole_yardage:396,unit:'none',scoring_mode:'latest_claim',status:'draft'});
check('cannot directly overwrite scoring snapshot',await denied('platform',`update public.contests set unit='yards',scoring_mode='highest_value' where id=$1 returning id`,[contest]));
await as('platform',`update public.course_hole_yardages set yardage=399 where tee_id=$1 and hole_number=12`,[tee]);
check('catalog edits do not rewrite contest snapshot',(await as('staff','select hole_yardage from public.contests where id=$1',[contest]))[0].hole_yardage,396);
check('explicit placement refreshes snapshot',(await rpc('staff','set_contest_placement($1,$2::smallint,$3)',[contest,12,tee])).ok);
check('refreshed yardage from DB',(await as('staff','select hole_yardage from public.contests where id=$1',[contest]))[0].hole_yardage,399);
check('course org cannot move',await denied('platform','update public.courses set organization_id=$1 where id=$2 returning id',[OTHER,course]));
check('tee cannot move course',await denied('platform','update public.course_tees set course_id=$1 where id=$2 returning id',[course2,tee]));
check('yardage key cannot move',await denied('platform','update public.course_hole_yardages set hole_number=13 where tee_id=$1 and hole_number=12 returning tee_id',[tee]));
check('referenced yardage cannot be deleted',await denied('platform','delete from public.course_hole_yardages where tee_id=$1 and hole_number=12 returning tee_id',[tee]));
check('ungranted owner cannot alter placement',(await rpc('owner','set_contest_placement($1,$2::smallint,$3)',[contest,6,tee])).error,'not_allowed');
const placements=[{contest_id:contest,tee_id:tee2,hole_number:12},{contest_id:contest2,tee_id:tee2,hole_number:6}];
check('course change requires complete placements',(await rpc('staff','update_event($1,$2,$3,$4)',[event,'Moved',course2,'2026-11-02'])).error,'placements_required');
check('partial placements rejected',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved',course2,'2026-11-02',JSON.stringify(placements.slice(0,1))])).error,'placements_required');
check('invalid second placement rejects entire course update',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved',course2,'2026-11-02',JSON.stringify([placements[0],{...placements[1],hole_number:1}])])).error,'invalid_placement');
check('failed update retains original event',(await as('staff','select name,course_id from public.events where id=$1',[event]))[0],{name:'Autumn',course_id:course});
check('failed update retains first contest snapshot',(await as('staff','select tee_id,hole_yardage from public.contests where id=$1',[contest]))[0],{tee_id:tee,hole_yardage:399});
check('duplicate placement rejected',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved',course2,'2026-11-02',JSON.stringify([placements[0],placements[0]])])).error,'placements_required');
// PostgreSQL accepts alternate UUID spellings; distinct raw JSON strings are not distinct contests.
check('UUID aliases cannot disguise duplicate contest placements',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved',course2,'2026-11-02',JSON.stringify([placements[0],{...placements[0],contest_id:`{${contest}}`}])])).error,'placements_required');
check('aliased duplicate retains entire original course',(await as('staff','select course_id from public.events where id=$1',[event]))[0].course_id,course);
check('malformed placement rejected safely',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved',course2,'2026-11-02',JSON.stringify([{contest_id:'bad'}])])).error,'invalid_placement');
check('complete atomic course reassignment succeeds',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved',course2,'2026-11-02',JSON.stringify(placements)])).ok);
check('same tee label uses new course yardage',(await as('staff','select hole_yardage from public.contests where id=$1',[contest]))[0].hole_yardage,410);
check('course name snapshot refreshed',(await as('staff','select course_name from public.events where id=$1',[event]))[0].course_name,'South');
check('owner cannot update event',(await rpc('owner','update_event($1,$2,$3,$4)',[event,'Hijack',course2,'2026-11-02'])).error,'not_allowed');
check('event archive cannot use status RPC',(await rpc('staff',`set_event_status($1,'archived')`,[event])).error,'invalid_transition');
check('staff can make event live',(await rpc('staff',`set_event_status($1,'live')`,[event])).ok);
check('staff can open contest',(await rpc('staff',`set_contest_status($1,'open')`,[contest])).ok);
check('staff can open second contest',(await rpc('staff',`set_contest_status($1,'open')`,[contest2])).ok);
check('existing tokens retained after event/placement changes',(await as('staff','select public_token from public.contests where id=$1',[contest]))[0].public_token,token);
const legacyRoster=await as(null,`select * from public.get_contest_roster('dev-men-ctp')`), legacyGolfer=legacyRoster[0].golfer_id;
const legacyReceipt=await rpc(null,`submit_contest_entry('dev-men-ctp',$1,25,$2)`,[legacyGolfer,crypto.randomUUID()]);
check('ungranted owner cannot check in legacy golfer',(await rpc('owner','check_in_golfer($1)',[legacyGolfer])).error,'not_allowed');
check('ungranted owner cannot review legacy entry',(await rpc('owner',`review_contest_entry($1,'void')`,[legacyReceipt.entry_id])).error,'not_allowed');
check('ungranted owner cannot correct legacy entry',(await rpc('owner',`correct_contest_entry($1,1,'bypass')`,[legacyReceipt.entry_id])).error,'not_allowed');
check('ungranted owner cannot rotate legacy QR',(await rpc('owner','regenerate_contest_token($1)',['00000000-0000-0000-0000-0000000000c3'])).error,'not_allowed');
check('authenticated public leaderboard policy does not bypass grant',(await as('owner','select * from public.contest_leaders')).length,0);
await rpc('platform','set_event_staff_access($1,$2,true)',[LEGACY,U.staff]);
check('granted staff can check in',(await rpc('staff','check_in_golfer($1)',[legacyGolfer])).ok);
check('granted staff cannot correct',(await rpc('staff',`correct_contest_entry($1,1,'no manager role')`,[legacyReceipt.entry_id])).error,'not_allowed');
check('granted staff cannot rotate token',(await rpc('staff','regenerate_contest_token($1)',['00000000-0000-0000-0000-0000000000c3'])).error,'not_allowed');
await rpc('platform','set_event_staff_access($1,$2,false)',[LEGACY,U.staff]);
check('revoked staff cannot check in without logout',(await rpc('staff','check_in_golfer($1)',[legacyGolfer])).error,'not_allowed');
check('revoked staff cannot read entries',(await as('staff','select * from public.contest_entries where event_id=$1',[LEGACY])).length,0);
check('public event-media bucket configured',(await db.query(`select public,file_size_limit,allowed_mime_types from storage.buckets where id='event-media'`)).rows,[{public:true,file_size_limit:10485760,allowed_mime_types:['image/png','image/jpeg','image/webp']}]);
const path=(ev=event,org=ORG,ext='png')=>`${org}/${ev}/${crypto.randomUUID()}.${ext}`;
const logoPath=path(), bannerPath=path(), logoPath2=path();
const upload=async(who,p,mime='image/png',size=1024)=>as(who,`insert into storage.objects(bucket_id,name,metadata) values('event-media',$1,jsonb_build_object('mimetype',$2::text,'size',$3::bigint)) returning id`,[p,mime,size]);
check('granted staff can upload new immutable object',(await upload('staff',logoPath)).length,1);
await upload('staff',bannerPath); await upload('staff',logoPath2);
check('ungranted owner upload denied',await denied('owner',`insert into storage.objects(bucket_id,name,metadata) values('event-media',$1,'{}') returning id`,[path()]));
for(const bad of ['bad/event/file.png',`${ORG}/${event}/../x.png`,`${ORG}/${event}/${crypto.randomUUID()}.svg`,`${ORG}/${event}/${crypto.randomUUID()}.png/more`,`${OTHER}/${event}/${crypto.randomUUID()}.png`,`${ORG}/${LEGACY}/${crypto.randomUUID()}.png`]) {
 check(`malformed or unauthorized path denied: ${bad}`,await denied('staff',`insert into storage.objects(bucket_id,name,metadata) values('event-media',$1,'{}') returning id`,[bad]));
}
check('no overwrite policy for staff',await denied('staff',`update storage.objects set metadata='{}' where name=$1 returning id`,[logoPath]));
check('no overwrite policy even platform',await denied('platform',`update storage.objects set name=$1 where name=$2 returning id`,[path(),logoPath]));
check('no client object delete',await denied('platform','delete from storage.objects where name=$1 returning id',[bannerPath]));
check('ordinary org manager legacy upload denied',await denied('owner',`insert into storage.objects(bucket_id,name) values('sponsor-logos',$1) returning id`,[`${ORG}/legacy.png`]));
check('platform legacy immutable upload allowed',(await as('platform',`insert into storage.objects(bucket_id,name) values('sponsor-logos',$1) returning id`,[`${ORG}/legacy.png`])).length,1);
check('legacy delete also denied platform',await denied('platform',`delete from storage.objects where bucket_id='sponsor-logos' returning id`));
check('missing object registration rejected',(await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'event_logo',path(),'Missing'])).error,'invalid_image');
check('wrong kind rejected',(await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'sponsor',logoPath,'Wrong'])).error,'invalid_image');
r=await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'event_logo',logoPath,'Tournament']);
check('register actual uploaded logo',r.ok); const logo=r.image_id;
r=await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'sponsor_banner',bannerPath,'Sponsors']);
check('register actual uploaded banner',r.ok); const banner=r.image_id;
r=await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'event_logo',logoPath2,'New logo']);
check('register replacement logo',r.ok); const logo2=r.image_id;
check('metadata is server derived',(await as('staff','select mime_type,size_bytes,uploaded_by from public.event_images where id=$1',[logo]))[0],{mime_type:'image/png',size_bytes:1024,uploaded_by:U.staff});
check('client cannot rewrite media metadata',await denied('platform',`update public.event_images set object_path='changed' returning id`));
check('client cannot delete image metadata',await denied('platform','delete from public.event_images returning id'));
check('logo selection succeeds',(await rpc('staff','set_event_logo($1,$2)',[event,logo])).ok);
check('banner kind cannot be logo',(await rpc('staff','set_event_logo($1,$2)',[event,banner])).error,'invalid_image');
check('logo kind cannot be banner',(await rpc('staff','set_contest_banner($1,$2)',[contest,logo])).error,'invalid_image');
check('one banner can serve contest A',(await rpc('staff','set_contest_banner($1,$2)',[contest,banner])).ok);
check('one banner can serve contest B',(await rpc('staff','set_contest_banner($1,$2)',[contest2,banner])).ok);
let details=await rpc(null,'get_contest_public($1)',[token]);
check('public payload adds shared logo',details.event.logo,{bucket:'event-media',path:logoPath,alt_text:'Tournament'});
check('public payload adds exactly one selected banner',details.sponsor_banner,{id:banner,bucket:'event-media',path:bannerPath,alt_text:'Sponsors'});
check('yardage and score units stay distinct',[details.hole_distance_unit,details.unit],['yards','none']);
check('second contest shares logo',(await rpc(null,'get_contest_public($1)',[token2])).event.logo.path,logoPath);
await rpc('staff','set_event_logo($1,$2)',[event,logo2]);
check('logo change updates both public contests',[(await rpc(null,'get_contest_public($1)',[token])).event.logo.path,(await rpc(null,'get_contest_public($1)',[token2])).event.logo.path],[logoPath2,logoPath2]);
check('print SQL reads same current event logo for both contests',(await as('staff','select i.object_path from public.contests c join public.events e on e.id=c.event_id join public.event_images i on i.id=e.logo_image_id where c.event_id=$1 order by c.id',[event])).map(x=>x.object_path),[logoPath2,logoPath2]);
check('clearing A banner succeeds',(await rpc('staff','set_contest_banner($1,null)',[contest])).ok);
check('clearing A does not change B',(await rpc(null,'get_contest_public($1)',[token2])).sponsor_banner.id,banner);
check('clearing selection preserves all library images',(await as('staff','select * from public.event_images where event_id=$1',[event])).length,3);
const eventB=(await rpc('staff','create_event($1,$2,$3,$4)',[ORG,'Other accessible event',course2,'2026-11-03'])).event_id;
const contestB=(await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[eventB,'mens-long-drive',12,tee2])).contest_id;
check('cross-event logo rejected even with both grants',(await rpc('staff','set_event_logo($1,$2)',[eventB,logo])).error,'image_not_in_event');
check('cross-event banner rejected even with both grants',(await rpc('staff','set_contest_banner($1,$2)',[contestB,banner])).error,'image_not_in_event');
for(const [mime,size] of [['image/svg+xml',10],['image/png',10485761],['image/png',0],['image/jpeg',10]]){
 const p=path(); await upload('staff',p,mime,size);
 check(`invalid object metadata ${mime}/${size} rejected`,(await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'event_logo',p,'Bad'])).error,'invalid_image');
}
await rpc('platform','set_event_staff_access($1,$2,false)',[event,U.staff]);
check('revocation hides image library',(await as('staff','select * from public.event_images where event_id=$1',[event])).length,0);
check('revocation hides storage listing',(await as('staff',`select * from storage.objects where name=$1`,[logoPath])).length,0);
check('revoked upload denied',await denied('staff',`insert into storage.objects(bucket_id,name) values('event-media',$1) returning id`,[path()]));
check('revoked logo mutation denied',(await rpc('staff','set_event_logo($1,null)',[event])).error,'not_allowed');
check('public marketing image metadata stays public by token',(await rpc(null,'get_contest_public($1)',[token])).event.logo.path,logoPath2);
await rpc('platform','set_event_staff_access($1,$2,true)',[event,U.staff]);
const golfer=crypto.randomUUID(), golfer2=crypto.randomUUID();
await db.query(`insert into public.golfers(id,event_id,first_name,last_name,division) values($1,$2,'A','Golfer','Men'),($3,$2,'B','Golfer','Men')`,[golfer,event,golfer2]);
await as('platform',`insert into public.teams(event_id,name) values($1,'Private team')`,[event]);
await as('platform',`insert into public.event_sponsors(event_id,sponsor_id) values($1,'00000000-0000-0000-0000-0000000000b1')`,[event]);
const req=crypto.randomUUID(), req2=crypto.randomUUID();
const receipt=await rpc(null,'submit_contest_entry($1,$2,$3,$4)',[token2,golfer,12.345,req]);
check('new CTP retains inches and numeric rounding',[receipt.ok,Number(receipt.leader.value),receipt.leader.unit],[true,12.35,'inches']);
const receipt2=await rpc(null,'submit_contest_entry($1,$2,null,$3)',[token,golfer,req2]);
check('new longest drive remains marker claim',receipt2.ok);
check('ungranted same-org owner cannot archive contest',(await rpc('owner','archive_contest($1)',[contest2])).error,'not_allowed');
check('archive contest succeeds',(await rpc('staff','archive_contest($1)',[contest2])).ok);
const archivedAt=(await as('staff','select archived_at from public.contests where id=$1',[contest2]))[0].archived_at;
check('archive contest retry succeeds',(await rpc('staff','archive_contest($1)',[contest2])).ok);
check('archive timestamp stable',(await as('staff','select archived_at from public.contests where id=$1',[contest2]))[0].archived_at,archivedAt);
check('archived contest hidden publicly',(await rpc(null,'get_contest_public($1)',[token2])).available,false);
check('archived roster empty',(await as(null,'select * from public.get_contest_roster($1)',[token2])).length,0);
check('archived public leader hidden',(await as(null,'select * from public.contest_leaders where contest_id=$1',[contest2])).length,0);
r=await rpc(null,'submit_contest_entry($1,$2,$3,$4)',[token2,golfer,12.345,req]);
check('archived contest retry returns same receipt without leader',[r.ok,r.repeat,r.entry_id,r.leader],[true,true,receipt.entry_id,null]);
check('archived contest blocks new submission',(await rpc(null,'submit_contest_entry($1,$2,1,$3)',[token2,golfer2,crypto.randomUUID()])).error,'contest_closed');
check('archived contest blocks placement edits',(await rpc('staff','set_contest_placement($1,$2::smallint,$3)',[contest2,12,tee2])).error,'archived');
check('archived contest blocks review',(await rpc('platform',`review_contest_entry($1,'void')`,[receipt.entry_id])).error,'archived');
check('archived contest blocks correction',(await rpc('platform',`correct_contest_entry($1,1,'blocked')`,[receipt.entry_id])).error,'archived');
check('archived contest blocks QR rotation',(await rpc('platform','regenerate_contest_token($1)',[contest2])).error,'archived');
check('course reassignment excludes archived contests',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[event,'Moved again',course,'2026-11-04',JSON.stringify([{contest_id:contest,tee_id:tee,hole_number:12}])])).ok);
check('archived placement snapshot retained',(await as('staff','select tee_id,hole_yardage from public.contests where id=$1',[contest2]))[0],{tee_id:tee2,hole_yardage:280});
check('event archival succeeds',(await rpc('staff','archive_event($1)',[event])).ok);
check('event archive is idempotent',(await rpc('staff','archive_event($1)',[event])).ok);
check('event archive preserves child status history',(await as('platform','select status,archived_at from public.contests where id=$1',[contest]))[0],{status:'open',archived_at:null});
check('archived event blocks ordinary edit',(await rpc('staff','update_event($1,$2,$3,$4)',[event,'No',course,'2026-11-05'])).error,'archived');
check('archived event blocks new submission',(await rpc(null,'submit_contest_entry($1,$2,null,$3)',[token,golfer2,crypto.randomUUID()])).error,'event_not_live');
r=await rpc(null,'submit_contest_entry($1,$2,null,$3)',[token,golfer,req2]);
check('archived event retry preserves receipt but hides leader',[r.ok,r.repeat,r.entry_id,r.leader],[true,true,receipt2.entry_id,null]);
check('archived event public data hidden',(await rpc(null,'get_contest_public($1)',[token])).available,false);
check('archived event leaders not public',(await as(null,'select * from public.contest_leaders where event_id=$1',[event])).length,0);
check('archival retains both entries',(await as('platform','select * from public.contest_entries where event_id=$1',[event])).length,2);
check('archival retains leader rows for staff history',(await as('platform','select * from public.contest_leaders where event_id=$1',[event])).length,2);
check('archival retains library',(await as('platform','select * from public.event_images where event_id=$1',[event])).length,3);
check('archival retains current logo',(await as('platform','select logo_image_id from public.events where id=$1',[event]))[0].logo_image_id,logo2);
check('archival retains original tokens',(await as('platform','select public_token from public.contests where id=$1',[contest2]))[0].public_token,token2);
check('archive blocks object upload',await denied('staff',`insert into storage.objects(bucket_id,name) values('event-media',$1) returning id`,[path()]));
check('archive blocks registration',(await rpc('staff','register_event_image($1,$2,$3,$4)',[event,'event_logo',path(),'No'])).error,'archived');
check('platform can still manage archived ACL',(await rpc('platform','set_event_staff_access($1,$2,false)',[event,U.staff])).ok);
check('revoked creator cannot view archive',(await as('staff','select * from public.events where id=$1',[event])).length,0);
check('platform sees archive',(await as('platform','select status from public.events where id=$1',[event]))[0].status,'archived');
check('event-scoped audit includes grants,images,placement and archives',new Set((await as('platform','select distinct table_name from public.audit_log where event_id=$1',[event])).map(x=>x.table_name)),new Set(['events','event_staff_access','contests','event_images','golfers','teams','event_sponsors','contest_entries']));
check('entry, leader and audit cannot be truncated',(await as('staff',`select has_table_privilege(current_user,'public.contest_entries','TRUNCATE') as entries,has_table_privilege(current_user,'public.contest_leaders','TRUNCATE') as leaders,has_table_privilege(current_user,'public.audit_log','TRUNCATE') as audit`))[0],{entries:false,leaders:false,audit:false});
check('no PUBLIC executable private helpers',(await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and a.grantee=0 and a.privilege_type='EXECUTE'`)).rows,[]);
check('anon can execute only golfer public APIs',(await db.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE') order by proname`)).rows.map(x=>x.proname),['get_contest_public','get_contest_roster','submit_contest_entry']);
// M1: catalog archival alone must not freeze a granted creator's event metadata.
const retiredCourse=crypto.randomUUID(), retiredTee=crypto.randomUUID();
await as('platform',`insert into public.courses(id,organization_id,name) values($1,$2,'Retiring course')`,[retiredCourse,ORG]);
await as('platform',`insert into public.course_tees(id,course_id,label) values($1,$2,'Gold')`,[retiredTee,retiredCourse]);
await as('platform',`insert into public.course_hole_yardages(tee_id,hole_number,yardage) values($1,6,180),($1,12,360)`,[retiredTee]);
r=await rpc('staff','create_event($1,$2,$3,$4)',[ORG,'Before catalog archive',retiredCourse,'2026-11-06']);
check('M1 ordinary staff creates event before catalog archive',r.ok); const retiredEvent=r.event_id;
check('M1 creator has active explicit grant',(await as('staff','select user_id,revoked_at from public.event_staff_access where event_id=$1',[retiredEvent])),[{user_id:U.staff,revoked_at:null}]);
r=await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[retiredEvent,'mens-long-drive',12,retiredTee]);
check('M1 fixture has long-drive placement',r.ok); const retiredContest=r.contest_id;
r=await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[retiredEvent,'mens-closest-to-pin',6,retiredTee]);
check('M1 fixture has CTP placement',r.ok); const retiredContest2=r.contest_id;
const retiredSnapshots=await as('staff','select * from public.contests where event_id=$1 order by id',[retiredEvent]);
await as('platform',`update public.courses set archived_at=now(),name='Changed catalog name' where id=$1`,[retiredCourse]);
await as('platform',`update public.course_tees set label='Changed catalog tee' where id=$1`,[retiredTee]);
await as('platform',`update public.course_hole_yardages set yardage=yardage+10 where tee_id=$1`,[retiredTee]);
check('M1 only course archived; tee remains active',(await as('platform','select archived_at is not null as archived from public.courses where id=$1',[retiredCourse]))[0].archived && (await as('platform','select archived_at is null as active from public.course_tees where id=$1',[retiredTee]))[0].active);
check('M1 granted creator edits title/date retaining archived course',(await rpc('staff','update_event($1,$2,$3,$4)',[retiredEvent,'After catalog archive',retiredCourse,'2026-11-07'])),{ok:true,event_id:retiredEvent});
check('M1 metadata updated without refreshing course snapshot',(await as('staff','select name,event_date::text,course_id,course_name,status,archived_at,created_by from public.events where id=$1',[retiredEvent]))[0],{name:'After catalog archive',event_date:'2026-11-07',course_id:retiredCourse,course_name:'Retiring course',status:'draft',archived_at:null,created_by:U.staff});
check('M1 metadata edit preserves all placement/scoring/token snapshots',await as('staff','select * from public.contests where event_id=$1 order by id',[retiredEvent]),retiredSnapshots);
// Guard the exception: SQL NULL means no placement request; arrays still mean new placements.
check('M1 explicit SQL NULL placements also permit metadata-only edit',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[retiredEvent,'Explicit null metadata',retiredCourse,'2026-11-08',null])),{ok:true,event_id:retiredEvent});
const retiredEventState=await as('staff','select * from public.events where id=$1',[retiredEvent]);
const activeEventState=await as('staff','select * from public.events where id=$1',[eventB]);
const activeContestState=await as('staff','select * from public.contests where id=$1',[contestB]);
const retiredPlacements=[{contest_id:retiredContest,tee_id:retiredTee,hole_number:12},{contest_id:retiredContest2,tee_id:retiredTee,hole_number:6}];
check('M1 archived course still rejected for new event',(await rpc('staff','create_event($1,$2,$3,$4)',[ORG,'Rejected archived target',retiredCourse,'2026-11-09'])).error,'invalid_course');
check('M1 archived target rejected for actual course change without placements',(await rpc('staff','update_event($1,$2,$3,$4)',[eventB,'Rejected course change',retiredCourse,'2026-11-09'])).error,'invalid_course');
check('M1 archived target rejected for complete actual course change',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[eventB,'Rejected course change',retiredCourse,'2026-11-09',JSON.stringify([{contest_id:contestB,tee_id:retiredTee,hole_number:12}])])).error,'invalid_course');
check('M1 rejected course change preserves entire active event',await as('staff','select * from public.events where id=$1',[eventB]),activeEventState);
check('M1 rejected course change preserves entire active contest',await as('staff','select * from public.contests where id=$1',[contestB]),activeContestState);
for(const placementRequest of ['[]',JSON.stringify(retiredPlacements)]) {
 check(`M1 archived same-course explicit placements rejected: ${placementRequest==='[]'?'empty':'complete'}`,(await rpc('staff','update_event($1,$2,$3,$4,$5)',[retiredEvent,'Rejected placement',retiredCourse,'2026-11-09',placementRequest])).error,'invalid_course');
}
check('M1 archived course still rejects standalone placement',(await rpc('staff','set_contest_placement($1,$2::smallint,$3)',[retiredContest,6,retiredTee])).error,'invalid_placement');
check('M1 archived course still rejects new contest placement',(await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[retiredEvent,'mens-long-drive',12,retiredTee])).error,'invalid_placement');
check('M1 rejected placements preserve entire event',await as('staff','select * from public.events where id=$1',[retiredEvent]),retiredEventState);
check('M1 explicit null and rejected placements retain all contest snapshots',await as('staff','select * from public.contests where event_id=$1 order by id',[retiredEvent]),retiredSnapshots);
check('M1 catalog archive does not prevent leaving for an active course',(await rpc('staff','update_event($1,$2,$3,$4,$5)',[retiredEvent,'Moved off archived course',course2,'2026-11-10',JSON.stringify([{contest_id:retiredContest,tee_id:tee2,hole_number:12},{contest_id:retiredContest2,tee_id:tee2,hole_number:6}])])).ok);
check('M1 leaving archived course refreshes course and placement snapshots',(await as('staff',`select e.course_id,e.course_name,c.tee_id,c.tees,c.hole_yardage from public.events e join public.contests c on c.event_id=e.id where c.id=$1`,[retiredContest]))[0],{course_id:course2,course_name:'South',tee_id:tee2,tees:'Blue',hole_yardage:410});
check('M1 leaving archived course preserves scoring and QR tokens',(await as('staff','select id,preset_key,name,kind,division,scoring_mode,unit,min_value,max_value,requires_approval,public_token from public.contests where event_id=$1 order by id',[retiredEvent])),retiredSnapshots.map(({id,preset_key,name,kind,division,scoring_mode,unit,min_value,max_value,requires_approval,public_token})=>({id,preset_key,name,kind,division,scoring_mode,unit,min_value,max_value,requires_approval,public_token})));
await as('platform',`insert into public.contest_presets(key,name,kind,scoring_mode,unit,active) values('retired-unused','Retired','other','highest_value','yards',false)`);
check('unreferenced inactive presets hidden from ordinary staff',(await as('staff',`select key from public.contest_presets where key='retired-unused'`)).length,0);
await as('platform',`update public.contest_presets set active=false,name='Renamed catalog definition' where key='mens-long-drive'`);
check('referenced inactive preset remains readable',(await as('staff',`select key from public.contest_presets where key='mens-long-drive'`)).length,1);
check('catalog preset edit does not rewrite existing scoring snapshot',(await as('staff','select name,unit,scoring_mode from public.contests where id=$1',[contestB]))[0],{name:"Men's Long Drive",unit:'none',scoring_mode:'latest_claim'});
check('inactive preset cannot be added',(await rpc('staff','add_event_contest($1,$2,$3::smallint,$4)',[eventB,'mens-long-drive',12,tee2])).error,'invalid_preset');
await as('platform','update public.course_tees set archived_at=now() where id=$1',[tee2]);
check('archived tee cannot be newly placed',(await rpc('staff','set_contest_placement($1,$2::smallint,$3)',[contestB,6,tee2])).error,'invalid_placement');
check('archived referenced catalog still readable',(await as('staff','select * from public.course_tees where id=$1',[tee2])).length,1);
await as('platform','update public.courses set archived_at=now() where id=$1',[course2]);
check('archived course unavailable for new event',(await rpc('staff','create_event($1,$2,$3,$4)',[ORG,'No',course2,'2026-12-01'])).error,'invalid_course');
check('malformed storage path parser returns null',(await as('staff',`select private.event_media_path('not-a-uuid/not-an-event/file.png') is null as safe`))[0].safe);
check('anonymous cannot inspect new courses',await denied(null,'select * from public.courses'));
check('anonymous cannot upload Storage objects',await denied(null,`insert into storage.objects(bucket_id,name) values('event-media',$1) returning id`,[path(eventB)]));
check('platform cannot raw-insert grant rows',await denied('platform','insert into public.event_staff_access(event_id,organization_id,user_id) values($1,$2,$3) returning id',[eventB,ORG,U.owner]));
check('creator identity cannot be overwritten through direct DML',await denied('staff','update public.events set created_by=$1 where id=$2 returning id',[U.owner,eventB]));
check('contest identity cannot be moved through direct DML',await denied('staff','update public.contests set event_id=$1 where id=$2 returning id',[LEGACY,contestB]));
// Full private-read and mutation matrix, including same-org managers and revoked creator.
const hiddenReads=[
 ['events','select id from public.events where id=$1'],
 ...['contests','teams','golfers','contest_entries','contest_leaders','event_images','event_sponsors','audit_log'].map(t=>[t,`select * from public.${t} where event_id=$1`]),
 ['print join','select c.id,e.logo_image_id from public.contests c join public.events e on e.id=c.event_id where e.id=$1']
];
const blockedMutations=[
 ['update_event($1,$2,$3,$4)',[event,'Denied',course,'2026-12-01']],
 ["set_event_status($1,'live')",[event]],['archive_event($1)',[event]],
 ['add_event_contest($1,$2,$3::smallint,$4)',[event,'mens-closest-to-pin',12,tee]],
 ['set_contest_placement($1,$2::smallint,$3)',[contest,12,tee]],
 ["set_contest_status($1,'open')",[contest]],['archive_contest($1)',[contest]],
 ['register_event_image($1,$2,$3,$4)',[event,'event_logo',logoPath,'Denied']],
 ['set_event_logo($1,$2)',[event,logo]],['set_contest_banner($1,$2)',[contest,banner]],
 ['check_in_golfer($1)',[golfer]],["review_contest_entry($1,'void')",[receipt.entry_id]],
 ["correct_contest_entry($1,1,'Denied')",[receipt.entry_id]],['regenerate_contest_token($1)',[contest]]
];
for(const [name,sql] of hiddenReads)check(`permission fixture contains ${name}`,(await as('platform',sql,[event])).length>0);
for(const who of ['owner','manager','other','staff']){
 for(const [name,sql] of hiddenReads)check(`${who} cannot read ungranted ${name}`,(await as(who,sql,[event])).length,0);
 for(const [sql,args] of blockedMutations)check(`${who} cannot invoke ${sql.split('(')[0]} without grant`,(await rpc(who,sql,args)).error,'not_allowed');
}
check('owner cannot promote own membership',await denied('owner',`update public.organization_members set role='admin' where user_id=$1 returning user_id`,[U.owner]));
check('owner cannot add organization members',await denied('owner',`insert into public.organization_members(organization_id,user_id,role) values($1,$2,'staff') returning user_id`,[ORG,U.other]));
check('ordinary member sees only own membership',(await as('owner','select user_id from public.organization_members')).map(x=>x.user_id),[U.owner]);
await rpc('platform','set_event_staff_access($1,$2,true)',[eventB,U.manager]);
const managedGolfer=crypto.randomUUID();
check('granted manager retains roster insert',(await as('manager',`insert into public.golfers(id,event_id,first_name,last_name) values($1,$2,'Managed','Golfer') returning id`,[managedGolfer,eventB])).length,1);
check('granted manager retains roster update',(await as('manager',`update public.golfers set first_name='Updated' where id=$1 returning id`,[managedGolfer])).length,1);
check('granted manager can read event audit',(await as('manager','select * from public.audit_log where event_id=$1',[eventB])).length>0);
check('granted manager cannot read event-null audit',(await as('manager','select * from public.audit_log where event_id is null')).length,0);
check('granted manager cannot change ACL',(await rpc('manager','set_event_staff_access($1,$2,true)',[eventB,U.owner])).error,'not_allowed');
await rpc('platform','set_event_staff_access($1,$2,false)',[eventB,U.manager]);
check('revoked manager roster write affects zero rows',(await as('manager',`update public.golfers set first_name='Denied' where id=$1 returning id`,[managedGolfer])).length,0);
check('revoked manager audit access gone',(await as('manager','select * from public.audit_log where event_id=$1',[eventB])).length,0);
// Trusted fixture removal simulates out-of-band membership removal; ACL remains active.
await db.query('delete from public.organization_members where organization_id=$1 and user_id=$2',[ORG,U.staff]);
check('active creator ACL alone does not replace current membership',(await as('staff','select id from public.events where id=$1',[eventB])).length,0);
check('former member cannot edit via stale active ACL',(await rpc('staff',"set_event_status($1,'live')",[eventB])).error,'not_allowed');
await as('platform',`insert into public.organization_members(organization_id,user_id,role) values($1,$2,'staff')`,[ORG,U.staff]);
check('restored membership and existing grant restore access',(await as('staff','select id from public.events where id=$1',[eventB])).length,1);
const retainedPath=path(eventB);
await upload('staff',retainedPath);
const retainedImage=(await rpc('staff','register_event_image($1,$2,$3,$4)',[eventB,'event_logo',retainedPath,'Retained logo'])).image_id;
check('logo selection before deleting every contest',(await rpc('staff','set_event_logo($1,$2)',[eventB,retainedImage])).ok);
check('archive the last operational contest',(await rpc('staff','archive_contest($1)',[contestB])).ok);
check('no active contests remain',(await as('staff','select id from public.contests where event_id=$1 and archived_at is null',[eventB])).length,0);
check('deleting every contest keeps tournament logo',(await as('staff','select logo_image_id from public.events where id=$1',[eventB]))[0].logo_image_id,retainedImage);
check('deleting every contest keeps event image library',(await as('staff','select id from public.event_images where event_id=$1',[eventB])).map(x=>x.id),[retainedImage]);
check('deleting every contest keeps uploaded object',(await as('staff','select name from storage.objects where name=$1',[retainedPath])).map(x=>x.name),[retainedPath]);
// This is real SQL lock-order inspection, not a claim of concurrent PostgreSQL sessions.
const submissionBody=(await db.query("select pg_get_functiondef('public.submit_contest_entry(text,uuid,numeric,uuid)'::regprocedure) body")).rows[0].body;
const eventLockIndex=submissionBody.indexOf('from public.events where id=v_c.event_id for update');
const contestLockIndex=submissionBody.indexOf('from public.contests where public_token=p_token for update');
check('submission SQL locks event before contest',eventLockIndex>=0 && contestLockIndex>eventLockIndex);
console.log(`Upgrade suite: ${count} passed`);
await db.close();
