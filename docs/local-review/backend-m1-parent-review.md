# Parent re-review: backend M1 correction

## Decision

The single blocking finding in `backend-independent-review.md` is resolved for the local implementation. This is not deployment approval or actual Supabase/Storage/browser/concurrency integration evidence.

## Reviewed change

Source backend commit: `7824a8103cdd8334512245d0c8e04e134a1e69be`.
Integrated local commit: `c34a6ed`, after `0cce7b0` and `590cf8f` on `murilo/golf-admin-upgrade`.

The parent inspected the actual SQL/test diff, not only the implementer's report. The active-course lookup retains its organization match and shared row lock, and now permits an archived course only when its UUID equals the existing event's course and `p_contest_placements IS NULL`. Event authorization, lifecycle checking and subsequent course/placement snapshot update logic are unchanged. Consequently the exception does not admit a new event, different archived target, explicit new placement request, or organization change.

The additional regression uses a granted ordinary-staff creator and platform catalog archival. It proves same-course title/date editing without refreshing event-course or complete contest snapshots; inverse cases deny archived targets and explicit placements, preserve denied-operation rows, and permit moving away to an active course. Historical RED and GREEN evidence is retained in `supabase/verification/review-m1-*.log`.

## Independent execution

The parent cherry-picked the three backend commits locally into the integration repository, then executed:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/repo --timeout 600 -- npm run test:db
```

Exit 0. Parsed actual summaries: 47 legacy checks, 316 upgrade checks, 55 compatibility checks; total 418. The integrated migration was byte-compared to the reviewed backend fix and matched exactly.

Evidence: `parent-integrated-20261026/backend-db.log` and `parent-integrated-20261026/backend-db-results.json`.

## Scope

The original independent review's Storage HTTP, real concurrent sessions, real browser/authenticated integration, actual deployed-policy/Troy identity inventory and publication-approval gates remain open. Local backend task completion does not close those gates. No pushes, deployment or hosted mutations occurred.
