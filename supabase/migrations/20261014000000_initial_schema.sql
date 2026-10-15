-- =====================================================================
-- iScoreGolf Contest — initial schema (V1)
--
-- What this creates
--   * Customers (organizations) and their staff (organization_members)
--   * Events, teams, golfers, sponsors, contests, contest entries
--   * contest_leaders: one public-safe row per contest, used for the
--     live leaderboard (Supabase Realtime)
--   * audit_log: every change to event data, with who made it
--
-- Security model
--   * Row Level Security (RLS) is on for every table.
--   * Staff only see data for the organizations they belong to.
--   * Golfers never log in and never write to tables directly. They call
--     three functions with the contest's QR token:
--       get_contest_public, get_contest_roster, submit_contest_entry
--   * Platform admins (you) can see and manage everything.
--
-- Bootstrap after running this file (SQL editor, once you have signed up):
--   insert into private.platform_admins (user_id)
--   select id from auth.users where email = 'YOUR_EMAIL';
-- =====================================================================

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.member_role    as enum ('owner', 'admin', 'staff');
create type public.event_status   as enum ('draft', 'live', 'closed', 'archived');
create type public.contest_kind   as enum ('long_drive', 'closest_to_pin', 'other');
-- lowest_value : smallest measurement wins (Closest to the Pin)
-- highest_value: largest measurement wins (Long Drive with measured distance)
-- latest_claim : most recent accepted claim wins (Long Drive with a marker)
create type public.scoring_mode   as enum ('lowest_value', 'highest_value', 'latest_claim');
create type public.contest_status as enum ('draft', 'open', 'closed');
create type public.entry_status   as enum ('pending', 'accepted', 'rejected', 'void');
create type public.measure_unit   as enum ('yards', 'feet', 'inches', 'meters', 'none');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table private.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.member_role not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  course_name     text check (length(course_name) <= 200),
  event_date      date,
  status          public.event_status not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);
create index events_org_idx on public.events (organization_id);

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id        uuid not null,
  name            text not null check (length(trim(name)) between 1 and 100),
  starting_hole   smallint check (starting_hole between 1 and 36),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  unique (event_id, name),
  unique (id, event_id)
);
create index teams_event_idx on public.teams (event_id);

create table public.golfers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id        uuid not null,
  team_id         uuid,
  first_name      text not null check (length(trim(first_name)) between 1 and 100),
  last_name       text not null check (length(trim(last_name)) between 1 and 100),
  division        text check (length(division) <= 50),          -- e.g. 'Men', 'Women'
  email           text check (length(email) <= 254),
  phone           text check (length(phone) <= 40),
  external_ref    text check (length(external_ref) <= 100),     -- ID from the import spreadsheet
  checked_in_at   timestamptz,
  checked_in_by   uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  foreign key (team_id, event_id) references public.teams (id, event_id) on delete set null (team_id),
  unique (id, event_id)
);
create index golfers_event_idx on public.golfers (event_id);
create index golfers_team_idx on public.golfers (team_id);
create unique index golfers_event_external_ref_uq on public.golfers (event_id, external_ref)
  where external_ref is not null;

create table public.sponsors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  logo_path       text check (length(logo_path) <= 500),         -- path in the sponsor-logos bucket
  website_url     text check (website_url ~* '^https://' and length(website_url) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)
);
create index sponsors_org_idx on public.sponsors (organization_id);

create table public.contests (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  event_id          uuid not null,
  sponsor_id        uuid,
  name              text not null check (length(trim(name)) between 1 and 200),
  kind              public.contest_kind not null,
  division          text check (length(division) <= 50),        -- limits the roster when set
  hole_number       smallint check (hole_number between 1 and 36),
  tees              text check (length(tees) <= 50),
  hole_yardage      smallint check (hole_yardage > 0),
  scoring_mode      public.scoring_mode not null,
  unit              public.measure_unit not null,
  min_value         numeric(8,2),
  max_value         numeric(8,2),
  requires_approval boolean not null default false,
  status            public.contest_status not null default 'draft',
  closes_at         timestamptz,
  -- 128 random bits; printed in the QR code URL
  public_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  foreign key (sponsor_id, organization_id) references public.sponsors (id, organization_id) on delete set null (sponsor_id),
  unique (id, event_id),
  check (min_value is null or max_value is null or min_value <= max_value),
  check (scoring_mode = 'latest_claim' or unit <> 'none')
);
create index contests_event_idx on public.contests (event_id);

create table public.contest_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  event_id          uuid not null,
  contest_id        uuid not null,
  golfer_id         uuid not null,
  value             numeric(8,2),
  status            public.entry_status not null,
  client_request_id uuid not null,           -- makes retries safe (same id = same submission)
  submitted_at      timestamptz not null default now(),
  accepted_at       timestamptz,
  reviewed_by       uuid references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text check (length(review_note) <= 500),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  foreign key (contest_id, event_id) references public.contests (id, event_id) on delete cascade,
  foreign key (golfer_id, event_id) references public.golfers (id, event_id) on delete cascade,
  unique (contest_id, client_request_id)
);
create index contest_entries_contest_idx on public.contest_entries (contest_id, status);
-- One live (pending or accepted) entry per golfer per contest
create unique index contest_entries_one_active_uq on public.contest_entries (contest_id, golfer_id)
  where status in ('pending', 'accepted');

-- Public-safe summary for the live leaderboard. Contains no contact details.
create table public.contest_leaders (
  contest_id      uuid primary key references public.contests (id) on delete cascade,
  organization_id uuid not null,
  event_id        uuid not null,
  entry_id        uuid references public.contest_entries (id) on delete set null,
  leader_name     text,
  team_name       text,
  value           numeric(8,2),
  unit            public.measure_unit not null,
  entry_count     integer not null default 0,
  updated_at      timestamptz not null default now()
);

create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  actor_user_id   uuid,
  actor_golfer_id uuid,
  action          text not null,
  table_name      text not null,
  row_id          uuid,
  old_data        jsonb,
  new_data        jsonb,
  created_at      timestamptz not null default now()
);
create index audit_log_org_time_idx on public.audit_log (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- Access helpers (used by RLS policies)
-- ---------------------------------------------------------------------
create function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.platform_admins where user_id = (select auth.uid())
  );
$$;

create function private.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin()
      or exists (
        select 1 from public.organization_members m
        where m.organization_id = p_org
          and m.user_id = (select auth.uid())
          and m.role = any (p_roles)
      );
$$;

create function private.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_org, array['owner','admin','staff']::public.member_role[]);
$$;

create function private.is_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_org, array['owner','admin']::public.member_role[]);
$$;

create function private.contest_is_public(p_contest uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.contests c
    join public.events e on e.id = c.event_id
    where c.id = p_contest
      and c.status in ('open', 'closed')
      and e.status in ('live', 'closed')
  );
$$;

-- ---------------------------------------------------------------------
-- Triggers: timestamps, organization consistency, audit log
-- ---------------------------------------------------------------------
create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Fills organization_id from the event, and stops rows moving between events.
create function private.fill_org_from_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.event_id is distinct from old.event_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'event_id and organization_id cannot be changed';
    end if;
    return new;
  end if;

  select e.organization_id into new.organization_id
  from public.events e where e.id = new.event_id;

  if new.organization_id is null then
    raise exception 'event not found';
  end if;
  return new;
end;
$$;

create function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
begin
  if tg_table_name = 'organizations' then
    v_org := (v_row ->> 'id')::uuid;
  else
    v_org := (v_row ->> 'organization_id')::uuid;
  end if;

  insert into public.audit_log
    (organization_id, actor_user_id, actor_golfer_id, action, table_name, row_id, old_data, new_data)
  values (
    v_org,
    auth.uid(),
    case when tg_table_name = 'contest_entries' and auth.uid() is null
         then (v_row ->> 'golfer_id')::uuid end,
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations','events','teams','golfers','sponsors','contests'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;

  foreach t in array array['teams','golfers','contests'] loop
    execute format(
      'create trigger fill_org_from_event before insert or update on public.%I
         for each row execute function private.fill_org_from_event()', t);
  end loop;

  foreach t in array array['organizations','organization_members','events','teams',
                           'golfers','sponsors','contests','contest_entries'] loop
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I
         for each row execute function private.audit_row()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Leaderboard
-- ---------------------------------------------------------------------
-- Recomputes the leader for one contest from accepted entries.
-- Ties go to whoever was accepted first.
create function private.refresh_contest_leader(p_contest_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_c        public.contests%rowtype;
  v_entry_id uuid;
  v_value    numeric(8,2);
  v_name     text;
  v_team     text;
  v_count    integer;
begin
  select * into v_c from public.contests where id = p_contest_id;
  if not found then
    return;
  end if;

  select ce.id, ce.value, g.first_name || ' ' || g.last_name, t.name
    into v_entry_id, v_value, v_name, v_team
  from public.contest_entries ce
  join public.golfers g on g.id = ce.golfer_id
  left join public.teams t on t.id = g.team_id
  where ce.contest_id = p_contest_id
    and ce.status = 'accepted'
    and (v_c.scoring_mode = 'latest_claim' or ce.value is not null)
  order by
    case when v_c.scoring_mode = 'lowest_value'  then ce.value end asc  nulls last,
    case when v_c.scoring_mode = 'highest_value' then ce.value end desc nulls last,
    case when v_c.scoring_mode = 'latest_claim'  then ce.accepted_at end desc nulls last,
    ce.accepted_at asc,
    ce.submitted_at asc,
    ce.id
  limit 1;

  select count(*) into v_count
  from public.contest_entries
  where contest_id = p_contest_id and status = 'accepted';

  insert into public.contest_leaders
    (contest_id, organization_id, event_id, entry_id, leader_name, team_name, value, unit, entry_count, updated_at)
  values
    (v_c.id, v_c.organization_id, v_c.event_id, v_entry_id, v_name, v_team, v_value, v_c.unit, v_count, now())
  on conflict (contest_id) do update set
    entry_id    = excluded.entry_id,
    leader_name = excluded.leader_name,
    team_name   = excluded.team_name,
    value       = excluded.value,
    unit        = excluded.unit,
    entry_count = excluded.entry_count,
    updated_at  = now();
end;
$$;

create function private.contest_leader_on_contest_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.scoring_mode is distinct from old.scoring_mode
     or new.unit is distinct from old.unit then
    perform private.refresh_contest_leader(new.id);
  end if;
  return null;
end;
$$;

create trigger contest_leader_sync
  after insert or update on public.contests
  for each row execute function private.contest_leader_on_contest_change();

-- Keeps the leader's name/team current if a golfer is edited mid-event.
create function private.contest_leader_on_golfer_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name
     or new.team_id is distinct from old.team_id then
    for r in select distinct contest_id from public.contest_entries where golfer_id = new.id loop
      perform private.refresh_contest_leader(r.contest_id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger contest_leader_golfer_sync
  after update on public.golfers
  for each row execute function private.contest_leader_on_golfer_change();

-- ---------------------------------------------------------------------
-- Golfer-facing functions (no login; identified by the contest QR token)
-- ---------------------------------------------------------------------
create function private.leader_json(p_contest_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', l.leader_name, 'team', l.team_name, 'value', l.value,
    'unit', l.unit, 'entry_count', l.entry_count, 'updated_at', l.updated_at)
  from public.contest_leaders l where l.contest_id = p_contest_id;
$$;

-- Contest details shown on the golfer's phone after scanning the QR code.
create function public.get_contest_public(p_token text)
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
    'leader', private.leader_json(v_c.id)
  );
end;
$$;

-- Names golfers pick from. No contact details are returned.
create function public.get_contest_roster(p_token text)
returns table (golfer_id uuid, display_name text, team_name text, starting_hole smallint)
language sql stable security definer set search_path = '' as $$
  select g.id, g.first_name || ' ' || g.last_name, t.name, t.starting_hole
  from public.contests c
  join public.events e on e.id = c.event_id
  join public.golfers g on g.event_id = c.event_id
  left join public.teams t on t.id = g.team_id
  where c.public_token = p_token
    and c.status = 'open'
    and e.status = 'live'
    and (c.division is null or g.division is null or g.division = c.division)
  order by g.last_name, g.first_name;
$$;

-- Submits a result. Safe to retry with the same p_client_request_id.
-- The contest row is locked so simultaneous submissions are processed one at a time.
create function public.submit_contest_entry(
  p_token             text,
  p_golfer_id         uuid,
  p_value             numeric,
  p_client_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_c        public.contests%rowtype;
  v_event    public.event_status;
  v_division text;
  v_existing public.contest_entries%rowtype;
  v_entry_id uuid;
  v_status   public.entry_status;
  v_value    numeric(8,2) := round(p_value, 2);
begin
  if p_token is null or p_golfer_id is null or p_client_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;

  select * into v_c from public.contests where public_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'contest_not_found');
  end if;

  -- Retry of a submission we already have: return the original result.
  select * into v_existing from public.contest_entries
  where contest_id = v_c.id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('ok', true, 'entry_id', v_existing.id, 'status', v_existing.status,
                              'repeat', true, 'leader', private.leader_json(v_c.id));
  end if;

  select status into v_event from public.events where id = v_c.event_id;
  if v_event <> 'live' then
    return jsonb_build_object('ok', false, 'error', 'event_not_live');
  end if;
  if v_c.status <> 'open' or (v_c.closes_at is not null and now() >= v_c.closes_at) then
    return jsonb_build_object('ok', false, 'error', 'contest_closed');
  end if;

  select division into v_division from public.golfers
  where id = p_golfer_id and event_id = v_c.event_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'golfer_not_in_event');
  end if;
  if v_c.division is not null and v_division is not null and v_division <> v_c.division then
    return jsonb_build_object('ok', false, 'error', 'wrong_division');
  end if;

  if v_c.scoring_mode <> 'latest_claim' and v_value is null then
    return jsonb_build_object('ok', false, 'error', 'value_required');
  end if;
  if v_value is not null and (
       v_value < 0
       or (v_c.min_value is not null and v_value < v_c.min_value)
       or (v_c.max_value is not null and v_value > v_c.max_value)) then
    return jsonb_build_object('ok', false, 'error', 'value_out_of_range',
                              'min_value', v_c.min_value, 'max_value', v_c.max_value);
  end if;

  if exists (select 1 from public.contest_entries
             where contest_id = v_c.id and golfer_id = p_golfer_id
               and status in ('pending', 'accepted')) then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  v_status := case when v_c.requires_approval then 'pending' else 'accepted' end;

  begin
    insert into public.contest_entries
      (organization_id, event_id, contest_id, golfer_id, value, status, client_request_id, accepted_at)
    values
      (v_c.organization_id, v_c.event_id, v_c.id, p_golfer_id, v_value, v_status, p_client_request_id,
       case when v_status = 'accepted' then now() end)
    returning id into v_entry_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end;

  perform private.refresh_contest_leader(v_c.id);

  return jsonb_build_object('ok', true, 'entry_id', v_entry_id, 'status', v_status,
                            'repeat', false, 'leader', private.leader_json(v_c.id));
end;
$$;

-- ---------------------------------------------------------------------
-- Staff functions (require login)
-- ---------------------------------------------------------------------
-- Check a golfer in (or undo it). Any staff member of the organization.
create function public.check_in_golfer(p_golfer_id uuid, p_checked_in boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.golfers where id = p_golfer_id;
  if v_org is null or not private.is_member(v_org) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  update public.golfers set
    checked_in_at = case when p_checked_in then coalesce(checked_in_at, now()) end,
    checked_in_by = case when p_checked_in then coalesce(checked_in_by, auth.uid()) end
  where id = p_golfer_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Approve, reject or void an entry. Any staff member of the organization.
-- Allowed: pending -> accepted | rejected; pending/accepted -> void.
create function public.review_contest_entry(
  p_entry_id uuid,
  p_status   public.entry_status,
  p_note     text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_e public.contest_entries%rowtype;
begin
  select * into v_e from public.contest_entries where id = p_entry_id;
  if not found or not private.is_member(v_e.organization_id) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  perform 1 from public.contests where id = v_e.contest_id for update;
  select * into v_e from public.contest_entries where id = p_entry_id;  -- re-read after lock

  if not (
       (v_e.status = 'pending' and p_status in ('accepted', 'rejected'))
    or (v_e.status in ('pending', 'accepted') and p_status = 'void')) then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition',
                              'from', v_e.status, 'to', p_status);
  end if;

  update public.contest_entries set
    status      = p_status,
    accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = left(p_note, 500)
  where id = p_entry_id;

  perform private.refresh_contest_leader(v_e.contest_id);
  return jsonb_build_object('ok', true, 'leader', private.leader_json(v_e.contest_id));
end;
$$;

-- Correct a measured value (e.g. a golfer typed 41 instead of 4.1). Owners/admins only.
create function public.correct_contest_entry(p_entry_id uuid, p_value numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_e public.contest_entries%rowtype;
begin
  select * into v_e from public.contest_entries where id = p_entry_id;
  if not found or not private.is_manager(v_e.organization_id) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'note_required');
  end if;
  if p_value is not null and p_value < 0 then
    return jsonb_build_object('ok', false, 'error', 'value_out_of_range');
  end if;

  perform 1 from public.contests where id = v_e.contest_id for update;

  update public.contest_entries set
    value       = round(p_value, 2),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = left(p_note, 500)
  where id = p_entry_id;

  perform private.refresh_contest_leader(v_e.contest_id);
  return jsonb_build_object('ok', true, 'leader', private.leader_json(v_e.contest_id));
end;
$$;

-- Issue a new QR token (old printed QR codes stop working). Owners/admins only.
create function public.regenerate_contest_token(p_contest_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_token text;
begin
  select organization_id into v_org from public.contests where id = p_contest_id;
  if v_org is null or not private.is_manager(v_org) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update public.contests
     set public_token = replace(gen_random_uuid()::text, '-', '')
   where id = p_contest_id
  returning public_token into v_token;
  return jsonb_build_object('ok', true, 'public_token', v_token);
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table private.platform_admins       enable row level security;
alter table public.organizations          enable row level security;
alter table public.organization_members   enable row level security;
alter table public.events                 enable row level security;
alter table public.teams                  enable row level security;
alter table public.golfers                enable row level security;
alter table public.sponsors               enable row level security;
alter table public.contests               enable row level security;
alter table public.contest_entries        enable row level security;
alter table public.contest_leaders        enable row level security;
alter table public.audit_log              enable row level security;

-- organizations: members read; only platform admins create/change/delete customers
create policy org_select on public.organizations for select to authenticated
  using (private.is_member(id));
create policy org_write on public.organizations for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

-- organization_members: members see their colleagues; owners manage them
create policy members_select on public.organization_members for select to authenticated
  using (private.is_member(organization_id));
create policy members_insert on public.organization_members for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner']::public.member_role[]));
create policy members_update on public.organization_members for update to authenticated
  using (private.has_org_role(organization_id, array['owner']::public.member_role[]))
  with check (private.has_org_role(organization_id, array['owner']::public.member_role[]));
create policy members_delete on public.organization_members for delete to authenticated
  using (private.has_org_role(organization_id, array['owner']::public.member_role[]));

-- Event data: any member reads; owners/admins write
do $$
declare t text;
begin
  foreach t in array array['events','teams','golfers','sponsors','contests'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                      using (private.is_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                      with check (private.is_manager(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
                      using (private.is_manager(organization_id))
                      with check (private.is_manager(organization_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated
                      using (private.is_manager(organization_id))', t);
  end loop;
end;
$$;

-- Entries: read-only for members. All writes go through the functions above.
create policy entries_select on public.contest_entries for select to authenticated
  using (private.is_member(organization_id));

-- Leaderboard: members always; anyone (incl. golfers) once the contest is public
create policy leaders_select_member on public.contest_leaders for select to authenticated
  using (private.is_member(organization_id));
create policy leaders_select_public on public.contest_leaders for select to anon, authenticated
  using (private.contest_is_public(contest_id));

-- Audit log: owners/admins read; nobody edits
create policy audit_select on public.audit_log for select to authenticated
  using (private.is_manager(organization_id));

-- ---------------------------------------------------------------------
-- Privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.contest_leaders to anon;

revoke insert, update, delete on public.contest_entries, public.contest_leaders, public.audit_log
  from authenticated;
revoke all on private.platform_admins from anon, authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_platform_admin(),
  private.has_org_role(uuid, public.member_role[]),
  private.is_member(uuid),
  private.is_manager(uuid),
  private.contest_is_public(uuid)
to anon, authenticated;

revoke execute on function
  public.get_contest_public(text),
  public.get_contest_roster(text),
  public.submit_contest_entry(text, uuid, numeric, uuid),
  public.check_in_golfer(uuid, boolean),
  public.review_contest_entry(uuid, public.entry_status, text),
  public.correct_contest_entry(uuid, numeric, text),
  public.regenerate_contest_token(uuid)
from public, anon, authenticated;

grant execute on function
  public.get_contest_public(text),
  public.get_contest_roster(text),
  public.submit_contest_entry(text, uuid, numeric, uuid)
to anon, authenticated;

grant execute on function
  public.check_in_golfer(uuid, boolean),
  public.review_contest_entry(uuid, public.entry_status, text),
  public.correct_contest_entry(uuid, numeric, text),
  public.regenerate_contest_token(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Supabase-only setup (skipped when not running on Supabase)
-- ---------------------------------------------------------------------
do $$
begin
  -- Live leaderboard updates over Realtime
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.contest_leaders';
  end if;

  -- Sponsor logo storage: public to read, owners/admins upload.
  -- Files go under '<organization_id>/<file name>'.
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('sponsor-logos', 'sponsor-logos', true, 2097152,
            array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
    on conflict (id) do nothing;

    execute $p$
      create or replace function private.storage_org(p_name text)
      returns uuid language plpgsql immutable set search_path = '' as $f$
      begin
        return split_part(p_name, '/', 1)::uuid;
      exception when others then
        return null;
      end;
      $f$;
      grant execute on function private.storage_org(text) to authenticated;

      create policy sponsor_logos_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'sponsor-logos'
                    and private.is_manager(private.storage_org(name)));
      create policy sponsor_logos_update on storage.objects for update to authenticated
        using (bucket_id = 'sponsor-logos' and private.is_manager(private.storage_org(name)))
        with check (bucket_id = 'sponsor-logos' and private.is_manager(private.storage_org(name)));
      create policy sponsor_logos_delete on storage.objects for delete to authenticated
        using (bucket_id = 'sponsor-logos' and private.is_manager(private.storage_org(name)));
    $p$;
  end if;
end;
$$;
