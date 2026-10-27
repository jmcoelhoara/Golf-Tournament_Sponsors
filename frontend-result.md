# Frontend result — local implementation complete; integration gates remain

Verified October 26, 2026, in `work-frontend`, branch `murilo/frontend`. Interrupted uncommitted source, component tests, Vitest configuration, and original verification logs were preserved and committed, not reset or discarded. No Kanban task was marked complete.

**Review follow-up:** The original no-known-blocker statement below was superseded by independent finding `FE-ACL-REFRESH-01`, a P2 stale access-checkbox defect (not an RPC/RLS bypass). The narrow local fix and its witnessed RED → GREEN evidence are in `frontend-review-fix-result.md`; its final checks passed 78 UI tests and 16 signed-out production HTTP tests. Authenticated service/browser/concurrency and release-approval gates remain open. The original verification history below is retained unchanged.

## Commits and scope

- Frontend implementation and executable verification evidence: `5d9987b71d0442fa4e2169823695a7babead4dcf`.
- Frontend starting tooling commit: `1be624d` (preceded by original application `2952db1`).
- Backend contract dependency, supplied by parent: `9800799dde5ebfc64da9bd3cf89239664c0d1b63`; backend report commit `3054e320e36fad79d89d6504df81f107a5c59f8c`. These backend commits are **not** copied into this frontend checkout. Parent must combine the branches locally and review integration before publication.
- This report is a separate documentation commit after the implementation commit; `git log -1 --format=%H -- frontend-result.md` identifies it without a self-referential commit hash.
- Changed areas: `src/app/admin/` routes/components/tests; public `src/app/c/[token]/` branding and visit lifecycle; `src/app/globals.css`; staff/catalog/media helpers in `src/lib/`; `src/test/`; `vitest.config.ts`; and `verification/` logs/runners.
- No dependency or lockfile changes, backend migration changes, trusted tooling edits, hosted credentials/services, deployments, pushes, system changes, or gateway restarts.

## Verified results

`verification/frontend-final-results.json` is the machine-readable result. Its last successful run ended at `2026-10-26T02:23:44.993Z`.

| Check | Exact result | Evidence |
|---|---|---|
| Resume UI baseline, before resumed production edits | 47 passing tests in 11 files | `verification/resume-baseline.log` |
| Resume lint/typecheck baseline | Both exit 0; lint originally had 2 unused-import warnings | `verification/resume-lint-baseline.log`, `verification/resume-typecheck-baseline.log` |
| Final UI tests | **65 passing tests in 12 files**, 0 failing; **18 more** than resumed baseline | `verification/frontend-final-ui.log` |
| Final lint | Exit 0, no errors or warnings | `verification/frontend-final-lint.log` |
| Final typecheck | Exit 0 | `verification/frontend-final-typecheck.log` |
| Offline production build | Exit 0; Next generated 17/17 static page artifacts and the new route table | `verification/frontend-final-build.log` |
| Real local production HTTP smoke | **16 passed, 0 failed, 0 skipped** | `verification/frontend-final-http.log`, `verification/frontend-http-server.log` |

All project commands used the required offline sandbox, with checks run serially and Vitest restricted to one worker. The production build and server use an explicitly fake loopback Supabase URL/key, not a working service. The original parent baseline build/lint/typecheck/SQL logs were reviewed; this worker did not represent an early resumed build as a pre-edit baseline.

Reproduce the full serial check sequence:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py \
  --workspace /root/.hermes/projects/golf-tournament-sponsors/work-frontend \
  --timeout 600 -- node verification/run-frontend-checks.mjs
```

This runs `npm run test:ui -- --maxWorkers=1`, `npm run lint`, `npm run typecheck`, `npm run build`, then `node --test verification/frontend-http-smoke.mjs`. The HTTP runner starts and stops its own production Next process inside the sandbox. It checks the real home/login markup, 12 signed-out staff-route redirects, the unchanged legacy-token QR route shell, and the delivered production stylesheet. It does not simulate a Supabase server.

## Acceptance coverage and behavior

| Area | Implemented frontend behavior and test seam |
|---|---|
| Event access and login | Fresh authenticated staff context and user-scoped event SELECTs; no organization-owner shortcut, service-role client, email-based Troy check, or global event cache. No-grants users stay signed in with an empty state. Server guards deny platform-only pages independently of menu visibility. `staff.test.ts`, `server-views.test.tsx`, and navigation tests cover these boundaries with mocked transport. |
| Event settings | Granted-event list, organization/course-based draft creation, title/date/course editing, live/close, archive confirmation, and explicit returned errors. Existing entries are retained. With any nonarchived contest the editor **refuses course changes** and explains the complete-placement requirement; no partial remap or silent clearing is attempted. |
| Course-scoped views/catalog | Course event pages are discoverable from staff Event settings and show supplied enabled events/create entry points. Only platform admins see catalog maintenance for course names, club-local tee labels/hex colors, and configured hole yardages. Missing yardages are not invented. Tee swatches and responsive layout rules are present. |
| Fixed contest presets and placement | Select a DB-maintained preset, explicitly select a configured tee and hole, display the corresponding automatic yardage in yards, and submit only the placement/preset identifiers. No free-form scoring overrides or preset hole assignments. Existing legacy scoring snapshots remain readable. |
| Contest controls/entries | Entries and review controls, open/close, confirmation-required archive, branded print link, placement editor, and per-contest upload/reuse controls. Archived controls are disabled/absent. Platform operational lists exclude archived contests, with an explicit retained-history view; ordinary staff cannot open archived event history. |
| Event logo | One current event logo drives player branding and each newly opened authenticated print sheet. Picker state refreshes when the server-selected logo changes. Tests exercise replacement across two print views and player polling; persistence after deleting contests is a backend invariant, not something mocked component tests prove. |
| Sponsor media | One selected composite banner per contest; event-filtered reusable image library. Immutable random event-local object paths, PNG/JPEG/WebP validation and 10 MiB limit; upload, registration, then selection. Existing objects are never deleted by the new workflow, including failed registration/selection. Returned storage/RPC errors and direct catalog zero-row responses are visible. Legacy sponsor management is platform-only/read-only; old public inline logo/strip fallback remains. |
| Popup/player compatibility | Contained vertical modal, accessible close button, Escape/keyboard focus handling, image-error bypass; timeout is exactly 5,000 ms **after load**. Captured once per visit, not reopened by polling or banner-selection gaps/replacements. A different QR token starts fresh state. Characterization tests preserve remembered golfer, same retry UUID, feet/inches-to-inches submission, unmeasured longest-drive claims, and legacy sponsor fallback. |
| Draft print | Authenticated route reads contest, parent event and current event logo without requiring public/live availability. Generates the QR for unchanged `/c/<public_token>`; renders logo, tournament name, contest name, hole, tee/yardage and URL. Print controls wait for QR/logo load, surface image errors and allow explicit logo bypass. Print CSS removes navigation/buttons and avoids splitting the sign. |
| Leaderboard and Troy access/history | Event settings and Leaderboard menus, enabled-event leaderboard links, authenticated event leaderboard including draft/closed staff data, platform-only existing-account enable/revoke UI and retained history. Grant/revoke payloads explicitly send true/false; database RPC authority is relied on for enforcement. |

## Resumed strict TDD fixes

The original worker's evidence remains under `verification/frontend-*.log`. This resume added witnessed failing assertions followed by full-suite green runs under `verification/resume-01-*` through `resume-11-*`:

1. Sponsor canvas was static inline content because popup styles were missing; added viewport overlay and contained canvas styling.
2. Print controls/navigation had no print-media styling; added the branded sheet and print rules.
3. Clearing and replacing a banner during polling reopened a dismissed popup; captured initial-visit media and propagated dismissal to the visit owner.
4. Direct ordinary-staff event settings could expose archived history; added the archived-event route guard.
5. Refreshed shared-logo selection left the picker on the old logo; keyed its form state to the server selection.
6. Retired organization-wide sponsor URL lacked the platform server guard; gated it before reading.
7. Old legacy sponsor screen still offered destructive image controls; made it a retained read-only display.
8. Platform operational event pages mixed archived and active contests; introduced an explicit platform history view.
9. Staff could not discover course-scoped pages from the no-event dashboard; added accessible course-event links.
10. Tee color spans had no dimensions and staff navigation could not wrap; added swatch/responsive presentation rules.
11. Client navigation between QR tokens reused the previous visit's golfer/banner state; keyed the player client by token.

Additional passing characterization tests were added for already-correct scoring, retry, legacy-media, logo-update and revocation behavior; they are not claimed as new RED-to-GREEN fixes. Test-runner count parsing initially rejected ANSI-colored output even though all checks passed; its parser was fixed, and the complete runner was exercised again successfully. Raw logs retain their original terminal whitespace/ANSI; source/test/script whitespace checks pass.

## What is not proved / remaining gates

**No known frontend implementation blocker remains in the exercised offline checks. Full end-to-end acceptance and release approval are not claimed.**

- Component/server-view tests mock Supabase client transport. They prove UI rendering, payloads and visible errors, **not** PostgREST HTTP behavior, live RLS/Storage authorization, actual Auth login, persisted mutations, or Supabase Realtime delivery. Parent reported 395 independently passing backend PGlite tests; this worker did not rerun or substitute component mocks for those SQL checks.
- Real production HTTP was exercised only for signed-out redirects and public/static shells. **Authenticated HTTP integration remains open**: combine backend/frontend locally with an authorized real local Supabase Auth/PostgREST/Storage stack and verify granted/revoked/no-grant/platform users, draft print, leaderboard reads, all mutation responses, immutable uploads and denied update/delete. No service or credentials were supplied here; none were fabricated or obtained remotely.
- **Real-browser gates remain open**: visual/mobile layout, assistive-technology interaction, actual image-load timing and focus restoration, navigating after revocation without logout, browser print pagination, QR decoding/scanning and player interaction against a real local backend. JSDOM style assertions and stylesheet HTTP delivery are not screenshots, layout-engine validation, or a physical QR scan. No browser screenshots or service data were invented.
- New media uses a public marketing-image bucket. Possessing a public image URL can still permit asset downloads after grant revocation or archival; do not promise revocable public image delivery.
- The existing Vitest `.ts` config emits a nonblocking Vite warning about a future native config-loader default. Current tests execute successfully; dependency/module-format changes were not made without parent agreement.
- The root `frontend-blocker.md` is **superseded**: parent repaired the reviewed missing `librt.so.1` sandbox mount and verified sandbox acceptance. This worker's baseline, RED/GREEN tests, build and HTTP runs now execute successfully without tooling changes.
- Independent merged-branch review, authorized local service/browser gates, deployed policy/Troy identity inventory, publication approval and deployment are left to the parent/release workflow. Nothing was pushed or deployed and no Kanban completion was recorded.
