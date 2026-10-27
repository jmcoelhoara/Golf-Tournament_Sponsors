# Independent backend review

**Verdict: request changes for M1 before calling the backend contract-complete or merging it as complete.** No high-severity local security defect was substantiated. One medium-severity settings defect was reproduced independently. Actual Storage HTTP, multi-session concurrency and frontend acceptance remain separate release/integration gates, not demonstrated implementation failures.

## Scope and evidence

Reviewed the entire `WORKPLAN.md`, `requirements-original.txt`, `contract-review.md` (including sections 3–8), and `work-backend/backend-result.md`. Reviewed the actual complete forward migration, all three database test files, the earlier migrations, and backend interface/release documentation. The implementer's report was context, not review proof.

Commit scope:

- Baseline: `1be624d3f515ada41ab86d4e570bee81301a26a9`.
- Implementation: `9800799dde5ebfc64da9bd3cf89239664c0d1b63`.
- Checkout HEAD: `3054e320e36fad79d89d6504df81f107a5c59f8c`, the subsequent report commit on `murilo/backend`.
- Independently decoded the repository's commit/tree/blob objects inside the sandbox and verified the working migration and three test files match the implementation commit. All earlier migrations match the baseline unchanged. The changes to old schema tests replace organization-wide strip mutation/destructive deletion expectations with platform mutation/retention expectations, and add explicit grants and sequential upgrade/compatibility execution; the scoring assertions were not removed.

Database evidence: the parent's independently rerun `verification/parent-recovery-20261026/backend-db.log` records **47 legacy checks / zero failures** at line 68, **293 upgrade checks** at line 362 and **55 compatibility checks** at line 418. This review inspected that evidence rather than redundantly running the full suite. It additionally executed a new isolated, in-memory PGlite reproduction of M1; the actual result appears below. Existing green suites do not cover that case.

All executable project inspection and the reproduction used:

```text
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/work-backend --timeout 600 -- <command>
```

No network access, backend edits, backend test edits, Kanban changes, pushes, deployment, credentials or system/gateway changes. Only this review document was created. A normal `git diff` invocation was unavailable inside the sandbox (`execvp git: No such file or directory`); read-only Git object decoding with the existing Node runtime provided the commit comparison without changing tooling.

## M1 — Medium, local implementation defect: catalog archival freezes unrelated event settings

**Source:** `work-backend/supabase/migrations/20261025000000_event_catalog_access_media.sql:277–286`, especially the unconditional `archived_at is null` course lookup at **285–286**. The same-course/no-placement-change path is distinguished only later, at **288**, after the premature rejection.

**Contract:** `requirements-original.txt:45–50` permits staff to edit event title/date/course. `contract-review.md:77–80` rejects archived catalog choices for **new placements**, preserves existing snapshots/references, and requires complete replacement placements when the event course actually changes. Archiving a course is not the same operation as archiving an event; the nonarchived event remains editable under `can_edit_event` (`migration:37–39`).

**Failure:** after a platform administrator archives a course catalog row, an otherwise authorized caller cannot change only the name/date of an existing nonarchived event referencing that course. `update_event` returns `invalid_course` even when `p_course_id` is unchanged and `p_contest_placements` is NULL. Other settings RPCs still work. This unnecessarily requires an operator to reactivate the catalog course or change the event's actual course and placements merely to edit its title/date.

**Independent execution:** created a real authenticated platform identity, organization, active course/tee/yardage, a draft event and a preset contest in an in-memory PGlite database with all actual migrations. The same-course title/date update succeeded before catalog archival; only the course's `archived_at` was then changed. The repeat title/date update failed. Actual relevant output:

```json
{
  "contestAdded": true,
  "beforeCatalogArchive": {"ok": true, "event_id": "7807f28d-d7cb-4e79-b151-9c1be6176e0e"},
  "afterCatalogArchive": {"ok": false, "error": "invalid_course"},
  "eventState": {
    "name": "Before archive",
    "event_date": "2026-11-02T00:00:00.000Z",
    "status": "draft",
    "archived_at": null
  },
  "otherSettingStillEditable": {"ok": true, "event_id": "7807f28d-d7cb-4e79-b151-9c1be6176e0e"}
}
```

This used an authenticated platform caller, not owner-bypassing SQL for the event RPC. The rejection occurs in the shared authorized update path, so the same failure applies to an explicitly granted ordinary staff caller. It is not a claim that authorization failed or data was lost.

**Required correction:** permit retaining the existing archived course reference for metadata-only event edits. Continue rejecting archived courses for new events, actual course changes and explicit new placements; preserve course-name and contest-placement snapshots on metadata-only updates. Add a regression with a granted staff creator: archive only its course through platform catalog DML, then update title/date with the same course/no placements and assert success with unchanged placement/scoring/token snapshots. Include the inverse cases (archived target for a new event/course change still rejected).

**Why green tests missed it:** `supabase/tests/upgrade.test.mjs:242–246` covers archived tees being unavailable for new placements and archived courses being unavailable for new events, but never attempts a same-course title/date edit after catalog archival. This is locally reproducible, not a release-environment gate.

## Security and correctness review results

References below are relative to `work-backend/`; `migration` means `supabase/migrations/20261025000000_event_catalog_access_media.sql`.

| Area | Review result and concrete evidence |
|---|---|
| Same-org owner/admin and creator revocation | `migration:30–39` requires current membership plus an unrevoked explicit grant, except existing platform admins. No owner/admin or `created_by` fallback. `create_event:176–185` grants once; `set_event_staff_access:187–198` is platform-only and event-locked. Upgrade tests `45–75,253–293` use same-org owner/admin, other-org owner, revoked creator and removed membership, with nonempty positive read fixtures. |
| Broad RLS OR paths | `migration:49–55` drops every existing policy on the enumerated event/private-data/legacy-sponsor/member tables before replacement. `57–84` replaces reads and roster authority. Authenticated leaders are grant-based; the public leader policy at `73` is **anon only**. Organizations retain their old member-read/platform-write semantics. Storage extra-policy limitations are separate below. |
| Direct DML and old definer bypasses | Event/contest DML privileges are revoked at `56`; ACL/images are SELECT-only at `26–28,402–405`; entries/leaders/audit mutations and TRUNCATE are revoked at `573–574`; relevant parent/roster hard deletes are revoked at `67`. Existing check-in/review/correction/token definers are replaced at `334–382`, not left with organization-only checks. No alternative old public mutation RPC was found in the complete migration inventory. |
| EXECUTE, dynamic SQL, search path | New public mutation/context functions explicitly revoke default PUBLIC/anon EXECUTE before authenticated grants; replaced old public functions retain their initial explicit ACLs (`initial_schema.sql:783–804`). Final `migration:575–577` revokes all private helper execution, then grants only policy helpers; mutation/lock/leader helpers remain unavailable. Upgrade tests `234–235` inspect actual function privileges, including the full anon-callable public list. Definers pin `search_path=''`; application relations are schema-qualified. Dynamic policy/trigger DDL uses fixed table/policy inputs with identifier quoting, not caller SQL. |
| Legacy sponsor/storage permissions | Sponsor reads are restricted to platform or links in accessible events (`74`); legacy sponsor management is platform-only (`75–79`), event strips also require a nonarchived event. Four known legacy Storage policies are removed, replaced by platform-only SELECT/immutable INSERT; no legacy UPDATE/DELETE policy remains (`423–430`). Old rows, URLs, sponsor fields and strip fields remain. |
| Image paths, purpose, size and immutability | Exact full-path UUID/extension parser with safe failure (`408–416`); event/org/ACL path checks for upload/listing (`429–430`); registration reads existing `storage.objects` metadata and validates purpose, extension/MIME and size 1–10 MiB (`433–450`). Metadata is RPC-insert-only; object UPDATE/DELETE policies are absent. Composite event-image FKs plus purpose trigger (`383–401,452–462`) and selection RPC checks prevent cross-event/kind selection. Upgrade tests `129–185` exercise actual fixture SQL. This is **not** object-byte or HTTP-service proof. |
| Catalog/placement consistency | Event course/org composite FK, tee/hole FK, active same-course resolution with shared locks, immutable catalog ownership/keys and snapshot copying (`131–158,223–251`). Complete course changes validate every typed placement before writes, count **distinct UUID values**, lock contests in ID order and preserve archived contest placements (`277–312`). Upgrade tests `95–107` include the brace-form UUID alias regression; this is a real typed-identity check, not raw JSON-string distinctness. M1 is the remaining lifecycle edge. |
| Snapshots versus catalog edits | Existing contest scalar/scoring snapshots are retained; preset adoption requires a complete definition match (`148`). Platform catalog edits cannot rewrite snapshots implicitly. Explicit placement changes copy current label/yardage. Upgrade tests `83–93,238–244` cover yardage/preset changes and protected references. Existing course-name snapshots are preserved on same-course metadata edits (`308`). |
| Archive and retries | Event archive does not archive every child; ordered locks and idempotent archive paths retain rows/tokens/images (`513–532`). Public details/roster/leaders gain archive guards (`494–511,535–543`). Submission locks event then contest, re-reads state, performs receipt lookup **before** lifecycle rejection and returns `leader:null` for archived material (`545–571`). Upgrade tests `196–232,294–302` verify retention, no fresh archived submissions and retry receipts without leader disclosure. Source lock ordering is sound on these RPC paths; concurrent scheduling is not proven. |
| Roster/check-in/review/correction | Teams/golfers preserve manager-only direct INSERT/UPDATE **plus** event access/nonarchive (`60–67`), rather than broadening ordinary staff roster power. Check-in/review use event access and lifecycle locks; correction/token rotation also retain manager/platform power (`334–382`). Legacy suite `116–142` tests granted owner correction and staff review/check-in; upgrade tests `117–128,278–291` cover grants, revocation and manager roster/audit powers. |
| Audit filtering and retention | Event IDs are backfilled and indexed (`81–84,578–579`); audit trigger derives event and catalog parent organization IDs (`258–275`), including image/grant mutations. Platform can see all history, including event-null rows. Managers need explicit event access for scoped history; ordinary staff cannot read audit. Upgrade tests `232,282–287` and compatibility test `53` cover this separation. |
| Legacy golfer/scoring/QR compatibility | The existing three public signatures/named parameters remain, as do nonhex legacy tokens, scalar fields, inches/marker-claim rules, numeric rounding, divisions, retry IDs and the latest sponsor-strip payload. Only branding/distance fields are added. Compatibility tests `18–36` compare old/new populated payloads and contest snapshots; `37–92` preserve arbitrary legacy scoring, approvals, tie behavior, bounds, expiry and closed-state behavior. The frontend `/c/<token>` implementation was not changed by this backend commit. |

## Test gaps and release/integration gates — not additional proven code defects

1. **High-priority release gate: actual Storage service behavior.** The fixture at `supabase/tests/upgrade.test.mjs:13–19` deliberately creates simplified metadata/bucket tables, not Supabase Storage HTTP or stored bytes. Its `upload` at `132` inserts metadata directly; invalid MIME/size inserts at `176–178` intentionally bypass a real bucket service so the registration RPC can reject them. Before release, obtain evidence in an approved disposable **local** Supabase environment for allowed event upload/registration, revoked/other-event/malformed upload denial, listing scope, overwrite/move/upsert/delete denial (including platform clients), and public delivery behavior. Do not count PGlite checks as this evidence. Public known asset URLs remaining available after revocation/archive is the agreed design, not an RLS defect.
2. **High-priority release gate: true independent-session scheduling.** The test at `upgrade.test.mjs:303–307` checks function-definition substring order, not a race. The SQL review supports the event→contest order for submission/settings/archive/review/correction/grant RPCs, but no independent-session run demonstrates waiting/rechecking/commit order. Exercise both orderings of submission versus event/contest archive, review/correction versus archive, and a new request after committed revocation. Also include manager direct roster DML and Storage upload versus event archival: those paths use RLS rather than the parent-lock helper, so their lifecycle boundary deserves explicit concurrent evidence. Do not describe these as observed races or failures; this review has no such execution evidence.
3. **Integration gate: upgraded frontend and full user requirements.** Backend SQL joins are not print/browser tests (`upgrade.test.mjs:168,257`). Verify the separate RPC-based frontend for Event settings/Leaderboard/access menus, same-session revocation, draft printable sheets with all five required elements and scannable unchanged QR URLs, shared event logos, event-local banner reuse and once-per-visit five-second accessible popup/error handling. The old direct-DML frontend is intentionally incompatible with the new mutation privileges. Successful backend-checkout build/typecheck is not upgraded-frontend acceptance. The child report's UI native-library startup issue is historical evidence, not an assertion here that current parent tooling still has that problem.
4. **Authorized rollout gate: inventory and retained legacy data.** The repository cannot establish Troy's actual trusted identity, other existing platform-admin rows, extra deployed Storage/public policies or grants, approved historical access assignments, catalog conflicts/incompleteness or restore readiness. Those must be satisfied by the approved release inventory/procedure; no hosted lookup is requested or performed in this review. No blanket staff grants, inferred creators, fabricated full course distances or demo-seed reruns are acceptable. Public-table policy replacement is comprehensive for the enumerated tables, while Storage replacement intentionally removes the four known names only.
5. **Additional local regression coverage, nonblocking independently of M1.** Add positive granted-manager token rotation and denial after revocation; a repeated malformed placement test is not a substitute for that positive authority path. Exercise immutable course ownership/yardage keys on **unreferenced** catalog rows as well: the general `denied` helper accepts FK/check failures (`upgrade.test.mjs:37–43`), so referenced-row failures alone may not prove that the explicit identity guard works. Static inspection found the guard present; these are test-hardening opportunities, not observed authorization bugs.

## Merge recommendation

**Request changes for the bounded M1 correction and its real SQL regression, then rerun all database suites through the trusted runner.** No backend file was modified by this reviewer. The current implementation otherwise substantially satisfies the shared backend security/compatibility contract, including the difficult same-org/revoked-creator, old-definer, legacy-storage and typed-UUID cases. No demonstrated high-severity local security blocker was found.

After M1 passes independent re-review, a local backend merge can be recommended without pretending Storage HTTP, true concurrency or frontend gates are already complete. Publication/deployment approval remains out of scope. Do not mark the full product/release complete solely because the existing 395 checks are green.
