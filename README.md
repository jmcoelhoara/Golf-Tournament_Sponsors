# Golf Tournament Sponsors — contest app

Live sponsor contests (Long Drive, Closest to the Pin) for golf tournaments.
Golfers scan a QR code at the hole, pick their name and submit; the leader updates live.

- **Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, Realtime, Storage) · Vercel
- **Data region:** Supabase `ca-central-1` (Canada)

## Pages
| Path | Who | What |
|---|---|---|
| `/c/<token>` | Golfers (no login) | Contest page from the QR code: sponsor, live leader, pick name, submit |
| `/login` | Staff | Email + password sign in |
| `/admin` | Staff | Events, contests, QR codes, open/close, go live |
| `/admin/contests/<id>` | Staff | Entries for a contest; accept / reject / void |

## Run locally
```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev
```

## Deploy (Vercel)
Import this repo in Vercel and add the two environment variables from `.env.example`
(Supabase → Project Settings → API). Every push to `main` deploys automatically.

## Database
See [`supabase/README.md`](supabase/README.md). Migrations live in `supabase/migrations/`,
tests in `supabase/tests/` (`npm i @electric-sql/pglite && node supabase/tests/schema.test.mjs`).
