-- =====================================================================
-- Sample data for development and testing (NOT for production)
-- One customer, one 144-golfer event (36 teams of 4, shotgun start),
-- 3 sponsors and the 4 contests from the prototype screen.
-- =====================================================================

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Demo Golf Co');

insert into public.events (id, organization_id, name, course_name, event_date, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1',
   'Building for Kids Charity Golf Classic', 'Morgan Creek Golf Course', '2027-07-15', 'live');

insert into public.sponsors (id, organization_id, name, website_url) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'ABC Construction', null),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'West Coast Development', null),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'Pacific Insurance', null);

-- 36 teams; two teams start on each of the 18 holes
insert into public.teams (event_id, name, starting_hole)
select '00000000-0000-0000-0000-0000000000e1',
       'Team ' || lpad(n::text, 2, '0'),
       ((n - 1) % 18) + 1
from generate_series(1, 36) as n;

-- 144 golfers, 4 per team; alternating Men / Women divisions
with names as (
  select n,
         (array['Mike','Jennifer','David','Sarah','Chris','Emily','James','Olivia','Ryan','Grace',
                'Daniel','Hannah','Kevin','Megan','Brian','Laura','Jason','Amy'])[((n - 1) % 18) + 1] as first_name,
         (array['Johnson','Brown','Wong','Lee','Smith','Patel','Nguyen','Martin','Singh','Clark',
                'Chen','Wilson','Taylor','Garcia','Thomas','Kim'])[((n - 1) % 16) + 1] as last_name
  from generate_series(1, 144) as n
)
insert into public.golfers (event_id, team_id, first_name, last_name, division, external_ref)
select '00000000-0000-0000-0000-0000000000e1',
       t.id,
       nm.first_name,
       nm.last_name,
       case when nm.n % 2 = 1 then 'Men' else 'Women' end,
       'G' || lpad(nm.n::text, 3, '0')
from names nm
join public.teams t
  on t.event_id = '00000000-0000-0000-0000-0000000000e1'
 and t.name = 'Team ' || lpad((((nm.n - 1) / 4) + 1)::text, 2, '0');

-- Fixed QR tokens so links are predictable while developing
insert into public.contests
  (id, event_id, sponsor_id, name, kind, division, hole_number, tees, hole_yardage,
   scoring_mode, unit, min_value, max_value, status, public_token)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1', 'Men''s Long Drive', 'long_drive', 'Men',
   6, 'Blue', 412, 'latest_claim', 'none', null, null, 'open', 'dev-men-long-drive'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1', 'Women''s Long Drive', 'long_drive', 'Women',
   6, 'Red', 346, 'latest_claim', 'none', null, null, 'open', 'dev-women-long-drive'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b2', 'Men''s Closest to the Pin', 'closest_to_pin', 'Men',
   12, 'Blue', 168, 'lowest_value', 'inches', 0, 1200, 'open', 'dev-men-ctp'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b3', 'Women''s Closest to the Pin', 'closest_to_pin', 'Women',
   12, 'Red', 142, 'lowest_value', 'inches', 0, 1200, 'open', 'dev-women-ctp');
