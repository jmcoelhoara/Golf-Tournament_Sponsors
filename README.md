# Golf Tournament Sponsors — contest app

Live sponsor contests (Long Drive, Closest to the Pin) for golf tournaments.
Golfers scan a QR code at the hole, pick their name and submit; the leader updates live.

- **Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, Realtime, Storage) · Vercel
- **Data region:** Supabase `ca-central-1` (Canada)

## Pages
| Path | Who | What |
|---|---|---|
| `/c/<token>` | Golfers (no login) | Contest page from the QR code: sponsor, live leader, pick name, submit |
| `/login` | Staff | Email + password sign in, branded with the default course (logo + course map) |
| `/login/<course>` | Staff | Same sign in, branded for one course (e.g. `/login/westwood-plateau`) |
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

## Golf course clients
Each course client has two parts:

1. **Branding** (staff sign-in): an entry in `src/lib/course-brand.ts` plus its logo and course map in
   `public/courses/<slug>/`. `NEXT_PUBLIC_DEFAULT_COURSE` picks the brand on the plain `/login` page.
2. **Course catalog** (tees + hole yardages used by contests): a re-runnable SQL file in
   `supabase/courses/<slug>.sql`, run once in the Supabase SQL editor after the migrations.
   `npm run test:db` applies every file there and checks the totals.

| Course | Slug | Catalog |
|---|---|---|
| GreenTee Country Club Westwood Plateau — Sky Course (Coquitlam, BC) | `westwood-plateau` | 5 tees (Gold 6,770 · Blue 6,355 · White 5,893 · Red 5,219 · Green 5,014 yds), from the club's official scorecard |

Use a club's logo and map only with the club's permission before showing it to anyone outside a sales demo.

## AI tooling (Claude Code)
Two MCP servers are recommended for UI work. Add them once at user scope so every project gets them:

```bash
claude mcp add --scope user shadcn-ui -- npx -y @jpisnice/shadcn-ui-mcp-server@3.0.0
claude mcp add --scope user --transport http 21st-magic https://21st.dev/api/mcp --header "x-api-key: $API_KEY_21ST"
```

- **shadcn-ui** — `@jpisnice/shadcn-ui-mcp-server` (MIT, pinned 3.0.0): reads shadcn/ui component source and docs from GitHub.
  Optional: export `GITHUB_PERSONAL_ACCESS_TOKEN` (no scopes needed) for higher GitHub rate limits.
- **21st-magic** — 21st.dev's hosted MCP (component search, logos, AI UI generation). Needs a free key from
  https://21st.dev/mcp exported as `API_KEY_21ST`; never commit the key. Prompts you send it go to 21st.dev.

Note: the app does not use Tailwind yet, and shadcn/21st components assume Tailwind. Adding Tailwind v4 is the
first step before installing any of their components.
