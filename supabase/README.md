# iScoreGolf Contest — database

## Files
- `migrations/20261014000000_initial_schema.sql` — tables, security rules, golfer and staff functions
- `seed.sql` — sample 144-golfer event with the 4 prototype contests (development only)
- `tests/schema.test.mjs` — 40 automated checks run against an in-memory Postgres

## Apply to your Supabase project
1. Supabase dashboard → **SQL Editor** → paste the migration file → **Run**.
2. Sign up once in your app (or create a user under **Authentication → Users**), then run:
   ```sql
   insert into private.platform_admins (user_id)
   select id from auth.users where email = 'YOUR_EMAIL';
   ```
3. Optional, on a development project only: run `seed.sql` to load the sample event.

Later, once the app code exists, use the Supabase CLI (`supabase db push`) so every change is a versioned migration file in GitHub.

## Run the tests
```bash
npm install @electric-sql/pglite
node supabase/tests/schema.test.mjs
```

## Golfer-facing API (no login)
| Function | Purpose |
|---|---|
| `get_contest_public(token)` | Contest, sponsor and current leader for the QR page |
| `get_contest_roster(token)` | Names to pick from (no contact details) |
| `submit_contest_entry(token, golfer_id, value, client_request_id)` | Submit a result; safe to retry with the same request id |

Live leader updates: subscribe with Supabase Realtime to `contest_leaders` filtered by `contest_id`.

## Staff API (login required)
`check_in_golfer`, `review_contest_entry` (accept / reject / void), `correct_contest_entry` (owners/admins), `regenerate_contest_token` (owners/admins).
