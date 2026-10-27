-- Platform-only course-scoped invitation preparation. No Auth admin bypass for data writes.
-- Preserve all existing policies and explicit event access semantics.
create function private.staff_invitation_scope(p_course_id uuid,p_email text,p_event_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_count integer;
begin
 if auth.uid() is null or not private.is_platform_admin() then raise insufficient_privilege using message='not_allowed'; end if;
 if p_email is null or length(p_email)>254 or p_email<>trim(p_email) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
 if p_event_ids is null or cardinality(p_event_ids)>200 or array_position(p_event_ids,null) is not null then raise exception 'invalid_events'; end if;
 select organization_id into v_org from public.courses where id=p_course_id and archived_at is null for share;
 if not found then raise exception 'invalid_course'; end if;
 -- Parent event locks in UUID order, like other event mutations. Revalidate after locking.
 perform id from public.events where id=any(p_event_ids) order by id for update;
 select count(*) into v_count from public.events where id=any(p_event_ids) and course_id=p_course_id and organization_id=v_org and archived_at is null and status<>'archived';
 if v_count<>(select count(distinct x) from unnest(p_event_ids) x) then raise exception 'invalid_events'; end if;
 return v_org;
end $$;
revoke all on function private.staff_invitation_scope(uuid,text,uuid[]) from public,anon,authenticated;

create function public.preflight_staff_invitation(p_course_id uuid,p_email text,p_event_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 v_org:=private.staff_invitation_scope(p_course_id,p_email,p_event_ids);
 return jsonb_build_object('ok',true,'organization_id',v_org,'account_exists',exists(select 1 from auth.users where lower(email)=lower(p_email)));
exception when insufficient_privilege then return jsonb_build_object('ok',false,'error','not_allowed');
 when raise_exception then
 if sqlerrm in ('invalid_course','invalid_email','invalid_events') then return jsonb_build_object('ok',false,'error',sqlerrm); end if;
 raise;
end $$;
revoke all on function public.preflight_staff_invitation(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.preflight_staff_invitation(uuid,text,uuid[]) to authenticated;

create function public.complete_staff_invitation(p_course_id uuid,p_email text,p_event_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_user uuid; v_event uuid;
begin
 v_org:=private.staff_invitation_scope(p_course_id,p_email,p_event_ids);
 -- Exact email lookup, never a client-chosen user/role/org and never a list of Auth users.
 select id into v_user from auth.users where lower(email)=lower(p_email) for share;
 if not found then return jsonb_build_object('ok',false,'error','account_missing'); end if;
 insert into public.organization_members(organization_id,user_id,role) values(v_org,v_user,'staff')
 on conflict(organization_id,user_id) do nothing;
 for v_event in select distinct x from unnest(p_event_ids) x order by x loop
  insert into public.event_staff_access(organization_id,event_id,user_id,granted_by)
  values(v_org,v_event,v_user,auth.uid())
  on conflict(event_id,user_id) do update set revoked_at=null,granted_by=auth.uid(),granted_at=now()
  where public.event_staff_access.revoked_at is not null;
 end loop;
 return jsonb_build_object('ok',true);
exception when insufficient_privilege then return jsonb_build_object('ok',false,'error','not_allowed');
 when raise_exception then
 if sqlerrm in ('invalid_course','invalid_email','invalid_events') then return jsonb_build_object('ok',false,'error',sqlerrm); end if;
 raise;
end $$;
revoke all on function public.complete_staff_invitation(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.complete_staff_invitation(uuid,text,uuid[]) to authenticated;
