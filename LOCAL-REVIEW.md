# Golf Tournament Sponsors — local review handoff

## Status

The requested local implementation is combined on branch `murilo/golf-admin-upgrade` and ready for human review. This is **not a release-ready or deployed build**: authenticated service/browser/concurrency gates listed below remain open.

Product source reviewed and exercised: `a84679e19dd3c4ace68f853e4469d072892bdc6e`. This handoff and its copied evidence are a subsequent documentation-only commit. No push, Vercel deployment, hosted Supabase mutation, account change or production credential use occurred. The local push URL remains `disabled://review-required`.

## Implemented scope

- Course-local tee labels/colors and configured per-hole yardages; fixed contest presets; explicit hole/tee selection with derived distance and stable contest snapshots.
- Event creation/settings and contest Entries, archive/delete, open/close, branded print and sponsor-image controls.
- One shared event logo; one selected reusable, event-local sponsor canvas per contest; immutable upload/register/select lifecycle and retained historical media.
- Accessible five-second sponsor popup after image load, once per visit rather than each poll; token navigation resets visit state while legacy scoring/receipt behavior is preserved.
- Event settings and leaderboard navigation; explicit revocable staff grants, platform-only access/catalog/history controls, and no-grant/revoked states.
- Forward database migration, RLS/RPC enforcement, soft archival/audit history and existing golfer token/scoring/payload compatibility.

The UI deliberately refuses course changes while nonarchived contests exist instead of applying an incomplete remap. The backend supports a complete atomic placement remap; the current UI does not provide that advanced mapping workflow. Catalog archival no longer blocks unrelated title/date edits retaining an event's existing course.

## Verification actually run on the combined branch

Parent execution evidence is copied to `docs/local-review/merged-checks/`:

- **418 real PGlite checks:** 47 legacy, 316 upgrade/adversarial, 55 populated-legacy compatibility; zero failures.
- **78 UI tests in 12 files**, including 16 permission refresh/conflict tests; zero failures.
- ESLint, TypeScript checking and optimized Next production build: pass.
- **16 real production HTTP smoke checks:** signed-out redirects, public/static shells and delivered CSS; zero failures.
- The original **6 HTTP baseline checks** also pass, separately recorded. Their route coverage overlaps the 16 checks; neither suite proves authenticated workflows.
- A limited added-production-source pattern scan covered 35 files with no findings. This is not an exhaustive secret/security audit.
- Independent full backend/frontend reviews found one bounded defect each. Both were corrected with witnessed failing regressions before production changes. Final independent re-review passed for the corrected source and local merge; it separately reran all 16 access component tests.

The UI uses real components in JSDOM with mocked Supabase transport where documented. PGlite runs actual SQL/RLS but uses a simplified Storage metadata fixture. HTTP smoke checks use an actual local production Next server with fake loopback Supabase configuration and **no Supabase server**. No service responses or browser screenshots were fabricated.

## Reproduction on the existing VPS

The trusted runner remains outside this app checkout, under the project parent's `tooling/`. It mounts only the selected workspace and reviewed runtime files; project code never receives host credentials or host network by default.

Prefix each inner command below with:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/repo --timeout 600 --
```

Run serially:

```text
npm run test:db
npm run test:ui -- --maxWorkers=1
npm run lint
npm run typecheck
```

For the build, use this inner command so only the fake loopback configuration is present:

```sh
env NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=offline-fake-key npm run build
```

The app's committed `verification/review-acl-run-checks.mjs` reproduces the serial UI/lint/typecheck/build/16-check HTTP sequence and saves its real outputs. Run it through the same trusted prefix. `npm run test:smoke` runs the separate six-check HTTP baseline. The existing nonblocking Vite future config-loader warning remains; lint is clean.

## Unclosed full end-to-end and release gates

1. Provision a separately approved **disposable local** Supabase Auth/PostgREST/Storage stack, not the hosted project, and verify actual named RPCs, nested SELECTs, persisted writes and exact readbacks.
2. Exercise platform, granted staff, same-org ungranted owner/admin, revoked creator and no-grant identities through real authenticated routes/mutations, including revocation without logout.
3. Test actual Storage uploads/registration, wrong-event/kind/malformed/revoked requests, immutable-object denials and retained objects after errors. Public marketing image URLs can remain downloadable after revoke/archive by design.
4. Run real independent-session submission/archive/review and administrator-grant races. Sequential PGlite and source lock inspection do not prove scheduling; the UI is not compare-and-swap.
5. Exercise a real browser for mobile layout, keyboard/focus, actual RSC refresh/conflicts, post-load popup timing, images, print pagination and QR scanning/decoding, plus golfer retries/scoring against the real local backend.
6. Before any approved rollout: verify actual Troy/platform-admin identities and deployed policies/grants, backup/restore readiness, legacy access assignments/catalog conflicts, migration/application order and explicit publication approval. Do not rerun demo seed, infer creators, blanket-grant old staff or invent course distances.

Docker/Podman, PostgreSQL/psql, Supabase CLI and local Chromium were not available on PATH during this work. No system packages were installed. The local source archive is for review, not evidence that these gates passed.

## Evidence and history

- `backend-result.md`, `review-fix-result.md`: backend implementation and M1 correction.
- `frontend-result.md`, `frontend-review-fix-result.md`: frontend implementation and permission-refresh correction.
- `docs/local-review/`: original independent reviews, final bounded re-review, parent merged-check results and logs.
- `supabase/verification/` and `verification/`: preserved implementer RED/GREEN and final evidence.
- Source backend commits: `9800799...`, `3054e32...`, `7824a81...`; source frontend commits: `5d9987b...`, `ddb038f...`, `ce6f311...`. Their cherry-picked integration counterparts are recorded in the final review.
