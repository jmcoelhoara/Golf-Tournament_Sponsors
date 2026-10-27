# Staff invitations — local implementation handoff

## Status and review boundary

Implemented locally on `murilo/staff-invitations`. Tested source including the review-round-1 L1 correction: `f2285455d09cb65836334a919f17b90e4ec580a8`, based on `e139a5b851e3006fcc188117b9aabd3cf2b7e1c1`. This handoff and `STAFF-INVITATIONS-RESULT.json` are updated in a subsequent documentation-only commit. This is NOT a deployed or fully service-integrated release. Independent re-review of this correction remains required.

All project/dependency/test/build execution used the required offline sandbox. No hosted Supabase operation, real account/invitation/email, credential lookup, push, deployment, merge, system/package/firewall change or background worker occurred. The original `repo/` checkout remains on `murilo/golf-admin-upgrade` with its preexisting modified `verification/frontend-http-server.log` and untracked `ACCESS-HANDOFF.md`; neither was changed here. No Kanban transition or duplicate report job was made. The existing report schedule was left alone; this handoff is not a claim that a Telegram message was delivered.

## User flow

1. Existing platform ADM opens Courses, then an individual course dashboard, then Add staff.
2. The form displays the course and its server-derived club/organization. Enter an email and choose zero or more nonarchived tournaments at that exact course. Draft/live/closed tournaments are eligible; archived tournaments/courses are not. Requests are bounded to 200 submitted event IDs.
3. New accounts use Supabase's admin invitation endpoint, without an initial password or metadata. The application reports email-request acceptance, NOT delivery.
4. Existing accounts are reused by exact case-insensitive email lookup without resetting a password or changing metadata. Normally no new email request is made. An explicit checkbox can request another invitation for an existing pending account; confirmed accounts keep their existing password. Resending may invalidate an older invitation and is subject to Auth/SMTP limits. This is not a general password-reset feature.
5. Membership is inserted as staff only if absent. Existing owner/admin/staff roles remain unchanged. Only selected events are enabled; other grants remain untouched. Selecting a revoked event explicitly re-enables that event. Repeating an already-enabled grant is a no-op and preserves its original attribution/timestamp.
6. Zero selections create/reuse organization membership, with no NEW event grants. This intentionally retains the preexisting membership semantics: members may view their organization course catalog and create their own new events, whose creator receives an explicit initial grant. Membership still does NOT permit reading all existing events, granting others access, managing Auth accounts or becoming platform ADM.
7. The invitation email opens `/auth/invite`. GET/HEAD/prefetch do not call Auth or consume the token. The recipient explicitly clicks Accept invitation; that server action verifies only `type=invite`, writes the SSR session cookies and redirects to the fixed `/auth/set-password` route. Accepting replaces any existing browser session; the page warns about this.
8. The password page and mutation verify the current user with `getUser`. `/auth/set-password` is included in the existing proxy matcher so an expiring session refreshes with writable request/response cookies before Server Component rendering; `/auth/invite` is intentionally excluded. Matching passwords of 12–128 characters are submitted to ordinary `auth.updateUser`, then the recipient is redirected to `/admin`. Existing password login is unchanged. A no-grant user remains signed in with the existing empty-dashboard behavior.

## Security and database design

- ADM means existing `private.platform_admins`, not organization owner/admin or user metadata. There is no new delegated course-admin power.
- The action checks `getUser` plus fresh `get_staff_context` before preflight. Immediately before constructing the privileged client, the factory repeats fresh caller/DB authority checks BEFORE reading the private key. An instrumented action test verifies zero key reads when that second check observes revocation.
- `src/lib/supabase/invitation-admin.ts` is marked `server-only`. Its distinct Supabase client has session persistence, auto-refresh and URL session detection disabled, and receives no caller cookies or session. It is used only for Auth invitation, never ordinary event/membership writes.
- The privileged variable is `SUPABASE_SERVICE_ROLE_KEY` (server-only, no public prefix). It must be an appropriate project-admin Auth key provided later by the operator through the deployment secret mechanism. No real value was obtained. Missing configuration fails closed with a sanitized, useful error. The existing public URL/publishable-key variables are not privileged keys.
- `STAFF_INVITE_SITE_URL` is the configured trusted app origin, not a request Host header. It requires HTTPS except exact localhost/127.0.0.1 HTTP development origins. Credentials, non-root paths, query strings and fragments are rejected. The action appends exactly `/auth/invite`.
- Submitted organization, role, user ID, redirect or other unknown form fields are rejected. Course/event IDs and email are validated before contacting Auth. No arbitrary Auth account list or Auth response object is returned to the browser.
- New forward migration: `supabase/migrations/20261027000000_staff_invitations.sql`. Prior migrations, seed, existing RLS and scoring/media/QR/access helpers were not rewritten.
- `preflight_staff_invitation(uuid,text,uuid[])` is platform guarded and resolves the organization from the course. It returns only a minimal authorized preparation result and exact-email existence boolean.
- `complete_staff_invitation(uuid,text,uuid[])` uses the caller-authenticated client, repeats fresh platform and course/event validation, resolves the Auth account by email, and atomically inserts missing membership plus selected grants. The private scope helper is not client executable. Public/anon execute is revoked; only authenticated callers can invoke the two guarded RPCs. Definers use an empty search path and qualified objects.
- Selected event rows are locked in UUID order and revalidated inside the final DB transaction. Preflight is not held open across the Auth network request. Audit triggers receive the real caller `auth.uid()`, not an invented service-role actor. Unchanged rows do not produce fictitious grant updates.
- All destinations after confirmation/password setup are fixed same-app paths. The landing page rejects extra/repeated parameters and unintended token types; the action repeats validation. No caller-controlled `next`, implicit fragment handling or PKCE code exchange is used for invitations.
- `/auth/*` responses carry no-referrer, noindex/nofollow and private/no-store controls; real production HTTP checks confirmed these on the invitation landing. There are no added third-party resources. Tokens/passwords/provider exceptions are not logged or included in result states.
- Browser-build scan covered every `.next/static` file for the synthetic build-key canary, private variable name and privileged factory name: no findings. This is bounded leakage evidence, not an exhaustive security audit.

## Exact future operator configuration — DO NOT apply without approval

No hosted setting below was inspected or changed.

1. Existing app configuration: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the intended isolated environment.
2. Server-only secret: `SUPABASE_SERVICE_ROLE_KEY`. Never use `NEXT_PUBLIC_*`, put it in a browser client, include it in a source archive, send it in chat or print it in logs.
3. Server-only origin: `STAFF_INVITE_SITE_URL`, e.g. the actual canonical HTTPS app origin with no path. Do not derive it from request headers or automatically trust arbitrary preview hosts.
4. Supabase Auth Site URL: the same canonical app origin. Redirect allowlist: its exact `/auth/invite` URL, matching what this application passes as `redirectTo`. Avoid broad production wildcards. Add a separate exact localhost invite URL only for an explicitly approved disposable local stack. `/auth/set-password` is a fixed application redirect, not an additional Auth-provider callback in this flow.
5. Configure the Supabase Auth Invite user email template with this exact structure (placeholders are Supabase template variables, NOT real tokens):

   ```html
   <h2>You've been invited to staff access</h2>
   <p>Open your invitation, then click Accept invitation to choose your own password.</p>
   <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite">Open staff invitation</a></p>
   <p>If you did not expect this invitation, ignore this email.</p>
   ```

   `.RedirectTo` already includes `/auth/invite`; do not append that path again. Do NOT leave the default `.ConfirmationURL` link for this feature: it would use the provider's verification/implicit-fragment path instead of the application's deliberate-confirmation page. Do not change recovery/signup templates to `type=invite`.
6. Configure/review the intended SMTP sender, recipient allowlist, rate limits, expiry and password policy. Disable provider link tracking that rewrites authentication links. Approval and disposable local mailbox testing precede any real invite. An accepted request is not evidence of inbox delivery.
7. Redact token-bearing auth query strings from hosting/proxy/analytics access logs and error collection. Do not share raw invite links. GET-only scanner mitigation is not a promise against scanners that submit forms, malicious extensions, forwarded emails or compromised mailboxes.

## Official-source basis and research actually read

Read all supplied extracted official research under parent `staff-invitations/research/`: admin invite/create, SSR clients, password-based Auth and redirect URLs. Also read the installed Next forms/data-security/route documentation and installed Supabase SDK source/types.

Additional public official pages were retrieved with unauthenticated curl on October 27, 2026; extracted text is preserved under `verification/staff-official-*.txt`. Raw HTML is an ignored local research cache in `.sandbox/staff-research/`. `verification/read-staff-research.mjs` extracts it offline with scripts disabled; it is optional research tooling, not a prerequisite for verification.

- https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail — invitation API.
- https://supabase.com/docs/reference/javascript/auth-admin-createuser — server-only administration guidance; createUser is NOT used to invent a password here.
- https://supabase.com/docs/guides/auth/server-side/creating-a-client — separate SSR browser/server clients, fresh `getUser` semantics and cookie handling.
- https://supabase.com/docs/guides/auth/passwords — `updateUser({password})` after authentication; password login preserved.
- https://supabase.com/docs/guides/auth/redirect-urls — explicit redirect allowlists and exact production URLs.
- https://supabase.com/docs/guides/auth/auth-email-templates — `.TokenHash` for a custom server verification endpoint, `.RedirectTo` for inviteUserByEmail, scanner-prefetch risk and an explicit confirmation-button mitigation. This page specifically demonstrates token-hash verification with `type=invite` for an SSR endpoint.
- Installed `node_modules/@supabase/auth-js/src/GoTrueAdminApi.ts:174–177,230–246`: invitations do not support PKCE because inviter/recipient browsers differ; the SDK sends the email and redirect without a verifier. `src/lib/types.ts:896–912` supplies token-hash verification and the invite type. Thus this implementation uses a custom email token-hash link plus SSR `verifyOtp`, not a guessed PKCE callback or hash-fragment session.
- Installed Next `01-app/02-guides/forms.md`, `data-security.md` and route conventions: server actions are independently reachable POST endpoints, must recheck authorization, and support the server-only import boundary. Async request data is rendered inside Suspense per this installed app's Cache Components conventions.

The generic web extractor could not extract with its configured search-only backend. The browser could not start because Chromium lacked `libnspr4.so`; no install/system change was attempted. Public curl retrieval and offline extraction succeeded instead. These retrieval/tool limitations are not substituted browser or Auth evidence.

## Partial failure and safe retry

Auth/email and database setup are NOT one atomic transaction.

- Invalid/archived/moved course/event or missing authority is rejected before an Auth request when detected in preflight. Revocation/scope changes between stages are checked again before key use and in the final transaction. In-flight cross-service requests cannot be cancelled by pretending the checks were atomic.
- If Auth accepts the email request and DB completion fails, the UI explicitly identifies the known accepted request with delivery unconfirmed, marks partial progress and asks for a reviewed retry. A transport interruption or SMTP/rate failure conservatively says Auth may have progressed.
- Never automatically delete the Auth user or a shared membership as rollback. The DB transaction rolls back membership AND earlier selected grants/audit records on a later grant failure; real PGlite tests force and read back that scenario.
- Reload the course, review active selections and retry the same email. By default an account now present in Auth is reused without another email request. Existing membership roles and unselected grants are retained. If the recipient lacks a usable invite, fix SMTP/configuration or wait for the rate limit, then explicitly choose Request another invitation for an existing pending account. Confirmed users use normal password login; this feature does not automatically reset them.
- Re-check actual memberships/grants in an approved environment before telling a user that setup or recovery succeeded. Inspect Auth/SMTP logs only through an approved, redacted operator workflow. There is no automated account deletion, background cleanup or compensating revoke.

## Verification actually run

Latest canonical full run after the L1 correction: October 27, 2026, 05:16:43.936–05:17:40.235 UTC. Every check returned exit 0. Exact commands/counts/elapsed times/logs are in `verification/staff-final-results.json` and the durable result file. These latest logs replace the prior canonical run; earlier committed evidence remains in Git history.

Invoke the executable verification runner ONLY through:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py --workspace /root/.hermes/projects/golf-tournament-sponsors/work-staff-invitations --timeout 600 -- node verification/verify-staff-invitations.mjs
```

The runner refuses a non-offline sandbox, sets explicit fake loopback/public configuration and a fake private build canary, then executes sequentially. Only the session-refresh suite starts a deliberately fake loopback Auth transport; no real Supabase/SMTP/Storage service or browser was used:

| Inner command | Observed result | Log |
|---|---|---|
| `npm run test:db` | 418 existing checks: 47 legacy, 316 upgrade, 55 compatibility | `verification/staff-final-database.log` |
| `node supabase/tests/staff-invitations.test.mjs` | 56 new real PGlite checks | `verification/staff-final-staff-database.log` |
| `npm run test:ui -- --maxWorkers=1` | 154 passing tests, 17 files; existing 78 retained | `verification/staff-final-ui.log` |
| `npm run lint` | pass | `verification/staff-final-lint.log` |
| `npm run typecheck` | pass | `verification/staff-final-typecheck.log` |
| `npm run build` | optimized Next build pass; both auth routes built | `verification/staff-final-build.log` |
| `node --test .sandbox/staff-verification/legacy-http.mjs` | 16 real signed-out production HTTP checks | `verification/staff-final-legacy-http.log` |
| `node --test verification/staff-http-smoke.mjs` | 9 real invitation-route production HTTP checks | `verification/staff-final-staff-http.log` |
| `node --test verification/staff-session-refresh.test.mjs` | 4 real Next HTTP checks with explicitly fake Auth transport; NOT real Auth/browser acceptance | `verification/staff-final-session-http.log` |
| `npm run test:smoke` | 6 original HTTP baseline checks | `verification/staff-final-baseline-http.log` |
| Runner browser-secret scan | 19 static output files scanned; no findings | `verification/staff-final-results.json` |

The inherited 16-check HTTP module is copied with only its server-log destination changed, so earlier committed evidence is not overwritten. All local production servers are started and stopped within the foreground sandbox invocation. The separate 6-check baseline overlaps other HTTP coverage; do not call these disjoint end-to-end scenarios.

Preserved RED/GREEN pairs in `verification/`: `staff-db-preflight-*`, `staff-db-complete-*`, `staff-action-behavior-red.log` → `staff-action-green.log`, `staff-course-*`, `staff-auth-*`, `staff-auth-forms-*`, `staff-auth-views-*`, `staff-email-errors-*`, and `staff-partial-progress-*`. RED commands returned 1; corresponding GREEN commands returned 0. The first `staff-action-red.log` is an import-resolution failure before the action existed; it is NOT the witnessed behavior RED, which is separately named. Additional hardening tests appear in the final full run.

The existing nonblocking Vite future native-config-loader warning remains, explicitly visible in UI logs. Source-only `git diff --check` passes. Raw terminal/research evidence retains original progress whitespace/blank lines, so an unrestricted diff whitespace check reports those non-source artifacts; logs were not rewritten to manufacture pristine output.

## Review round 1 — only substantiated blocking finding L1

Read the mission and external `staff-invitations/review-round-1.json` again before this synchronous correction. L1 was substantiated: password-page rendering could refresh an expired session while the Server Component cookie adapter discarded the forbidden writes. That route was absent from the writable proxy refresh path. S1/S2 were nonblocking suggestions and were intentionally left untouched. No SQL, invitation action, role/grant semantics, configuration, dependencies, other worktree, tooling or system changes were made in this correction.

The only production change adds `/auth/set-password` to `src/proxy.ts:39`. It does not add an `/auth` wildcard or run Auth on the invitation landing. Installed Next proxy documentation confirms proxy executes before rendering and also covers matched-route action POSTs; installed cookies documentation prohibits Server Component cookie writes. Cached official Supabase SSR guidance and installed `@supabase/ssr` source require proxy cookie updates to reach both the render and browser. No hosted documentation/service calls were needed.

Witnessed RED before touching production source, then unchanged regression GREEN after the one-entry matcher fix:

- Build command before each test: `env NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=offline-fake-key npm run build`; both exited 0. Logs: `verification/staff-review-l1-red-build.log`, `verification/staff-review-l1-green-build.log`.
- Test command: `node --test verification/staff-session-refresh.test.mjs`, always through the same required offline sandbox prefix above.
- RED exited 1: 2 passed, 2 failed, 0 skipped. Both expired and nearly expired password-page cases refreshed exactly once and rendered using the replacement session, then failed `Replacement session cookie must reach the HTTP client`. `/login` persistence and inert invitation GET/HEAD/prefetch controls passed. Log: `verification/staff-review-l1-red.log`.
- GREEN exited 0: all 4 passed, 0 failed/skipped. Actual response cookies contain the replacement access AND refresh token. A later HTTP request submits the actual rendered password form, including React's bound action fields, with the persisted response cookies. The real action sends its user checks and password update using the replacement access token, does not refresh again, and returns 303 to `/admin`. Log: `verification/staff-review-l1-green.log`.
- Full runner repeated all 4 cases successfully after the full existing DB/UI/lint/typecheck/build checks. Machine-readable chronology/scope: `verification/staff-review-l1-results.json`.

This is real optimized Next/SDK/SSR HTTP execution with synthetic identities/sessions and a deliberately fake Auth listener on isolated loopback, plus a minimal HTTP cookie jar. It is not real Supabase Auth, SMTP, browser cookie storage, provider rotation/reuse acceptance or email evidence. Both listeners terminate before each foreground sandbox call returns. No child agents were started. Independent re-review is not claimed; review gate RG1 remains open for that approval, and RG2–RG6 remain unproved.

## Remaining release gates (not local code blockers)

1. Independent re-review of L1 correction and separate verification by the durable supervisor. Review round 1 failed L1; local RED/GREEN and full passing verification correct its code/regression portion but do not substitute for independent approval. No background reviewer or Kanban completion was launched here.
2. A separately approved disposable LOCAL Supabase Auth/PostgREST/Storage/mailbox stack. Verify actual migration execution against its real schemas/roles, named RPC wire calls, invite/resend/existing-account behavior, exact membership/grant readbacks, SMTP capture and rate/config failures. Current PGlite Auth fixtures contain fake identity rows; action/component tests deliberately mock the transport and do not prove Auth HTTP/SMTP behavior.
3. Real browser acceptance: invite link in a different browser/device, GET scanners/prefetch, explicit POST confirmation and persisted cookies, used/expired/malformed links, expiring-session refresh and password setup, existing password login, keyboard/mobile/pending/error flow, and no-grant/partial-retry behavior. The L1 fake-transport HTTP regression does not close these real-provider/browser gates. Earlier Chromium startup failed with missing `libnspr4.so`; browser screenshots were not fabricated.
4. Real independent-session revoke/archive/course-move/invite races and duplicate invitation requests. Sequential PGlite and lock-order inspection are not concurrency scheduling proof. No claim of distributed atomicity or cancelling already-running requests is made.
5. All earlier `LOCAL-REVIEW.md` gates remain: authenticated event/roster/print/leaderboard revocation, real Storage lifecycle, QR/browser/media/scoring and independent-session concurrency acceptance. PGlite Storage fixtures do not emulate actual object service delivery.
6. Before approved rollout: verify actual platform ADM identity and deployed policy/function inventory; review/backup existing data, migration ordering, restore plan, SMTP/template/URL configuration and secure server-only key provisioning. No production lookup was made to satisfy these checks.

`docker`, `podman`, `psql`, `supabase`, `chromium` and `chromium-browser` were not found on PATH in the final read-only tool check. Missing services/packages were not installed or replaced with fictional integration output.

## Migration/application order and rollback

For an approved isolated acceptance environment first:

1. Preserve its data/backup and run the existing upgrade preflight/postcheck process. Apply prior migrations through `20261025000000_event_catalog_access_media.sql` if not already applied; never rerun demo seed on populated production data.
2. Apply the new `20261027000000_staff_invitations.sql` forward migration and verify its function privileges and fake-account transactional/authorization cases against the actual local stack.
3. Deploy the reviewed app/routes to that environment with invitation sending disabled by withholding the new private key. Do not expose the new form against a database lacking its RPCs.
4. Configure exact Site URL, invite redirect allowlist and custom Invite user template together with SMTP. Only then provide the server-only key through the approved deployment mechanism and perform approved fake/local-mailbox acceptance tests.
5. Production migration, application deployment, key provisioning or real invitations require a separate explicit operator approval after all gates. Keep sends paused until route/template/backend versions match.

Rolling back app code does not require deleting accounts or reversing memberships. The new migration adds guarded functions without changing existing policies. Preserve audit/history and use separately reviewed forward corrections if needed. Never turn a rollback into an automatic delete/revoke of shared access.

## Local delivery and future publication (not executed)

The earlier pre-correction delivery was packaged into the following ignored, local-only artifacts. They were NOT regenerated in this narrow correction and do NOT contain the L1 fix; do not treat them as current corrected source. The authoritative updated delivery is local source commit `f2285455d09cb65836334a919f17b90e4ec580a8` plus the subsequent handoff/result commit on this branch:

- `.sandbox/staff-delivery/staff-invitations-source.tar.gz`: earlier tracked source/evidence/handoff/result, no node_modules, .next, .git, .env secrets or sandbox caches; stale relative to the L1 correction.
- `.sandbox/staff-delivery/staff-invitations-feature.bundle`: incremental feature-branch bundle requiring base commit `e139a5b851e3006fcc188117b9aabd3cf2b7e1c1` already available in the receiving repository. It is not a standalone clone bundle.
- `.sandbox/staff-delivery/delivery.json`: actual final commit, artifact paths, hashes and archive/bundle verification results. These generated packages are intentionally not committed inside themselves.

Review locally with `git log e139a5b..murilo/staff-invitations`, `git diff e139a5b..murilo/staff-invitations -- src supabase next.config.ts vitest.config.ts`, this handoff and the evidence runner. Run all code only through the trusted sandbox. Leave the original checkout's unrelated changes alone.

No push URL/credential configuration changed. `origin` remains guarded with `disabled://review-required`. Only after Joao approves publication AND a human checks feature-branch preview-deployment/backend isolation, an already-authenticated human may publish from THIS worktree using the explicit destination:

```sh
git status --short
git branch --show-current
git push https://github.com/jmcoelhoara/Golf-Tournament_Sponsors.git HEAD:refs/heads/murilo/staff-invitations
```

Check that the branch shown is `murilo/staff-invitations` first. Stop on an existing conflicting remote branch; no force-push. Do not override the multi-valued origin pushurl with `git -c`, reconfigure credentials, merge main or infer that a draft PR disables preview deployments. Open a draft PR only after authorized publication; no remote branch/PR/deployment is claimed here.
