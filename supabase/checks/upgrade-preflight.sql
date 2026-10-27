-- READ ONLY. Run as the project database administrator, before the upgrade.
-- Save output privately: it contains account IDs/emails and deployment details.
-- This inventories the target; it does not certify compatibility or a backup.
begin transaction read only;
select current_database() as database_name, current_user as database_role, version();
select to_regclass('supabase_migrations.schema_migrations') as migration_history,
       to_regclass('storage.buckets') as storage_buckets,
       to_regclass('storage.objects') as storage_objects,
       to_regclass('public.event_staff_access') as upgrade_access_table;
select 'events' as entity, count(*) as row_count from public.events
union all select 'contests', count(*) from public.contests
union all select 'golfers', count(*) from public.golfers
union all select 'contest_entries', count(*) from public.contest_entries;
select a.user_id, u.email from private.platform_admins a
left join auth.users u on u.id=a.user_id order by a.user_id;
select organization_id,user_id,role from public.organization_members order by organization_id,user_id;
select id,organization_id,name,course_name,status from public.events order by id;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage','private')
order by schemaname,tablename,policyname;
select table_schema,table_name,grantee,privilege_type
from information_schema.table_privileges
where table_schema in ('public','private','storage') and grantee in ('PUBLIC','anon','authenticated')
order by table_schema,table_name,grantee,privilege_type;
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_userbyid(p.proowner) as function_owner,
       p.prosecdef as security_definer,p.proconfig,p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind in ('f','p')
order by n.nspname,p.proname,arguments;
select nspname,pg_get_userbyid(nspowner) as schema_owner,nspacl
from pg_namespace where nspname in ('public','private','storage') order by nspname;
select n.nspname,c.relname,pg_get_userbyid(c.relowner) as table_owner,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private','storage') and c.relkind in ('r','p')
order by n.nspname,c.relname;
select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private','storage') and not t.tgisinternal
order by n.nspname,c.relname,t.tgname;
select pubname,schemaname,tablename from pg_publication_tables
where pubname='supabase_realtime' order by schemaname,tablename;
rollback;
