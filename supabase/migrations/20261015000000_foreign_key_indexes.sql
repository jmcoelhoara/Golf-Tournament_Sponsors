-- =====================================================================
-- Index every foreign key (Supabase performance advisor: unindexed_foreign_keys).
-- Applied to Golf-Sponsors on 2026-10-14.
-- =====================================================================
create index if not exists contests_event_org_idx      on public.contests (event_id, organization_id);
create index if not exists contests_sponsor_org_idx    on public.contests (sponsor_id, organization_id);
create index if not exists teams_event_org_idx         on public.teams (event_id, organization_id);
create index if not exists golfers_event_org_idx       on public.golfers (event_id, organization_id);
create index if not exists golfers_team_event_idx      on public.golfers (team_id, event_id);
create index if not exists golfers_checked_in_by_idx   on public.golfers (checked_in_by);
create index if not exists contest_entries_contest_event_idx on public.contest_entries (contest_id, event_id);
create index if not exists contest_entries_event_org_idx     on public.contest_entries (event_id, organization_id);
create index if not exists contest_entries_golfer_event_idx  on public.contest_entries (golfer_id, event_id);
create index if not exists contest_entries_reviewed_by_idx   on public.contest_entries (reviewed_by);
create index if not exists contest_leaders_entry_idx   on public.contest_leaders (entry_id);
