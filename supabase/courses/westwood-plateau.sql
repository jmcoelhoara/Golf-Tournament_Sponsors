-- =====================================================================
-- Course catalog: GreenTee Country Club Westwood Plateau — Sky Course
-- Coquitlam, BC. 18 holes, par 72.
--
-- Source: the club's official Sky Course scorecard
--   https://www.gtccwestwoodplateau.com/wp-content/uploads/2025/03/sky_scorecard.png
-- (checked 2026-10-26; matches the GolfPass listing under the older tee names
--  Crown / Plateau / Griffin / Hairpin / Deers Leap).
-- Yardages are integer yards, as the catalog expects. Re-check with the club's
-- pro shop before a real event; tees and yardages are editable in /admin/courses.
--
-- Data only, not a schema migration. Safe to re-run: fixed IDs, upserts.
-- Run as a platform administrator / service role (SQL editor) AFTER all migrations.
-- Afterwards: add the club's staff to organization_members and grant event access
-- from /admin/access. Do not run seed.sql on a real project.
-- =====================================================================
begin;

insert into public.organizations (id, name) values
  ('5d0a1e00-0000-4000-8000-00000000a001', 'GreenTee Country Club Westwood Plateau')
on conflict (id) do nothing;

insert into public.courses (id, organization_id, name) values
  ('5d0a1e00-0000-4000-8000-00000000c001', '5d0a1e00-0000-4000-8000-00000000a001', 'Westwood Plateau — Sky Course')
on conflict (id) do nothing;

insert into public.course_tees (id, course_id, label, color_hex, sort_order) values
  ('5d0a1e00-0000-4000-8000-000000007101', '5d0a1e00-0000-4000-8000-00000000c001', 'Gold', '#C9A23F', 1),  -- 6770 yds
  ('5d0a1e00-0000-4000-8000-000000007102', '5d0a1e00-0000-4000-8000-00000000c001', 'Blue', '#4A7FC1', 2),  -- 6355 yds
  ('5d0a1e00-0000-4000-8000-000000007103', '5d0a1e00-0000-4000-8000-00000000c001', 'White', '#FFFFFF', 3),  -- 5893 yds
  ('5d0a1e00-0000-4000-8000-000000007104', '5d0a1e00-0000-4000-8000-00000000c001', 'Red', '#D9443F', 4),  -- 5219 yds
  ('5d0a1e00-0000-4000-8000-000000007105', '5d0a1e00-0000-4000-8000-00000000c001', 'Green', '#3D7A55', 5)  -- 5014 yds
on conflict (id) do update set label = excluded.label, color_hex = excluded.color_hex, sort_order = excluded.sort_order;

-- hole, then yards per tee: Gold, Blue, White, Red, Green
insert into public.course_hole_yardages (tee_id, hole_number, yardage)
select t.tee_id, h.hole, (array[h.gold, h.blue, h.white, h.red, h.green])[t.n]
from (values
  ( 1, 352, 334, 305, 292, 275),
  ( 2, 347, 325, 307, 279, 268),
  ( 3, 205, 194, 165, 102, 102),
  ( 4, 535, 510, 460, 415, 415),
  ( 5, 470, 420, 365, 351, 316),
  ( 6, 196, 175, 154, 138, 120),
  ( 7, 583, 548, 507, 448, 448),
  ( 8, 415, 394, 368, 341, 309),
  ( 9, 341, 322, 300, 280, 268),
  (10, 382, 357, 328, 228, 228),
  (11, 342, 328, 315, 247, 247),
  (12, 162, 145, 142, 132, 115),
  (13, 350, 335, 330, 281, 281),
  (14, 523, 498, 459, 413, 397),
  (15, 456, 427, 402, 368, 368),
  (16, 180, 154, 152, 130, 113),
  (17, 501, 482, 455, 429, 429),
  (18, 430, 407, 379, 345, 315)
) as h(hole, gold, blue, white, red, green)
cross join (values
  (1, '5d0a1e00-0000-4000-8000-000000007101'::uuid),
  (2, '5d0a1e00-0000-4000-8000-000000007102'::uuid),
  (3, '5d0a1e00-0000-4000-8000-000000007103'::uuid),
  (4, '5d0a1e00-0000-4000-8000-000000007104'::uuid),
  (5, '5d0a1e00-0000-4000-8000-000000007105'::uuid)
) as t(n, tee_id)
on conflict (tee_id, hole_number) do update set yardage = excluded.yardage, updated_at = now();

commit;
