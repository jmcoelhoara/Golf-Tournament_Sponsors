# Backend result — local verification only

Verified 2026-10-26 UTC on branch `murilo/backend`, exclusively in `/root/.hermes/projects/golf-tournament-sponsors/work-backend`.

## M1 independent-review correction — current result

- Fixed **M1 only**: `update_event` permits retaining its existing archived course for a metadata-only edit (`p_contest_placements IS NULL`). An actual course change or explicit placements still require an active course. Authorization, lifecycle checks, shared course locking and snapshot update rules are unchanged.
- Witnessed strict TDD: the new granted-staff-creator regression failed with `invalid_course` before the SQL edit (`supabase/verification/review-m1-red.log`, exit 1), then passed after the minimal predicate change (`review-m1-green.log`, exit 0; 301 upgrade checks).
- Added inverse lifecycle cases and reran **all 418 real PGlite checks**, zero failures: **47 legacy + 316 upgrade + 55 compatibility**. All prior 395 checks remain; 23 M1 checks were added. ESLint passed. Exact commands and evidence: `review-fix-result.md` and `supabase/verification/review-m1-*.log`.
- Metadata-only edits preserve the course-name snapshot and entire contest rows, including tee/yardage/scoring/token snapshots despite catalog renames/yardage edits. New events, actual changes to an archived target, explicit empty/complete placements, standalone placements and new contests still reject archived courses; leaving for an active course remains possible.
- This correction is a local-only follow-up to `3054e320e36fad79d89d6504df81f107a5c59f8c`. No nonblocking review findings, frontend, trusted tooling, release gates or Kanban state were changed. No Storage HTTP, independent-session concurrency or browser proof is claimed.

## Pre-review outcome and commits (historical evidence)

- **395 real PGlite checks passed, zero failures:** 47 legacy schema/scoring, 293 upgrade/authorization/media, 55 populated-legacy compatibility checks. Databases run sequentially, not concurrently.
- ESLint, TypeScript and the existing application production build passed. UI tests did **not** execute: the sandbox lacks `librt.so.1`, required by the installed Rolldown native addon. This is not an application assertion failure or proof of frontend correctness.
- Baseline/tooling commit: `1be624d3f515ada41ab86d4e570bee81301a26a9`.
- Backend implementation/evidence commit: `9800799dde5ebfc64da9bd3cf89239664c0d1b63` (`feat(db): add event-scoped golf catalog, media and archive workflows`). This report follows in a separate local documentation commit; obtain its ID with `git log -1 --format=%H -- backend-result.md`.
- No push, deployment, hosted SQL/API access, secrets, seed changes, dependency/lockfile changes, trusted-tooling changes, gateway restart or Kanban status changes occurred.

## Existing work preserved and completed

The interrupted worker's uncommitted forward migration, schema/upgrade/compatibility tests, backend workplan and original red/green evidence were inspected and preserved, not reset. Recovery baseline was already green: 47 legacy + 165 upgrade + 37 compatibility checks. Historical evidence remains under `supabase/verification/backend-01-*` through `backend-10-*`, plus baseline and compatibility logs; some early red logs reflect missing new interfaces before their implementation.

The migration implements course-local tees and observed yardages, the four exact seed-derived presets and immutable contest snapshots, explicit revocable event grants, platform-only catalog/access administration through existing `private.platform_admins`, atomic course reassignment, RPC-only event/contest/media mutations, immutable event-image selection/storage paths, soft archival with retained history, event-scoped audit and compatible public golfer/scoring functions. No same-org owner/admin or persistent creator bypass is retained. Legacy IDs, QR tokens (including nonhex development tokens), sponsor/strip fields, arbitrary legacy scoring, result units and successful retry receipts remain intact.

### Strict red → green correction made during recovery

A new adversarial SQL test proved that two distinct JSON strings representing the **same UUID** could bypass the complete-placement check. `update_event` counted raw JSON strings, allowing one contest to appear twice while another active contest retained a tee from the previous course.

1. Added a regression using both `contest_id` and `{contest_id}` PostgreSQL UUID spellings.
2. Ran the real upgrade suite **before** the SQL change. It failed at `UUID aliases cannot disguise duplicate contest placements`: actual error `undefined`, expected `placements_required` (exit 1). Exact output: `backend-11-uuid-placements-red.log`.
3. Changed duplicate detection to `count(distinct p.contest_id)` over a typed `jsonb_to_recordset(... as p(contest_id uuid))`.
4. Reran all suites successfully. Exact first green output: `backend-11-uuid-placements-green.log`.

Further tests cover the existing permission contract, rather than introduce untested production behavior: same-org owner/admin, other-org owner, revoked creator across private tables/print joins and mutation RPCs; nonempty permission fixtures; member/role escalation; granted manager roster/audit powers and revocation; active ACL with removed membership; library/logo/object retention after archiving every contest; numeric bounds/rounding, approval rejection/resubmission, null divisions, expiry, closed-event surfaces and retry receipts. The denial helper no longer treats arbitrary SQL errors (e.g. a misspelled column or missing RPC) as successful authorization enforcement.

## Exact execution commands and evidence

Every project-code command below used this exact offline trusted-runner prefix:

```sh
RUN='/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/work-backend --timeout 600 --'
```

No `--allow-network` invocation or install was needed. Commands run with workspace cwd mapped to `/workspace` inside isolation.

Recovery baseline (exit 0; 249 checks):

```sh
$RUN sh -c 'npm run test:db > supabase/verification/backend-resume-baseline.log 2>&1; rc=$?; tail -60 supabase/verification/backend-resume-baseline.log; exit "$rc"'
```

New failing regression (exit 1), followed by first all-suite green after the typed-UUID SQL fix (exit 0; 251 checks):

```sh
$RUN sh -c 'node supabase/tests/upgrade.test.mjs > supabase/verification/backend-11-uuid-placements-red.log 2>&1; rc=$?; tail -32 supabase/verification/backend-11-uuid-placements-red.log; exit "$rc"'
$RUN sh -c 'npm run test:db > supabase/verification/backend-11-uuid-placements-green.log 2>&1; rc=$?; tail -12 supabase/verification/backend-11-uuid-placements-green.log; exit "$rc"'
```

Expanded adversarial suite run (exit 0; before final compatibility additions and nonempty-fixture checks):

```sh
$RUN sh -c 'npm run test:db > supabase/verification/backend-resume-adversarial.log 2>&1; rc=$?; tail -45 supabase/verification/backend-resume-adversarial.log; exit "$rc"'
```

Final database and lint command after the final test edits (exit 0; **395 DB checks**):

```sh
$RUN sh -c 'npm run test:db > supabase/verification/backend-final-db.log 2>&1; rc=$?; tail -10 supabase/verification/backend-final-db.log; if [ "$rc" -ne 0 ]; then exit "$rc"; fi; npm run lint > supabase/verification/backend-final-lint.log 2>&1; rc=$?; tail -10 supabase/verification/backend-final-lint.log; exit "$rc"'
```

Application checks, run serially (the loop exits 1 because `test:ui` could not start; lint/typecheck/build each exit 0):

```sh
$RUN sh -c 'failed=0; for task in lint typecheck test:ui build; do label=$(printf "%s" "$task" | tr : -); npm run "$task" > "supabase/verification/backend-final-$label.log" 2>&1; rc=$?; printf "\n%s exit=%s\n" "$task" "$rc"; tail -30 "supabase/verification/backend-final-$label.log"; if [ "$rc" -ne 0 ]; then failed=1; fi; done; exit "$failed"'
```

Native-binding diagnosis (exit 1, `ERR_DLOPEN_FAILED: librt.so.1: cannot open shared object file`):

```sh
$RUN sh -c 'node --input-type=module -e '\''try { await import("@rolldown/binding-linux-x64-gnu"); console.log("native binding imported"); } catch (error) { console.dir(error,{depth:null}); process.exitCode=1; }'\'' > supabase/verification/backend-ui-binding-diagnostic.log 2>&1; rc=$?; tail -35 supabase/verification/backend-ui-binding-diagnostic.log; exit "$rc"'
```

The native addon is installed. Its wrapper's generic "Cannot find native binding" / missing WASM fallback message is misleading; reinstalling dependencies was not attempted and is not established as necessary.

Host-side git/inspection only: scoped `git diff --cached --check -- supabase/README.md supabase/backend-workplan.md supabase/migrations supabase/tests` passed; static credential/shell/eval/pickle scans of the complete changed SQL/JS files found no matches. A full whitespace check flags raw diagnostic-log spacing and carriage-return progress lines, deliberately preserved as evidence rather than edited. No independent code-review approval is claimed. Commit hooks/signing were disabled to avoid executing repository hooks or accessing signing credentials on the host:

```sh
git -c core.hooksPath=/dev/null -c commit.gpgsign=false commit -m "feat(db): add event-scoped golf catalog, media and archive workflows"
```

## Files delivered

- `supabase/migrations/20261025000000_event_catalog_access_media.sql` — recovered/finished forward migration with typed-UUID atomic-placement correction.
- `supabase/tests/schema.test.mjs` — existing regressions use explicit grants, retain legacy strip history and run all three suites serially.
- `supabase/tests/upgrade.test.mjs` — real role/RLS/SQL Storage metadata tests plus the new regression and adversarial coverage.
- `supabase/tests/compatibility.test.mjs` — populated legacy migration/scoring/payload/units/receipts/boundary coverage.
- `supabase/README.md`, `supabase/backend-workplan.md` — current RPC, media, local execution and release guidance.
- `supabase/verification/backend-*.log` — original evidence and actual recovery/red/green/final outputs.
- `backend-result.md` — this report.

## Limitations and remaining work — parent/release gates

1. **Independent verification remains with the parent.** This result does not mark any task/Kanban card complete and is not an integration/deployment approval.
2. **Storage fixture is not real Supabase Storage HTTP integration.** It exercises actual SQL policies, bucket configuration and metadata registration against PGlite tables, not object bytes, MIME sniffing or service-managed permissions. Before release, verify allowed event uploads and denied revoked/cross-event/malformed uploads, overwrite/move/delete denials, actual registration and public delivery in an approved disposable local Supabase environment.
3. **No true multi-session race execution.** SQL lock ordering and both lifecycle states are checked, but PGlite serializes one session. Verify concurrent submission/archive/review/revocation scenarios with independent PostgreSQL sessions before release. Do not represent the SQL-definition inspection as concurrency proof.
4. **UI checks are blocked and the upgraded frontend is separate.** The existing frontend build succeeds, but its old direct mutations intentionally fail against the new RPC-only contract. Parent must integrate the frontend branch and verify settings/access/leaderboards, draft print sheets with preserved QR routes, shared logos and the once-per-visit five-second accessible sponsor popup. Resolving `librt.so.1` exposure belongs to reviewed trusted-tooling changes, not a backend dependency change.
5. **Public marketing media is not revocable/private.** Archive/revocation hides private event metadata and prevents future uploads/mutations; known public bucket URLs remain publicly deliverable. Upload registration is not atomic with object upload; retain failed-registration orphans for trusted later review.
6. **Legacy catalog/access rollout needs review.** Conflicting/incomplete observed tee yardages remain unmapped; no full course is fabricated. Historical creators/grants are not invented, legacy archive time is inferred and old nonplatform staff require explicitly approved grants. Confirm Troy's real `private.platform_admins` row and inventory deployed extra policies before any approved rollout.

No remaining backend PGlite failure is known. No hosted or browser-integration success is claimed.
