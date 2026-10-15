-- =====================================================================
-- Event sponsor strip
--   * event_sponsors: which sponsors appear in the "Thank you to our
--     sponsors" strip on every contest page of an event, and in what order
--   * get_contest_public now returns that list as 'event_sponsors'
--   * sponsor-logos storage: managers can list their own logos (needed to
--     remove/replace files through the Storage API)
-- =====================================================================

create table public.event_sponsors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id        uuid not null,
  sponsor_id      uuid not null,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  foreign key (sponsor_id, organization_id) references public.sponsors (id, organization_id) on delete cascade,
  unique (event_id, sponsor_id)
);
create index event_sponsors_event_org_idx   on public.event_sponsors (event_id, organization_id);
create index event_sponsors_sponsor_org_idx on public.event_sponsors (sponsor_id, organization_id);

create trigger fill_org_from_event before insert or update on public.event_sponsors
  for each row execute function private.fill_org_from_event();
create trigger audit_row after insert or update or delete on public.event_sponsors
  for each row execute function private.audit_row();

alter table public.event_sponsors enable row level security;
create policy event_sponsors_select on public.event_sponsors for select to authenticated
  using (private.is_member(organization_id));
create policy event_sponsors_insert on public.event_sponsors for insert to authenticated
  with check (private.is_manager(organization_id));
create policy event_sponsors_update on public.event_sponsors for update to authenticated
  using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy event_sponsors_delete on public.event_sponsors for delete to authenticated
  using (private.is_manager(organization_id));
revoke all on public.event_sponsors from anon;

-- Contest details for the golfer's phone, now with the event sponsor strip.
create or replace function public.get_contest_public(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_c public.contests%rowtype;
  v_e public.events%rowtype;
  v_s public.sponsors%rowtype;
begin
  select * into v_c from public.contests where public_token = p_token;
  if not found then
    return jsonb_build_object('available', false, 'reason', 'not_found');
  end if;

  select * into v_e from public.events where id = v_c.event_id;
  if v_e.status not in ('live', 'closed') or v_c.status = 'draft' then
    return jsonb_build_object('available', false, 'reason', 'not_open_yet', 'event_name', v_e.name);
  end if;

  select * into v_s from public.sponsors where id = v_c.sponsor_id;

  return jsonb_build_object(
    'available', true,
    'contest_id', v_c.id,
    'name', v_c.name,
    'kind', v_c.kind,
    'division', v_c.division,
    'hole_number', v_c.hole_number,
    'tees', v_c.tees,
    'hole_yardage', v_c.hole_yardage,
    'scoring_mode', v_c.scoring_mode,
    'unit', v_c.unit,
    'min_value', v_c.min_value,
    'max_value', v_c.max_value,
    'requires_approval', v_c.requires_approval,
    'accepting_entries', v_e.status = 'live' and v_c.status = 'open'
                         and (v_c.closes_at is null or now() < v_c.closes_at),
    'event', jsonb_build_object('name', v_e.name, 'course_name', v_e.course_name, 'event_date', v_e.event_date),
    'sponsor', case when v_s.id is null then null else jsonb_build_object(
                 'name', v_s.name, 'logo_path', v_s.logo_path, 'website_url', v_s.website_url) end,
    'event_sponsors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'logo_path', s.logo_path, 'website_url', s.website_url)
             order by es.sort_order, s.name)
      from public.event_sponsors es
      join public.sponsors s on s.id = es.sponsor_id
      where es.event_id = v_e.id), '[]'::jsonb),
    'leader', private.leader_json(v_c.id)
  );
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'objects') then
    execute $p$
      create policy sponsor_logos_select on storage.objects for select to authenticated
        using (bucket_id = 'sponsor-logos' and private.is_manager(private.storage_org(name)))
    $p$;
  end if;
end;
$$;
