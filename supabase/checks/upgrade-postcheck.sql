-- READ ONLY. Structural checks, not a substitute for authenticated HTTP tests.
-- Run as project database administrator after a successful upgrade.
begin transaction read only;
do $$
declare t text; r text; f text;
begin
  foreach t in array array['courses','course_tees','course_hole_yardages','contest_presets','event_staff_access','event_images'] loop
    if to_regclass('public.'||t) is null then raise exception 'Missing upgrade table: %',t; end if;
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity) then
      raise exception 'RLS disabled: %',t;
    end if;
  end loop;
  foreach t in array array['events','contests','event_staff_access','event_images','contest_entries','contest_leaders','audit_log'] loop
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') then
        raise exception 'Unexpected direct mutation privilege: %.%',r,t;
      end if;
    end loop;
  end loop;
  foreach f in array array[
    'public.get_staff_context()', 'public.list_staff_accounts(uuid)',
    'public.create_event(uuid,text,uuid,date)',
    'public.update_event(uuid,text,uuid,date,jsonb)',
    'public.set_event_staff_access(uuid,uuid,boolean)',
    'public.add_event_contest(uuid,text,smallint,uuid)',
    'public.set_contest_placement(uuid,smallint,uuid)',
    'public.set_event_status(uuid,public.event_status)',
    'public.set_contest_status(uuid,public.contest_status)',
    'public.archive_event(uuid)', 'public.archive_contest(uuid)',
    'public.register_event_image(uuid,text,text,text)',
    'public.set_event_logo(uuid,uuid)', 'public.set_contest_banner(uuid,uuid)'
  ] loop
    if to_regprocedure(f) is null then raise exception 'Missing RPC: %',f; end if;
    if not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') then
      raise exception 'Unexpected RPC execute privilege: %',f;
    end if;
  end loop;
  if not exists(select 1 from storage.buckets where id='event-media' and public
    and file_size_limit=10485760 and allowed_mime_types @> array['image/png','image/jpeg','image/webp']::text[]
    and allowed_mime_types <@ array['image/png','image/jpeg','image/webp']::text[]) then
    raise exception 'event-media bucket configuration missing or incorrect';
  end if;
  foreach t in array array['event_media_select','event_media_insert'] loop
    if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname=t) then
      raise exception 'Missing Storage policy: %',t;
    end if;
  end loop;
  foreach t in array array['mens-long-drive','womens-long-drive','mens-closest-to-pin','womens-closest-to-pin'] loop
    if not exists(select 1 from public.contest_presets where key=t and active) then
      raise exception 'Missing active default preset: %',t;
    end if;
  end loop;
  raise notice 'Structural upgrade checks passed; real-service, identity, policy audit, browser and concurrency checks still required.';
end $$;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='event-media';
select e.id,e.name,e.course_id,count(a.id) filter(where a.revoked_at is null) as active_staff_grants
from public.events e left join public.event_staff_access a on a.event_id=e.id
group by e.id,e.name,e.course_id order by e.id;
select c.id,c.event_id,c.name,c.hole_number,c.tees,c.hole_yardage,c.tee_id,c.preset_key
from public.contests c where c.archived_at is null and (c.tee_id is null or c.preset_key is null) order by c.event_id,c.id;
-- Review ALL Storage policies, not just policies named by this migration.
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects' order by policyname;
rollback;
