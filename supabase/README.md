# iScoreGolf Contest — local database upgrade

## Scope and files

- `migrations/20261025000000_event_catalog_access_media.sql`: forward, transactional course/tee/yardage and preset catalog, explicit event grants, settings/status/archive RPCs, immutable event-media library, replacement RLS/Storage policies, compatible golfer functions and event-scoped audit.
- Earlier migrations are unchanged. `seed.sql` is **development-only**; never rerun it over an existing project.
- `tests/schema.test.mjs` runs the legacy scoring/permission suite, then the upgrade and compatibility suites **sequentially**, closing each real PGlite database before opening another.
- `tests/upgrade.test.mjs` executes actual authenticated/anon SQL roles and RLS, with a minimal Storage metadata/bucket fixture.
- `tests/compatibility.test.mjs` applies the upgrade over populated legacy data and checks old payloads, IDs, QR tokens, arbitrary scoring, grants/backfill defaults and retry boundaries.
- `verification/backend-*.log` preserves the interrupted worker's evidence and subsequent recovery/red/green/final output. See root `backend-result.md` for verified counts and commit IDs.

## Run locally through trusted isolation

From this dedicated backend checkout, with the existing locked dependencies:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py \
  --workspace /root/.hermes/projects/golf-tournament-sponsors/work-backend \
  --timeout 600 -- npm run test:db
```

Do not run project code/npm on the host. The runner is outside this checkout and is not modified by this work. The tests are offline and use fake users/data; they do not contact hosted Supabase. No dependency or lockfile change is part of the backend upgrade.

## Staff interface

All mutations return `{ok:true,...}` or `{ok:false,error:<stable_code>}`. Frontend callers must inspect `error` **and** `ok`; do not treat a resolved RPC request as success. Normal authenticated SELECTs remain RLS-backed.

- Context: `get_staff_context()`, platform-only `list_staff_accounts(p_organization_id)`.
- Event: `create_event(p_organization_id,p_name,p_course_id,p_event_date)`, `update_event(p_event_id,p_name,p_course_id,p_event_date,p_contest_placements default null)`, `set_event_status`, `archive_event`.
- Contest: `add_event_contest(p_event_id,p_preset_key,p_hole_number,p_tee_id)`, `set_contest_placement`, `set_contest_status`, `archive_contest`.
- Media: `register_event_image(p_event_id,p_kind,p_object_path,p_label)`, `set_event_logo(p_event_id,p_image_id)`, `set_contest_banner(p_contest_id,p_image_id)`.
- Permissions: platform-only `set_event_staff_access(p_event_id,p_user_id,p_enabled)`.
- Existing `check_in_golfer`, `review_contest_entry`, `correct_contest_entry` and `regenerate_contest_token` now check fresh event access/archive state. Corrections and token rotation retain manager/platform restrictions; granted staff can edit event settings but do not gain manager roster/correction privileges.

An event creator gets one explicit initial grant. Creator identity and same-organization owner/admin roles are **not** ongoing access bypasses. Both current organization membership and an active event grant are required, except for existing trusted `private.platform_admins` identities. Staff can create within their organization without gaining access to its other tournaments.

New event/contest/image/ACL DML is RPC-only, including for platform clients. Course catalog and preset maintenance use platform-only normal DML. Course yardages are integer **yards**; CTP results remain **inches**, and longest-drive presets remain latest marker claims. Course changes require a complete set of nonarchived contest placements; duplicate UUID aliases are counted by typed UUID identity. Catalog edits never rewrite existing snapshots. Delete means archive, preserving entries, tokens, images, leaders and audit.

## Media lifecycle and limitations

1. Upload a new immutable object to `event-media` at `<organization_uuid>/<event_uuid>/<random_uuid>.<png|jpg|webp>` using `upsert:false`.
2. Register it through `register_event_image`, which verifies event/path ownership, bucket object metadata, MIME/extension and positive size up to 10 MiB.
3. Select the resulting image ID as the shared event logo or one contest banner. A banner can be reused only inside its event. Null selection clears a reference, not the library.
4. Never overwrite, move, or delete event objects from a browser; even platform clients use new object names. Keep failed-registration orphan objects for a future trusted cleanup review. Upload and metadata registration are not one transaction.

The bucket is intentionally **public** marketing media. Event RLS revocation/archive does not revoke already-known public asset URLs. The Storage fixture tests actual SQL policy evaluation and metadata checks; it does **not** verify HTTP uploads, stored bytes, MIME sniffing, signed URLs, Supabase service defaults or deployed policies. Registration trusts service-managed Storage metadata, not a client-submitted MIME/size argument.

## Public compatibility

Keep `/c/<existing-token>` and the argument names/signatures of `get_contest_public`, `get_contest_roster`, and `submit_contest_entry`. Existing JSON fields, sponsor/strip payloads, nullable legacy scalars, scoring, units and receipt IDs are retained. Added fields are `event.logo`, `sponsor_banner` and `hole_distance_unit:'yards'`. Legacy sponsor logos are never promoted to event logos. Archived public data is unavailable; a prior successful request UUID still returns its receipt, without an archived leader.

## Release gates — instructions only, not performed

No push, deployment, hosted migration or account change is authorized by this local work.

Before any separately approved release:

- Back up the target database and audit migration/policy/function inventories, including extra policies absent from this repository. Permissive policies combine; unknown deployed grants must not bypass the new rules.
- Confirm Troy's actual authenticated user ID is already trusted in `private.platform_admins`. Do not bootstrap based on first login, a hardcoded email or an organization role. Review any other platform-admin rows.
- Review legacy course/tee/yardage conflicts and incomplete observations. Migration imports only observed, unambiguous values and leaves other normalized placements NULL; legacy display snapshots remain intact. Supply missing catalog data through the platform interface, never infer whole courses from four demo contests.
- Review legacy archived timestamps: `archived_at` is inferred from the old `updated_at`; unknown historical creators/archive actors remain NULL. No blanket historical staff grants are created. Prepare an explicit approved event-access inventory.
- Exercise this forward migration in a disposable authorized local Supabase environment, including actual Storage HTTP upload/list/overwrite/delete tests, revocation, and multi-session submission versus archive races. PGlite is single-session and cannot prove concurrency scheduling.
- Integrate the RPC-based frontend and verify draft print/QR sheets, current logos across contests, five-second once-per-visit sponsor popup/accessibility, settings/leaderboard routing and grant revocation without logout. The old frontend's direct mutations are intentionally denied by the new DB contract; do not release only one side blindly.
- Apply pending migrations in order using the approved release mechanism, never the demo seed. Approve database and application rollout together with rollback/restore procedures. No remote command is run from this backend task.
