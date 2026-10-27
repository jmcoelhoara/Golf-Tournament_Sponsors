-- Golf upgrade: forward-only; no production seed rerun and no inferred legacy ACL.
begin;

alter table public.events add column created_by uuid references auth.users(id) on delete set null;
alter table public.events add column archived_at timestamptz;
alter table public.events add column archived_by uuid references auth.users(id) on delete set null;
alter table public.contests add column archived_at timestamptz;
alter table public.contests add column archived_by uuid references auth.users(id) on delete set null;
-- Legacy archive time is inferred from last update, not a historical deletion time.
update public.events set archived_at=updated_at where status='archived';

create table public.event_staff_access (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 event_id uuid not null, user_id uuid not null references auth.users(id),
 granted_by uuid references auth.users(id) on delete set null,
 granted_at timestamptz not null default now(), revoked_at timestamptz,
 unique(event_id,user_id),
 foreign key(event_id,organization_id) references public.events(id,organization_id)
);
create index event_staff_active_user_idx on public.event_staff_access(user_id,event_id) where revoked_at is null;
create index event_staff_event_org_idx on public.event_staff_access(event_id,organization_id);
create index event_staff_granted_by_idx on public.event_staff_access(granted_by);
create index events_created_by_idx on public.events(created_by);
create index events_archived_by_idx on public.events(archived_by);
create index contests_archived_by_idx on public.contests(archived_by);
alter table public.event_staff_access enable row level security;
revoke all on public.event_staff_access from public,anon,authenticated;
grant select on public.event_staff_access to authenticated;

create function private.can_access_event(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.is_platform_admin() or exists(
 select 1 from public.events e join public.event_staff_access a on a.event_id=e.id
 join public.organization_members m on m.organization_id=e.organization_id and m.user_id=a.user_id
 where e.id=p_event and a.user_id=auth.uid() and a.revoked_at is null));
$$;
create function private.can_edit_event(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.can_access_event(p_event) and exists(select 1 from public.events where id=p_event and archived_at is null and status<>'archived');
$$;
create function private.can_create_event(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_member(p_org);
$$;
create policy event_staff_select on public.event_staff_access for select to authenticated
 using(private.is_platform_admin() or user_id=auth.uid());

-- Replace, never supplement, legacy permissive OR paths.
do $$ declare t text; p record; begin
 foreach t in array array['events','contests','teams','golfers','sponsors','event_sponsors','organization_members','contest_entries','contest_leaders','audit_log'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',p.policyname,t);
  end loop;
 end loop;
end $$;
revoke insert,update,delete,truncate,references,trigger on public.events,public.contests from public,anon,authenticated;
create policy events_select on public.events for select to authenticated using(private.can_access_event(id));
create policy contests_select on public.contests for select to authenticated using(private.can_access_event(event_id));
do $$ declare t text; begin
 foreach t in array array['teams','golfers'] loop
  execute format('create policy %I on public.%I for select to authenticated using(private.can_access_event(event_id))',t||'_select',t);
  execute format('create policy %I on public.%I for insert to authenticated with check(private.can_edit_event(event_id) and private.is_manager(organization_id))',t||'_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using(private.can_edit_event(event_id) and private.is_manager(organization_id)) with check(private.can_edit_event(event_id) and private.is_manager(organization_id))',t||'_update',t);
 end loop;
end $$;
-- No client hard deletes: golfer cascades can also destroy entry history.
revoke delete,truncate on public.teams,public.golfers,public.sponsors,public.event_sponsors,public.organization_members,public.organizations from public,anon,authenticated;
create policy members_select on public.organization_members for select to authenticated using(private.is_platform_admin() or user_id=auth.uid());
create policy members_insert on public.organization_members for insert to authenticated with check(private.is_platform_admin());
create policy members_update on public.organization_members for update to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());
create policy entries_select on public.contest_entries for select to authenticated using(private.can_access_event(event_id));
create policy leaders_select_member on public.contest_leaders for select to authenticated using(private.can_access_event(event_id));
create policy leaders_select_public on public.contest_leaders for select to anon using(private.contest_is_public(contest_id));
create policy sponsors_select on public.sponsors for select to authenticated using(private.is_platform_admin() or exists(select 1 from public.contests c where c.sponsor_id=sponsors.id and private.can_access_event(c.event_id)) or exists(select 1 from public.event_sponsors es where es.sponsor_id=sponsors.id and private.can_access_event(es.event_id)));
create policy sponsors_insert on public.sponsors for insert to authenticated with check(private.is_platform_admin());
create policy sponsors_update on public.sponsors for update to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());
create policy event_sponsors_select on public.event_sponsors for select to authenticated using(private.can_access_event(event_id));
create policy event_sponsors_insert on public.event_sponsors for insert to authenticated with check(private.is_platform_admin() and private.can_edit_event(event_id));
create policy event_sponsors_update on public.event_sponsors for update to authenticated using(private.is_platform_admin() and private.can_edit_event(event_id)) with check(private.is_platform_admin() and private.can_edit_event(event_id));

alter table public.audit_log add column event_id uuid;
create index audit_event_time_idx on public.audit_log(event_id,created_at desc);
update public.audit_log set event_id=case when table_name='events' then row_id else coalesce(new_data->>'event_id',old_data->>'event_id')::uuid end;
create policy audit_select on public.audit_log for select to authenticated using(private.is_platform_admin() or (event_id is not null and private.can_access_event(event_id) and private.is_manager(organization_id)));

create function public.get_staff_context() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('is_platform_admin',private.is_platform_admin(),'creation_organizations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from public.organizations where private.can_create_event(id)),'[]'::jsonb));
$$;
create function public.list_staff_accounts(p_organization_id uuid)
returns table(user_id uuid,email text,role public.member_role)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_platform_admin() then raise insufficient_privilege using message='not_allowed'; end if;
 return query select m.user_id,u.email::text,m.role from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_organization_id order by u.email,m.user_id;
end $$;
revoke execute on function private.can_access_event(uuid),private.can_edit_event(uuid),private.can_create_event(uuid) from public,anon,authenticated;
grant execute on function private.can_access_event(uuid),private.can_edit_event(uuid),private.can_create_event(uuid) to authenticated;
revoke execute on function public.get_staff_context(),public.list_staff_accounts(uuid) from public,anon,authenticated;
grant execute on function public.get_staff_context(),public.list_staff_accounts(uuid) to authenticated;
-- Course-local catalog. Normalized references are nullable for legacy rows.
create table public.courses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 200), archived_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organization_id)
);
create index courses_org_idx on public.courses(organization_id);
create table public.course_tees (
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),
 label text not null check(length(trim(label)) between 1 and 50),color_hex text check(color_hex ~ '^#[0-9A-Fa-f]{6}$'),
 sort_order integer not null default 0, archived_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index course_tee_label_idx on public.course_tees(course_id,lower(trim(label)));
create table public.course_hole_yardages (
 tee_id uuid not null references public.course_tees(id),hole_number smallint not null check(hole_number between 1 and 36),
 yardage smallint not null check(yardage>0),updated_at timestamptz not null default now(),primary key(tee_id,hole_number)
);
create table public.contest_presets (
 key text primary key,name text not null check(length(trim(name)) between 1 and 200),kind public.contest_kind not null,
 division text check(length(division)<=50),scoring_mode public.scoring_mode not null,unit public.measure_unit not null,
 min_value numeric(8,2),max_value numeric(8,2),requires_approval boolean not null default false,
 sort_order integer not null default 0,active boolean not null default true,
 check(min_value is null or max_value is null or min_value<=max_value),check(scoring_mode='latest_claim' or unit<>'none')
);
insert into public.contest_presets(key,name,kind,division,scoring_mode,unit,min_value,max_value,sort_order) values
 ('mens-long-drive','Men''s Long Drive','long_drive','Men','latest_claim','none',null,null,0),
 ('womens-long-drive','Women''s Long Drive','long_drive','Women','latest_claim','none',null,null,1),
 ('mens-closest-to-pin','Men''s Closest to the Pin','closest_to_pin','Men','lowest_value','inches',0,1200,2),
 ('womens-closest-to-pin','Women''s Closest to the Pin','closest_to_pin','Women','lowest_value','inches',0,1200,3);
alter table public.events add column course_id uuid;
alter table public.events add foreign key(course_id,organization_id) references public.courses(id,organization_id);
create index events_course_org_idx on public.events(course_id,organization_id);
alter table public.contests add column preset_key text references public.contest_presets(key);
alter table public.contests add column tee_id uuid;
alter table public.contests add foreign key(tee_id,hole_number) references public.course_hole_yardages(tee_id,hole_number);
create index contests_tee_hole_idx on public.contests(tee_id,hole_number);
create index contests_preset_idx on public.contests(preset_key);
-- Conservatively import only observed, unambiguous combinations. No complete course is invented.
insert into public.courses(organization_id,name) select distinct organization_id,course_name from public.events where length(trim(course_name))>0;
update public.events e set course_id=c.id from public.courses c where c.organization_id=e.organization_id and c.name=e.course_name;
insert into public.course_tees(course_id,label) select e.course_id,min(trim(c.tees)) from public.contests c join public.events e on e.id=c.event_id where e.course_id is not null and length(trim(c.tees))>0 group by e.course_id,lower(trim(c.tees));
insert into public.course_hole_yardages(tee_id,hole_number,yardage)
 select t.id,c.hole_number,min(c.hole_yardage) from public.contests c join public.events e on e.id=c.event_id join public.course_tees t on t.course_id=e.course_id and lower(trim(t.label))=lower(trim(c.tees))
 where c.hole_number is not null and c.hole_yardage is not null group by t.id,c.hole_number having count(distinct c.hole_yardage)=1;
update public.contests c set tee_id=t.id from public.events e,public.course_tees t,public.course_hole_yardages y
 where e.id=c.event_id and t.course_id=e.course_id and lower(trim(t.label))=lower(trim(c.tees)) and y.tee_id=t.id and y.hole_number=c.hole_number and y.yardage=c.hole_yardage;
update public.contests c set preset_key=p.key from public.contest_presets p where c.name=p.name and c.kind=p.kind and c.division is not distinct from p.division and c.scoring_mode=p.scoring_mode and c.unit=p.unit and c.min_value is not distinct from p.min_value and c.max_value is not distinct from p.max_value and c.requires_approval=p.requires_approval;

create function private.can_read_course(p_course uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses where id=p_course and private.is_member(organization_id));
$$;
create function private.catalog_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='courses' and (to_jsonb(new)->'organization_id' is distinct from to_jsonb(old)->'organization_id') then raise exception 'immutable course organization'; end if;
 if tg_table_name='course_tees' and (to_jsonb(new)->'course_id' is distinct from to_jsonb(old)->'course_id') then raise exception 'immutable tee course'; end if;
 if tg_table_name='course_hole_yardages' and ((to_jsonb(new)->'tee_id' is distinct from to_jsonb(old)->'tee_id') or (to_jsonb(new)->'hole_number' is distinct from to_jsonb(old)->'hole_number')) then raise exception 'immutable yardage key'; end if;
 if to_jsonb(new)->'id' is distinct from to_jsonb(old)->'id' then raise exception 'immutable catalog id'; end if;
 return new;
end $$;
do $$ declare t text; v text; begin
 foreach t in array array['courses','course_tees','course_hole_yardages','contest_presets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  v:=case t when 'courses' then 'private.can_read_course(id)' when 'course_tees' then 'private.can_read_course(course_id)' when 'course_hole_yardages' then 'exists(select 1 from public.course_tees t where t.id=tee_id and private.can_read_course(t.course_id))' else 'active or exists(select 1 from public.contests c where c.preset_key=contest_presets.key and private.can_access_event(c.event_id))' end;
  execute format('create policy catalog_read on public.%I for select to authenticated using(%s)',t,v);
  execute format('create policy catalog_write on public.%I for all to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin())',t);
  if t<>'contest_presets' then
   execute format('create trigger catalog_identity_guard before update on public.%I for each row execute function private.catalog_identity_guard()',t);
   execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',t);
  end if;
 end loop;
end $$;

create function public.create_event(p_organization_id uuid,p_name text,p_course_id uuid,p_event_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_course text;
begin
 if not private.can_create_event(p_organization_id) then return jsonb_build_object('ok',false,'error','not_allowed'); end if;
 select name into v_course from public.courses where id=p_course_id and organization_id=p_organization_id and archived_at is null for share;
 if not found then return jsonb_build_object('ok',false,'error','invalid_course'); end if;
 if p_name is null or length(trim(p_name)) not between 1 and 200 or p_event_date is null then return jsonb_build_object('ok',false,'error','missing_fields'); end if;
 insert into public.events(organization_id,name,course_id,course_name,event_date,created_by) values(p_organization_id,trim(p_name),p_course_id,v_course,p_event_date,auth.uid()) returning id into v_id;
 insert into public.event_staff_access(organization_id,event_id,user_id,granted_by) values(p_organization_id,v_id,auth.uid(),auth.uid());
 return jsonb_build_object('ok',true,'event_id',v_id);
end $$;
create function public.set_event_staff_access(p_event_id uuid,p_user_id uuid,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 if auth.uid() is null or not private.is_platform_admin() then return jsonb_build_object('ok',false,'error','not_allowed'); end if;
 select organization_id into v_org from public.events where id=p_event_id for update;
 if not found or p_enabled is null or not exists(select 1 from public.organization_members where organization_id=v_org and user_id=p_user_id) then return jsonb_build_object('ok',false,'error','not_allowed'); end if;
 if p_enabled then
  insert into public.event_staff_access(organization_id,event_id,user_id,granted_by) values(v_org,p_event_id,p_user_id,auth.uid()) on conflict(event_id,user_id) do update set revoked_at=null,granted_by=auth.uid(),granted_at=now();
 else update public.event_staff_access set revoked_at=coalesce(revoked_at,now()) where event_id=p_event_id and user_id=p_user_id;
 end if;
 return jsonb_build_object('ok',true,'event_id',p_event_id,'user_id',p_user_id);
end $$;
revoke execute on function private.can_read_course(uuid),private.catalog_identity_guard() from public,anon,authenticated;
grant execute on function private.can_read_course(uuid) to authenticated;
revoke execute on function public.create_event(uuid,text,uuid,date),public.set_event_staff_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_event(uuid,text,uuid,date),public.set_event_staff_access(uuid,uuid,boolean) to authenticated;
-- Private lock helpers are not callable by clients. All mutations lock parent first.
create function private.lock_edit_event(p_event uuid) returns text language plpgsql security definer set search_path='' as $$
declare v public.events%rowtype;
begin
 select * into v from public.events where id=p_event for update;
 if not found or not private.can_access_event(p_event) then return 'not_allowed'; end if;
 if v.archived_at is not null or v.status='archived' then return 'archived'; end if;
 return null;
end $$;
create function private.lock_edit_contest(p_contest uuid) returns text language plpgsql security definer set search_path='' as $$
declare v public.contests%rowtype; v_error text;
begin
 select * into v from public.contests where id=p_contest;
 if not found then return 'not_allowed'; end if;
 v_error:=private.lock_edit_event(v.event_id);
 if v_error is not null then return v_error; end if;
 select * into v from public.contests where id=p_contest for update;
 if v.archived_at is not null then return 'archived'; end if;
 return null;
end $$;
create function private.resolve_placement(p_course uuid,p_tee uuid,p_hole smallint)
returns table(label text,yardage smallint) language sql security definer set search_path='' as $$
 select t.label,y.yardage from public.courses c join public.course_tees t on t.course_id=c.id join public.course_hole_yardages y on y.tee_id=t.id where c.id=p_course and t.id=p_tee and y.hole_number=p_hole and c.archived_at is null and t.archived_at is null for share of c,t,y;
$$;
create function public.add_event_contest(p_event_id uuid,p_preset_key text,p_hole_number smallint,p_tee_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_p public.contest_presets%rowtype; v_e public.events%rowtype; v_label text; v_yardage smallint; v_id uuid; v_token text;
begin
 v_error:=private.lock_edit_event(p_event_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select * into v_p from public.contest_presets where key=p_preset_key and active for share;
 if not found then return jsonb_build_object('ok',false,'error','invalid_preset'); end if;
 select * into v_e from public.events where id=p_event_id;
 select label,yardage into v_label,v_yardage from private.resolve_placement(v_e.course_id,p_tee_id,p_hole_number);
 if not found then return jsonb_build_object('ok',false,'error','invalid_placement'); end if;
 insert into public.contests(event_id,preset_key,name,kind,division,scoring_mode,unit,min_value,max_value,requires_approval,hole_number,tee_id,tees,hole_yardage)
 values(p_event_id,v_p.key,v_p.name,v_p.kind,v_p.division,v_p.scoring_mode,v_p.unit,v_p.min_value,v_p.max_value,v_p.requires_approval,p_hole_number,p_tee_id,v_label,v_yardage) returning id,public_token into v_id,v_token;
 return jsonb_build_object('ok',true,'contest_id',v_id,'public_token',v_token);
end $$;
create function public.set_contest_placement(p_contest_id uuid,p_hole_number smallint,p_tee_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_course uuid; v_label text; v_yardage smallint;
begin
 v_error:=private.lock_edit_contest(p_contest_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select e.course_id into v_course from public.events e join public.contests c on c.event_id=e.id where c.id=p_contest_id;
 select label,yardage into v_label,v_yardage from private.resolve_placement(v_course,p_tee_id,p_hole_number);
 if not found then return jsonb_build_object('ok',false,'error','invalid_placement'); end if;
 update public.contests set tee_id=p_tee_id,hole_number=p_hole_number,tees=v_label,hole_yardage=v_yardage where id=p_contest_id;
 return jsonb_build_object('ok',true,'contest_id',p_contest_id);
end $$;
revoke execute on function private.lock_edit_event(uuid),private.lock_edit_contest(uuid),private.resolve_placement(uuid,uuid,smallint) from public,anon,authenticated;
revoke execute on function public.add_event_contest(uuid,text,smallint,uuid),public.set_contest_placement(uuid,smallint,uuid) from public,anon,authenticated;
grant execute on function public.add_event_contest(uuid,text,smallint,uuid),public.set_contest_placement(uuid,smallint,uuid) to authenticated;
-- Audit preserves history; composite yardage rows have NULL row_id and full JSON keys.
create or replace function private.audit_row() returns trigger language plpgsql security definer set search_path='' as $$
declare v_old jsonb:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
 v_new jsonb:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
 v_row jsonb:=coalesce(v_new,v_old); v_org uuid; v_event uuid;
begin
 v_org:=(v_row->>'organization_id')::uuid;
 v_event:=case when tg_table_name='events' then (v_row->>'id')::uuid else (v_row->>'event_id')::uuid end;
 if tg_table_name='organizations' then v_org:=(v_row->>'id')::uuid; end if;
 if tg_table_name='course_tees' then select organization_id into v_org from public.courses where id=(v_row->>'course_id')::uuid; end if;
 if tg_table_name='course_hole_yardages' then select c.organization_id into v_org from public.course_tees t join public.courses c on c.id=t.course_id where t.id=(v_row->>'tee_id')::uuid; end if;
 insert into public.audit_log(organization_id,event_id,actor_user_id,actor_golfer_id,action,table_name,row_id,old_data,new_data)
 values(v_org,v_event,auth.uid(),case when tg_table_name='contest_entries' and auth.uid() is null then (v_row->>'golfer_id')::uuid end,lower(tg_op),tg_table_name,(v_row->>'id')::uuid,v_old,v_new);
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['courses','course_tees','course_hole_yardages','contest_presets','event_staff_access'] loop
  execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function private.audit_row()',t);
 end loop;
end $$;
create function public.update_event(p_event_id uuid,p_name text,p_course_id uuid,p_event_date date,p_contest_placements jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_e public.events%rowtype; v_course text; v_p record; v_label text; v_yardage smallint; v_count integer;
begin
 v_error:=private.lock_edit_event(p_event_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select * into v_e from public.events where id=p_event_id;
 if p_name is null or length(trim(p_name)) not between 1 and 200 or p_event_date is null then return jsonb_build_object('ok',false,'error','missing_fields'); end if;
 -- Retaining an existing archived course is metadata-only, never a new placement.
 select name into v_course from public.courses where id=p_course_id and organization_id=v_e.organization_id
  and (archived_at is null or (p_course_id=v_e.course_id and p_contest_placements is null)) for share;
 if not found then return jsonb_build_object('ok',false,'error','invalid_course'); end if;
 perform 1 from public.contests where event_id=p_event_id order by id for update;
 if p_course_id is distinct from v_e.course_id or p_contest_placements is not null then
  select count(*) into v_count from public.contests where event_id=p_event_id and archived_at is null;
  if p_contest_placements is null then
   if v_count>0 then return jsonb_build_object('ok',false,'error','placements_required'); end if;
   p_contest_placements:='[]'::jsonb;
  end if;
  if jsonb_typeof(p_contest_placements)<>'array' then return jsonb_build_object('ok',false,'error','invalid_placement'); end if;
  -- Cast and validate every member BEFORE any writes. Failure rolls back this block.
  for v_p in select * from jsonb_to_recordset(p_contest_placements) as p(contest_id uuid,tee_id uuid,hole_number smallint) loop
   if v_p.contest_id is null or v_p.tee_id is null or v_p.hole_number is null then return jsonb_build_object('ok',false,'error','invalid_placement'); end if;
   if not exists(select 1 from public.contests where id=v_p.contest_id and event_id=p_event_id and archived_at is null) then return jsonb_build_object('ok',false,'error','placements_required'); end if;
   select label,yardage into v_label,v_yardage from private.resolve_placement(p_course_id,v_p.tee_id,v_p.hole_number);
   if not found then return jsonb_build_object('ok',false,'error','invalid_placement'); end if;
  end loop;
  if jsonb_array_length(p_contest_placements)<>v_count or (select count(distinct p.contest_id) from jsonb_to_recordset(p_contest_placements) as p(contest_id uuid))<>v_count then return jsonb_build_object('ok',false,'error','placements_required'); end if;
  for v_p in select * from jsonb_to_recordset(p_contest_placements) as p(contest_id uuid,tee_id uuid,hole_number smallint) order by contest_id loop
   select label,yardage into v_label,v_yardage from private.resolve_placement(p_course_id,v_p.tee_id,v_p.hole_number);
   update public.contests set tee_id=v_p.tee_id,hole_number=v_p.hole_number,tees=v_label,hole_yardage=v_yardage where id=v_p.contest_id;
  end loop;
 end if;
 update public.events set name=trim(p_name),course_id=p_course_id,course_name=case when p_course_id is distinct from v_e.course_id then v_course else course_name end,event_date=p_event_date where id=p_event_id;
 return jsonb_build_object('ok',true,'event_id',p_event_id);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
 return jsonb_build_object('ok',false,'error','invalid_placement');
end $$;
create function public.set_event_status(p_event_id uuid,p_status public.event_status) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
 v_error:=private.lock_edit_event(p_event_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 if p_status is null or p_status='archived' then return jsonb_build_object('ok',false,'error','invalid_transition'); end if;
 update public.events set status=p_status where id=p_event_id;
 return jsonb_build_object('ok',true,'event_id',p_event_id);
end $$;
create function public.set_contest_status(p_contest_id uuid,p_status public.contest_status) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
 v_error:=private.lock_edit_contest(p_contest_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 if p_status is null then return jsonb_build_object('ok',false,'error','invalid_transition'); end if;
 update public.contests set status=p_status where id=p_contest_id;
 return jsonb_build_object('ok',true,'contest_id',p_contest_id);
end $$;
revoke execute on function public.update_event(uuid,text,uuid,date,jsonb),public.set_event_status(uuid,public.event_status),public.set_contest_status(uuid,public.contest_status) from public,anon,authenticated;
grant execute on function public.update_event(uuid,text,uuid,date,jsonb),public.set_event_status(uuid,public.event_status),public.set_contest_status(uuid,public.contest_status) to authenticated;
-- Definers must enforce the same fresh event ACL as SELECT policies.
create or replace function public.check_in_golfer(p_golfer_id uuid,p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_error text;
begin
 select event_id into v_event from public.golfers where id=p_golfer_id;
 v_error:=private.lock_edit_event(v_event);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 update public.golfers set checked_in_at=case when p_checked_in then coalesce(checked_in_at,now()) end,checked_in_by=case when p_checked_in then coalesce(checked_in_by,auth.uid()) end where id=p_golfer_id;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.review_contest_entry(p_entry_id uuid,p_status public.entry_status,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_e public.contest_entries%rowtype; v_error text;
begin
 select * into v_e from public.contest_entries where id=p_entry_id;
 v_error:=private.lock_edit_contest(v_e.contest_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select * into v_e from public.contest_entries where id=p_entry_id;
 if p_status is null or not ((v_e.status='pending' and p_status in ('accepted','rejected')) or (v_e.status in ('pending','accepted') and p_status='void')) then return jsonb_build_object('ok',false,'error','invalid_transition','from',v_e.status,'to',p_status); end if;
 update public.contest_entries set status=p_status,accepted_at=case when p_status='accepted' then now() else accepted_at end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,500) where id=p_entry_id;
 perform private.refresh_contest_leader(v_e.contest_id);
 return jsonb_build_object('ok',true,'leader',private.leader_json(v_e.contest_id));
end $$;
create or replace function public.correct_contest_entry(p_entry_id uuid,p_value numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_e public.contest_entries%rowtype; v_error text;
begin
 select * into v_e from public.contest_entries where id=p_entry_id;
 v_error:=private.lock_edit_contest(v_e.contest_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select * into v_e from public.contest_entries where id=p_entry_id;
 if not private.is_manager(v_e.organization_id) then return jsonb_build_object('ok',false,'error','not_allowed'); end if;
 if p_note is null or length(trim(p_note))=0 then return jsonb_build_object('ok',false,'error','note_required'); end if;
 if p_value is not null and p_value<0 then return jsonb_build_object('ok',false,'error','value_out_of_range'); end if;
 update public.contest_entries set value=round(p_value,2),reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,500) where id=p_entry_id;
 perform private.refresh_contest_leader(v_e.contest_id);
 return jsonb_build_object('ok',true,'leader',private.leader_json(v_e.contest_id));
end $$;
create or replace function public.regenerate_contest_token(p_contest_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_org uuid; v_token text;
begin
 v_error:=private.lock_edit_contest(p_contest_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select organization_id into v_org from public.contests where id=p_contest_id;
 if not private.is_manager(v_org) then return jsonb_build_object('ok',false,'error','not_allowed'); end if;
 update public.contests set public_token=replace(gen_random_uuid()::text,'-','') where id=p_contest_id returning public_token into v_token;
 return jsonb_build_object('ok',true,'public_token',v_token);
end $$;
create table public.event_images (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,event_id uuid not null,
 kind text not null check(kind in ('event_logo','sponsor_banner')),
 bucket_id text not null default 'event-media' check(bucket_id='event-media'),object_path text not null unique,
 label text not null check(length(trim(label)) between 1 and 200),
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),unique(id,event_id),
 foreign key(event_id,organization_id) references public.events(id,organization_id)
);
create index event_images_event_kind_idx on public.event_images(event_id,kind);
create index event_images_event_org_idx on public.event_images(event_id,organization_id);
create index event_images_uploader_idx on public.event_images(uploaded_by);
alter table public.events add column logo_image_id uuid;
alter table public.events add foreign key(logo_image_id,id) references public.event_images(id,event_id);
create index events_logo_idx on public.events(logo_image_id,id);
alter table public.contests add column sponsor_banner_id uuid;
alter table public.contests add foreign key(sponsor_banner_id,event_id) references public.event_images(id,event_id);
create index contests_banner_event_idx on public.contests(sponsor_banner_id,event_id);
alter table public.event_images enable row level security;
revoke all on public.event_images from public,anon,authenticated;
grant select on public.event_images to authenticated;
create policy event_images_select on public.event_images for select to authenticated using(private.can_access_event(event_id));
create trigger audit_row after insert or update or delete on public.event_images for each row execute function private.audit_row();

-- Safe, exact parser. UUID casts are performed only after matching the whole path.
create function private.event_media_path(p_name text) returns uuid[] language plpgsql immutable set search_path='' as $$
begin
 if p_name is null or p_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(png|jpg|webp)$' then return null; end if;
 return array[split_part(p_name,'/',1)::uuid,split_part(p_name,'/',2)::uuid];
exception when invalid_text_representation then return null;
end $$;
create function private.can_use_event_media(p_name text,p_edit boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=(private.event_media_path(p_name))[2] and e.organization_id=(private.event_media_path(p_name))[1] and case when p_edit then private.can_edit_event(e.id) else private.can_access_event(e.id) end);
$$;
revoke execute on function private.event_media_path(text),private.can_use_event_media(text,boolean) from public,anon,authenticated;
grant execute on function private.event_media_path(text),private.can_use_event_media(text,boolean) to authenticated;
do $$ begin
 if to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('event-media','event-media',true,10485760,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  execute 'drop policy if exists sponsor_logos_select on storage.objects';
  execute 'drop policy if exists sponsor_logos_insert on storage.objects';
  execute 'drop policy if exists sponsor_logos_update on storage.objects';
  execute 'drop policy if exists sponsor_logos_delete on storage.objects';
  execute $p$create policy sponsor_logos_select on storage.objects for select to authenticated using(bucket_id='sponsor-logos' and private.is_platform_admin())$p$;
  execute $p$create policy sponsor_logos_insert on storage.objects for insert to authenticated with check(bucket_id='sponsor-logos' and private.is_platform_admin())$p$;
  execute $p$create policy event_media_select on storage.objects for select to authenticated using(bucket_id='event-media' and private.can_use_event_media(name,false))$p$;
  execute $p$create policy event_media_insert on storage.objects for insert to authenticated with check(bucket_id='event-media' and private.can_use_event_media(name,true))$p$;
 end if;
end $$;
create function public.register_event_image(p_event_id uuid,p_kind text,p_object_path text,p_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_parts uuid[]; v_org uuid; v_metadata jsonb; v_mime text; v_size numeric; v_id uuid;
begin
 v_error:=private.lock_edit_event(p_event_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 v_parts:=private.event_media_path(p_object_path);
 select organization_id into v_org from public.events where id=p_event_id;
 if v_parts is null or v_parts[1]<>v_org or v_parts[2]<>p_event_id or p_kind is null or p_kind not in ('event_logo','sponsor_banner') or p_label is null or length(trim(p_label)) not between 1 and 200 or to_regclass('storage.objects') is null then return jsonb_build_object('ok',false,'error','invalid_image'); end if;
 select metadata into v_metadata from storage.objects where bucket_id='event-media' and name=p_object_path for share;
 if not found then return jsonb_build_object('ok',false,'error','invalid_image'); end if;
 v_mime:=v_metadata->>'mimetype';
 if v_mime is null or v_mime<>(case split_part(p_object_path,'.',2) when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end) or coalesce(v_metadata->>'size','') !~ '^[0-9]{1,12}$' then return jsonb_build_object('ok',false,'error','invalid_image'); end if;
 v_size:=(v_metadata->>'size')::numeric;
 if v_size not between 1 and 10485760 then return jsonb_build_object('ok',false,'error','invalid_image'); end if;
 insert into public.event_images(organization_id,event_id,kind,object_path,label,mime_type,size_bytes,uploaded_by) values(v_org,p_event_id,p_kind,p_object_path,trim(p_label),v_mime,v_size::bigint,auth.uid()) returning id into v_id;
 return jsonb_build_object('ok',true,'image_id',v_id);
exception when unique_violation then return jsonb_build_object('ok',false,'error','invalid_image');
end $$;
-- Composite FKs enforce event locality; validator enforces image purpose.
create function private.image_selection_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_event uuid; v_kind text;
begin
 if tg_table_name='events' then v_id:=new.logo_image_id; v_event:=new.id; v_kind:='event_logo';
 else v_id:=new.sponsor_banner_id; v_event:=new.event_id; v_kind:='sponsor_banner'; end if;
 if v_id is not null and not exists(select 1 from public.event_images where id=v_id and event_id=v_event and kind=v_kind) then raise check_violation using message='invalid_image'; end if;
 return new;
end $$;
create trigger image_selection_guard before insert or update on public.events for each row execute function private.image_selection_guard();
create trigger image_selection_guard before insert or update on public.contests for each row execute function private.image_selection_guard();
create function public.set_event_logo(p_event_id uuid,p_image_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_kind text;
begin
 v_error:=private.lock_edit_event(p_event_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 if p_image_id is not null then
  select kind into v_kind from public.event_images where id=p_image_id and event_id=p_event_id;
  if not found then return jsonb_build_object('ok',false,'error','image_not_in_event'); end if;
  if v_kind<>'event_logo' then return jsonb_build_object('ok',false,'error','invalid_image'); end if;
 end if;
 update public.events set logo_image_id=p_image_id where id=p_event_id;
 return jsonb_build_object('ok',true,'event_id',p_event_id);
end $$;
create function public.set_contest_banner(p_contest_id uuid,p_image_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text; v_event uuid; v_kind text;
begin
 v_error:=private.lock_edit_contest(p_contest_id);
 if v_error is not null then return jsonb_build_object('ok',false,'error',v_error); end if;
 select event_id into v_event from public.contests where id=p_contest_id;
 if p_image_id is not null then
  select kind into v_kind from public.event_images where id=p_image_id and event_id=v_event;
  if not found then return jsonb_build_object('ok',false,'error','image_not_in_event'); end if;
  if v_kind<>'sponsor_banner' then return jsonb_build_object('ok',false,'error','invalid_image'); end if;
 end if;
 update public.contests set sponsor_banner_id=p_image_id where id=p_contest_id;
 return jsonb_build_object('ok',true,'contest_id',p_contest_id);
end $$;
revoke execute on function private.image_selection_guard() from public,anon,authenticated;
revoke execute on function public.register_event_image(uuid,text,text,text),public.set_event_logo(uuid,uuid),public.set_contest_banner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_event_image(uuid,text,text,text),public.set_event_logo(uuid,uuid),public.set_contest_banner(uuid,uuid) to authenticated;
-- Keep the latest legacy sponsor/strip payload; branding is additive only.
create or replace function public.get_contest_public(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_c public.contests%rowtype; v_e public.events%rowtype; v_s public.sponsors%rowtype;
begin
 select * into v_c from public.contests where public_token=p_token;
 if not found or v_c.archived_at is not null then return jsonb_build_object('available',false,'reason','not_found'); end if;
 select * into v_e from public.events where id=v_c.event_id;
 if v_e.archived_at is not null or v_e.status not in ('live','closed') or v_c.status='draft' then return jsonb_build_object('available',false,'reason','not_open_yet','event_name',v_e.name); end if;
 select * into v_s from public.sponsors where id=v_c.sponsor_id;
 return jsonb_build_object(
 'available',true,'contest_id',v_c.id,'name',v_c.name,'kind',v_c.kind,'division',v_c.division,
 'hole_number',v_c.hole_number,'tees',v_c.tees,'hole_yardage',v_c.hole_yardage,'hole_distance_unit','yards',
 'scoring_mode',v_c.scoring_mode,'unit',v_c.unit,'min_value',v_c.min_value,'max_value',v_c.max_value,'requires_approval',v_c.requires_approval,
 'accepting_entries',v_e.status='live' and v_c.status='open' and (v_c.closes_at is null or now()<v_c.closes_at),
 'event',jsonb_build_object('name',v_e.name,'course_name',v_e.course_name,'event_date',v_e.event_date,'logo',(select jsonb_build_object('bucket',i.bucket_id,'path',i.object_path,'alt_text',i.label) from public.event_images i where i.id=v_e.logo_image_id)),
 'sponsor_banner',(select jsonb_build_object('id',i.id,'bucket',i.bucket_id,'path',i.object_path,'alt_text',i.label) from public.event_images i where i.id=v_c.sponsor_banner_id),
 'sponsor',case when v_s.id is null then null else jsonb_build_object('name',v_s.name,'logo_path',v_s.logo_path,'website_url',v_s.website_url) end,
 'event_sponsors',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'logo_path',s.logo_path,'website_url',s.website_url) order by es.sort_order,s.name) from public.event_sponsors es join public.sponsors s on s.id=es.sponsor_id where es.event_id=v_e.id),'[]'::jsonb),
 'leader',private.leader_json(v_c.id));
end $$;
create function public.archive_event(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
 v_error:=private.lock_edit_event(p_event_id);
 if v_error='not_allowed' then return jsonb_build_object('ok',false,'error',v_error); end if;
 if v_error is null then
  perform 1 from public.contests where event_id=p_event_id order by id for update;
  update public.events set status='archived',archived_at=now(),archived_by=auth.uid() where id=p_event_id;
 end if;
 return jsonb_build_object('ok',true,'event_id',p_event_id);
end $$;
create function public.archive_contest(p_contest_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
 v_error:=private.lock_edit_contest(p_contest_id);
 if v_error='not_allowed' then return jsonb_build_object('ok',false,'error',v_error); end if;
 if v_error='archived' and not exists(select 1 from public.contests where id=p_contest_id and archived_at is not null) then return jsonb_build_object('ok',false,'error','archived'); end if;
 if v_error is null then update public.contests set status='closed',archived_at=now(),archived_by=auth.uid() where id=p_contest_id; end if;
 return jsonb_build_object('ok',true,'contest_id',p_contest_id);
end $$;
revoke execute on function public.archive_event(uuid),public.archive_contest(uuid) from public,anon,authenticated;
grant execute on function public.archive_event(uuid),public.archive_contest(uuid) to authenticated;
create or replace function private.contest_is_public(p_contest uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.contests c join public.events e on e.id=c.event_id where c.id=p_contest and c.status in ('open','closed') and e.status in ('live','closed') and c.archived_at is null and e.archived_at is null);
$$;
create or replace function public.get_contest_roster(p_token text)
returns table(golfer_id uuid,display_name text,team_name text,starting_hole smallint)
language sql stable security definer set search_path='' as $$
 select g.id,g.first_name||' '||g.last_name,t.name,t.starting_hole from public.contests c join public.events e on e.id=c.event_id join public.golfers g on g.event_id=c.event_id left join public.teams t on t.id=g.team_id
 where c.public_token=p_token and c.status='open' and e.status='live' and c.archived_at is null and e.archived_at is null and (c.division is null or g.division is null or g.division=c.division) order by g.last_name,g.first_name;
$$;
-- Serialize lifecycle changes and scoring in event -> contest order. Keep retry first.
create or replace function public.submit_contest_entry(p_token text,p_golfer_id uuid,p_value numeric,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_c public.contests%rowtype; v_e public.events%rowtype; v_division text; v_existing public.contest_entries%rowtype;
 v_entry_id uuid;v_status public.entry_status;v_value numeric(8,2):=round(p_value,2);
begin
 if p_token is null or p_golfer_id is null or p_client_request_id is null then return jsonb_build_object('ok',false,'error','missing_fields'); end if;
 select * into v_c from public.contests where public_token=p_token;
 if not found then return jsonb_build_object('ok',false,'error','contest_not_found'); end if;
 select * into v_e from public.events where id=v_c.event_id for update;
 select * into v_c from public.contests where public_token=p_token for update;
 if not found then return jsonb_build_object('ok',false,'error','contest_not_found'); end if;
 select * into v_existing from public.contest_entries where contest_id=v_c.id and client_request_id=p_client_request_id;
 if found then return jsonb_build_object('ok',true,'entry_id',v_existing.id,'status',v_existing.status,'repeat',true,'leader',case when v_c.archived_at is not null or v_e.archived_at is not null or v_e.status='archived' then null else private.leader_json(v_c.id) end); end if;
 if v_e.status<>'live' or v_e.archived_at is not null then return jsonb_build_object('ok',false,'error','event_not_live'); end if;
 if v_c.status<>'open' or v_c.archived_at is not null or (v_c.closes_at is not null and now()>=v_c.closes_at) then return jsonb_build_object('ok',false,'error','contest_closed'); end if;
 select division into v_division from public.golfers where id=p_golfer_id and event_id=v_c.event_id;
 if not found then return jsonb_build_object('ok',false,'error','golfer_not_in_event'); end if;
 if v_c.division is not null and v_division is not null and v_division<>v_c.division then return jsonb_build_object('ok',false,'error','wrong_division'); end if;
 if v_c.scoring_mode<>'latest_claim' and v_value is null then return jsonb_build_object('ok',false,'error','value_required'); end if;
 if v_value is not null and (v_value<0 or (v_c.min_value is not null and v_value<v_c.min_value) or (v_c.max_value is not null and v_value>v_c.max_value)) then return jsonb_build_object('ok',false,'error','value_out_of_range','min_value',v_c.min_value,'max_value',v_c.max_value); end if;
 if exists(select 1 from public.contest_entries where contest_id=v_c.id and golfer_id=p_golfer_id and status in ('pending','accepted')) then return jsonb_build_object('ok',false,'error','already_submitted'); end if;
 v_status:=case when v_c.requires_approval then 'pending' else 'accepted' end;
 begin
  insert into public.contest_entries(organization_id,event_id,contest_id,golfer_id,value,status,client_request_id,accepted_at) values(v_c.organization_id,v_c.event_id,v_c.id,p_golfer_id,v_value,v_status,p_client_request_id,case when v_status='accepted' then now() end) returning id into v_entry_id;
 exception when unique_violation then return jsonb_build_object('ok',false,'error','already_submitted'); end;
 perform private.refresh_contest_leader(v_c.id);
 return jsonb_build_object('ok',true,'entry_id',v_entry_id,'status',v_status,'repeat',false,'leader',private.leader_json(v_c.id));
end $$;
-- RLS does not protect TRUNCATE. Remove inherited/default non-RPC privileges too.
revoke insert,update,delete,truncate,references,trigger on public.contest_entries,public.contest_leaders,public.audit_log from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_platform_admin(),private.has_org_role(uuid,public.member_role[]),private.is_member(uuid),private.is_manager(uuid),private.can_access_event(uuid),private.can_edit_event(uuid),private.can_create_event(uuid),private.can_read_course(uuid),private.event_media_path(text),private.can_use_event_media(text,boolean) to authenticated;
grant execute on function private.contest_is_public(uuid) to anon,authenticated;
-- Include event-scoped audit rows generated by the compatibility backfill itself.
update public.audit_log set event_id=case when table_name='events' then row_id else coalesce(new_data->>'event_id',old_data->>'event_id')::uuid end where event_id is null;
commit;
