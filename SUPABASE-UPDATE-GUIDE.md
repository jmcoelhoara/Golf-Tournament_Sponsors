# Golf upgrade: GitHub publication and Supabase update guide

Status: local implementation and review package, NOT approved for production release. No hosted database inspection, migration, production account change, GitHub push or deployment has been performed as part of preparing this guide.

Start here, then use `LOCAL-REVIEW.md` for the full evidence and remaining test gates. This guide adds read-only SQL checks; their offline fixture test is not a real Supabase deployment test.

## 1. Publish for review, not directly to the live branch

Repository: `jmcoelhoara/Golf-Tournament_Sponsors`.
Review branch: `murilo/golf-admin-upgrade`.
The remote `main` matched the local starting commit `2952db1c91cc700ea06ea7fd6e7159fd42632333` when this guide was prepared. Check it again before publishing or merging.

Publish a feature branch and open a DRAFT pull request into `main`. Include the implementation, migration, this guide and `LOCAL-REVIEW.md`. Do not merge until the gates below are satisfied. The repository README says pushes to `main` deploy via Vercel; actual deployment settings still need verification. Check whether feature-branch pushes also generate preview deployments, and ensure any preview uses a separate test backend, not production. A draft PR does not disable preview builds.

The VPS currently has no configured GitHub write credentials. Its existing `origin` push URL is deliberately `disabled://review-required`. Preparing this guide does not change that protection.

For assisted publication, authorize access only to this repository, with Contents read/write and Pull requests read/write, through a secure credential-entry mechanism. Do not paste tokens into chat or embed them in remote URLs. A repository write token is not branch-only access; repository rules/actor permissions must enforce any required isolation. No workflow or administration permission is needed for this change set.

Alternative: an already-authenticated human can publish from the existing VPS checkout, after reviewing the code and preview-deployment implications:

```sh
cd /root/.hermes/projects/golf-tournament-sponsors/repo
git status --short
git push https://github.com/jmcoelhoara/Golf-Tournament_Sponsors.git HEAD:refs/heads/murilo/golf-admin-upgrade
```

That command uses the explicit GitHub destination without changing the disabled `origin` push URL; it does not merge or change `main`. Do not try to replace `pushurl` with a `git -c` override: it is multi-valued and would retain the disabled destination too. Then open a draft PR in GitHub with base `main` and compare `murilo/golf-admin-upgrade`. If the branch already exists and has different work, stop; do not force-push.

A complete Git bundle can instead be transferred to a machine where you already have GitHub access. Clone the bundle, keep the imported review branch, add the token-free GitHub remote, then push that branch and create the draft PR. Never publish production outputs, credentials or database backups in the repository.

## 2. What changes in Supabase

The new forward migration is:

`supabase/migrations/20261025000000_event_catalog_access_media.sql`

It adds course catalogs, tee labels/colors, per-hole yardages, fixed contest presets, explicit event staff grants, shared event logos, one sponsor-banner selection per contest, audit/archive support, and replacement authorization/RPC rules. It preserves existing contest tokens and scoring behavior under the compatibility tests.

It also creates/configures `event-media` as a PUBLIC bucket with a 10 MiB limit and PNG/JPEG/WebP allowed. This is marketing artwork only, not confidential files. Anyone with a public object URL can retrieve that image even after staff access is revoked. Staff uploads use immutable new object paths; do not add permissive overwrite/delete policies to make an error disappear.

Earlier migrations remain unchanged:

1. `20261014000000_initial_schema.sql`
2. `20261015000000_foreign_key_indexes.sql`
3. `20261015010000_event_sponsor_strip.sql`

For an existing database that already matches these three migrations, only the new fourth migration should be pending. Never rerun the initial schema or `supabase/seed.sql` on that database. The upgrade is not idempotent: do not apply it twice.

## 3. Stop conditions before any production update

First use a disposable local Supabase stack or a separately approved test project, with a separate app preview. Do not point the test preview at production. If using a copy of existing data, handle Auth identities, personal data and Storage objects privately and deliberately.

Before production, all of these must be complete:

- Verify the target Supabase project reference and actual deployed schema/history.
- Confirm a restorable database backup and a separate backup of Storage file bytes. Database backups include Storage metadata, not the stored image files.
- Run the migration and real authenticated Auth/PostgREST/Storage tests in the test environment. Existing PGlite/JSDOM tests do not prove those services work.
- Finish browser/mobile, real QR scanning, printing, image timing, and independent-session concurrency testing.
- Verify Troy's actual Auth user UUID is trusted in `private.platform_admins`; inspect all other trusted identities. Do not infer this from his email, organization-owner role or first login. If no valid platform admin exists, stop for a separately approved bootstrap rather than inventing an identity.
- Prepare an approved list mapping staff UUIDs to specific existing events. Membership alone will no longer expose old events, and the migration deliberately creates no blanket legacy staff grants.
- Review every deployed public/private/Storage policy, table/schema privilege, trigger, function owner/definition and execute grant, including custom ones not in Git. The migration replaces policies on several existing app tables and changes legacy sponsor permissions; do not assume unknown customizations remain intact. It also revokes client execution on ALL functions in `private` before restoring its explicit allowlist, so custom helper functions need review. Unrelated broad Storage policies may still bypass restrictions.
- Confirm the migration operator owns or has sufficient privileges over the affected public/private objects and Storage policies. Project deployment rights and application platform-admin rights are separate.
- Inspect custom audit records whose JSON `event_id` fields are malformed: the backfill casts them to UUID and will fail on invalid values. Resolve discrepancies through an approved data-correction plan, not by deleting audit history.
- Arrange a quiet maintenance window and rollback/restore plan. The old admin app's direct event/contest writes are intentionally blocked after this migration, so database and app changes must be coordinated.

Until these are verified, this is a review/staging procedure, not a command to change production now.

## 4. Read-only target inventory

On the selected project, open Supabase SQL Editor as the project administrator and run the WHOLE file:

`supabase/checks/upgrade-preflight.sql`

It only reads and ends with `ROLLBACK`. Save results privately, not in GitHub: they contain account IDs/emails, policies and deployment details. Confirm the SQL Editor project matches the CLI target before proceeding.

Review the row counts, platform identities, organization memberships, existing events, all RLS policies, table grants, function security/execute grants and Realtime publication. `storage.objects` and `storage.buckets` must exist. If `public.event_staff_access` already exists, stop to determine whether the upgrade was already applied or partially/custom applied.

If `supabase_migrations.schema_migrations` exists, inspect its version rows privately, or use `supabase migration list` below. If old migrations were previously pasted into SQL Editor and history is missing, DO NOT let a push recreate them. Compare the actual schema first, then reconcile history under a separately reviewed plan. `migration repair` changes history only; it does not apply SQL. Do not mark a migration applied just to silence an error.

## 5. Preferred application route: tracked CLI migrations

Run on your trusted development machine with the Supabase CLI installed, inside a checkout of the review branch. Credentials belong in the CLI's protected login/prompt flow, never in a commit, chat message or database URL pasted into shell history.

If this checkout has no `supabase/config.toml`, initialize the local CLI configuration with `supabase init` first and review the generated config; do not overwrite an existing project config. This repository's original tracked files do not include that config.

For the TEST project first:

```sh
supabase login
supabase link --project-ref YOUR_TEST_PROJECT_REF
supabase migration list
supabase db push --dry-run
```

Replace `YOUR_TEST_PROJECT_REF` with your actual test project reference. Read prompts and confirm the project. A dry run lists pending migrations; it does not prove their SQL will succeed or that the application works.

For a populated baseline project, stop if anything except `20261025000000_event_catalog_access_media.sql` is pending. For a genuinely empty disposable test project, applying all four migrations in timestamp order is expected; provision test identities/memberships/catalog data deliberately afterward. Do not use production credentials in a disposable stack.

Only after the target, inventory, backups and expected pending list are approved:

```sh
supabase db push
supabase migration list
```

One coordinator runs the migration once. Do not use `--include-seed`, `--include-all`, remote resets or history-repair commands to work around an unexplained mismatch. Do not run `supabase db reset --linked` or point reset at a hosted database.

The SQL file has a `BEGIN`/`COMMIT` transaction. If an error is reported, inspect actual schema/history before retrying; do not manually execute only the remaining lines. If CLI tools are unavailable and you want SQL Editor deployment instead, arrange a reviewed manual-application/history-reconciliation plan first, rather than mixing the two workflows ad hoc.

Repeat the target/inventory/dry-run process for production only AFTER test acceptance, human release approval, backup verification and a coordinated maintenance window. Recheck the project reference when switching; never assume the previously linked target is the right one.

## 6. Immediately after a successful migration

Run the WHOLE read-only file in the SQL Editor for that exact target:

`supabase/checks/upgrade-postcheck.sql`

It raises an error if expected upgrade tables/RLS, RPC execute grants, protected-table mutation restrictions, default presets, bucket settings or required named Storage policies are missing. It also lists events/grants, unresolved legacy contest mappings and ALL Storage policies for review. A structural pass does not certify custom policy safety, correct identities, real uploads, concurrency or application behavior.

Compare event/contest/golfer/entry counts with your preflight snapshot during the quiet window; explain any difference. The intended upgrade retains historical rows and existing QR tokens. Review any unresolved legacy course/tee/preset mapping instead of guessing distances or changing scoring to make a row fit.

After switching the matching app build to the upgraded TEST backend:

1. Sign in as the verified platform administrator. Confirm event history/access and course catalogs are available.
2. Use `/admin/access` to grant only approved events to existing staff organization members. Read back each grant and log in as that staff account to verify it. SQL Editor's administrative session is not a substitute for a staff login.
3. Use `/admin/courses` to verify course names, tees/colors and real per-hole yardages. Supply missing information from club-approved data. Legacy snapshots remain; missing normalized placements are not evidence that the old distance was zero.
4. Create a draft event and preset contest. Confirm selected hole/tee fills the correct yardage; test changing event title/date. The current UI refuses changing a course while nonarchived contests exist, rather than silently remapping them.
5. Upload a PNG/JPEG/WebP logo and banner through the app. Check successful registration/selection, image loading, reuse within the event and rejection across events. Confirm wrong-path, revoked-user, overwrite and delete attempts fail through real Storage HTTP.
6. Revoke a staff event grant while that user remains logged in; verify the event and writes become inaccessible. Confirm a user with no grants can still log in and sees an empty state. Ordinary staff must not gain the permissions editor.
7. Test real player submissions/retries, leaderboard updates, archive behavior, branded print/PDF pagination, QR decoding and five-second once-per-visit sponsor timing. Test concurrent grant/archive/submission operations in separate authenticated sessions.

App configuration remains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the intended backend. Keep preview and production values distinct. Never place a service-role/secret key in a `NEXT_PUBLIC_` variable. Check Supabase Auth URL/redirect configuration for any preview flow you actually use; this work does not change project Auth settings automatically.

Only after the test checklist passes, repeat the approved migration/access verification for production, promote the matching application build, and verify the same flows on production before ending maintenance. Do not merge simply because the offline tests passed.

## 7. Recovery

There is no automatic down migration. Before the transaction commits, a failed transaction should leave no partial upgrade; inspect and verify rather than assume. After it commits, reverting only the app code will not restore old direct-write permissions. Freeze affected activity and choose an approved forward fix or a tested database-and-app restore. Restoring a database can discard post-backup writes; Storage file bytes need their own recovery plan. Keep historical tokens/images and audit evidence intact.

## Verification of this guide's SQL

Offline reproduction using the existing trusted VPS sandbox:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/repo --timeout 120 -- node scripts/verify-rollout-sql.mjs
```

The disposable PGlite fixture executes preflight against the baseline, applies the migration, executes postcheck, and verifies postcheck rejects an injected direct-write privilege. It contacts no hosted service. Successful offline execution does not close the real-service release gates.

## Official references checked when preparing the guide

- Supabase Docs: Database Migrations; CLI Reference (`db push`, `migration list`, `migration repair`).
- Supabase Docs: Database Backups (Storage file bytes are excluded).
- Supabase Docs: Storage Buckets / Public buckets (public retrieval versus controlled mutations).

Repository source and `LOCAL-REVIEW.md` define the app-specific contract and its remaining limitations.
