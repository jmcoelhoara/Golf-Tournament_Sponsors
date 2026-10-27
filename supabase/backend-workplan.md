# Backend local workplan

Scope: forward SQL migration, real PGlite database/role tests, backend release and evidence documents only. No hosted access, credentials, deployment, push, production seed or system changes.

Seams: public SQL RPCs and actual RLS with anon/authenticated identities; real PostgreSQL engine in PGlite. Storage schema fixture will execute real SQL policies but cannot verify Supabase HTTP service or object bytes. Local-only fake users include platform, granted staff/manager, same-org ungranted owner, other-org owner, and revoked creator.

Vertical sequence: explicit ACL and creation/context; platform catalog and preset placement snapshots; atomic course changes/status/archive; media library/storage; refreshed golfer/staff compatibility; adversarial review and full regression.

Acceptance: contract-review.md sections 3–8; old signatures, tokens, result units, scoring/retries retained. No direct event/contest/media/ACL writes; no hidden old policy/definer bypass. Archive retains data and successful receipts while hiding public history. Platform alone changes ACL/catalog. Each slice records red and green logs under supabase/verification/backend-*.log.

Defaults: contract choices are reversible local implementation assumptions. Troy identity and deployed policy inventory are release gates, not reasons to access production. No task-board completion changes.

## Recovery outcome

Resumed the existing migration/tests and preserved all original red/green logs. Recovery baseline passed 47 legacy + 165 upgrade + 37 compatibility checks. A new real SQL regression exposed duplicate contest UUID aliases defeating complete atomic course reassignment; `backend-11-uuid-placements-red.log` records that assertion failure before the migration fix. Counting typed UUIDs instead of raw JSON strings made the regression pass. Expanded permission/read fixtures, manager/revoked-creator/membership checks, media retention and public scoring boundary coverage.

Final offline run: 47 legacy + 293 upgrade + 55 compatibility = 395 passing database checks, zero failures. ESLint, TypeScript and the backend checkout's existing application production build pass. UI test startup is blocked by the sandbox not exposing `librt.so.1` required by the installed Rolldown native addon; its generic error misleadingly suggests missing npm packages. No package/lockfile or trusted-tooling change was made. The frontend upgrade remains a separate worker's responsibility.

See `supabase/README.md` for RPC/storage/release guidance and root `backend-result.md` for exact commands, commits and remaining independent verification gates. Actual Supabase Storage HTTP and true multi-session races are not verified by the PGlite fixture.
