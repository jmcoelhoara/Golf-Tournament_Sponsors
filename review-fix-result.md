# Review fix result — M1 only

Local branch `murilo/backend`, based on `3054e320e36fad79d89d6504df81f107a5c59f8c`. Existing work and historical verification logs are preserved.

## Result

`update_event` now allows the same existing archived course **only with no placement request (SQL NULL)**. It retains the organization check and shared catalog lock. Authorization/event lifecycle checks and snapshot update rules are unchanged; no other production behavior was changed.

Witnessed strict TDD: the granted ordinary-staff creator regression failed **before** changing SQL: expected `{ok:true,event_id:...}`, actual `{ok:false,error:'invalid_course'}` (`review-m1-red.log:164–179`, exit 1). The same regression passed after the minimal course-lookup predicate edit (`review-m1-green.log:155–162`, exit 0; 301 upgrade checks). Inverse guard coverage was then added without further production changes.

**Final: 418 real PGlite checks passed, zero failures: 47 legacy + 316 upgrade + 55 compatibility.** All prior 395 checks remain; 23 M1 checks were added. ESLint passed. The full database runner imports all three suites sequentially.

The regression uses authenticated platform catalog DML to archive only the course (tee remains active), rename course/tee and alter yardages, then an explicitly granted staff creator updates event title/date. Assertions preserve the course-name snapshot and entire contest rows, including tee/yardage/scoring/QR tokens. Inverse cases reject archived courses for new events, actual course changes with/without complete placements, explicit empty/complete same-course placements, standalone placements and new contests; rejected requests preserve entire event/contest rows. Leaving the archived course for an active course still succeeds, refreshes placement snapshots and retains scoring/tokens.

## Exact command evidence

All executable project commands ran offline with this prefix; no tooling changes, installs, credentials or network permission were used:

```sh
RUN='/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/work-backend --timeout 600 --'
```

RED (exit 1; expected assertion, not a setup error):

```sh
$RUN sh -c 'node supabase/tests/upgrade.test.mjs > supabase/verification/review-m1-red.log 2>&1; rc=$?; printf "\ncommand_exit=%s\n" "$rc" >> supabase/verification/review-m1-red.log; exit "$rc"'
```

First GREEN, before inverse additions (exit 0):

```sh
$RUN sh -c 'node supabase/tests/upgrade.test.mjs > supabase/verification/review-m1-green.log 2>&1; rc=$?; printf "\ncommand_exit=%s\n" "$rc" >> supabase/verification/review-m1-green.log; exit "$rc"'
```

Final all-suite run and lint (each exit 0):

```sh
$RUN sh -c 'npm run test:db > supabase/verification/review-m1-all-db.log 2>&1; rc=$?; printf "\ncommand_exit=%s\n" "$rc" >> supabase/verification/review-m1-all-db.log; exit "$rc"'
$RUN sh -c 'npm run lint > supabase/verification/review-m1-lint.log 2>&1; rc=$?; printf "\ncommand_exit=%s\n" "$rc" >> supabase/verification/review-m1-lint.log; exit "$rc"'
```

Final DB evidence: legacy summary at line 68; M1 assertions at 223–245; upgrade summary at 385; compatibility summary at 441; exit 0 at 443. A separate sandboxed Node assertion parsed those summaries, verified zero legacy failures and exit 0, and computed `{legacy:47,upgrade:316,compatibility:55,total:418,addedUpgradeChecks:23,m1Checks:23,exit:0}`.

Host Git only, with repository hooks/signing disabled:

```sh
git -c core.hooksPath=/dev/null -c commit.gpgsign=false diff --cached --check
git -c core.hooksPath=/dev/null -c commit.gpgsign=false commit -m "fix(db): retain archived course for metadata-only event edits"
```

## Scope and limitations

Changed only the M1 SQL predicate, related upgrade tests, `backend-result.md`, this report and four `supabase/verification/review-m1-*.log` files. No nonblocking review findings were addressed. No push, deployment, hosted migration, profile/system/gateway change or Kanban update. No Storage HTTP, true multi-session concurrency or browser verification is claimed; existing release/integration gates remain open. No unexpected blocker occurred.
