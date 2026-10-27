# Frontend review fix — FE-ACL-REFRESH-01

Local verification on October 26, 2026, branch `murilo/frontend`, starting at `ddb038faf16c15f4be6e881796ccaac5d4d709fe`. Only the frontend access-row refresh finding is addressed. No task was marked complete, and no release approval is asserted. The local commit containing this report can be identified with `git log -1 --format=%H -- frontend-review-fix-result.md`.

## Outcome and scope

The independent P2 finding was a component-state correctness bug, not a demonstrated backend RPC/RLS bypass. A same-event refetch could return revoked access while a mounted checkbox retained its original checked state, or vice versa, causing the next Save to reverse the fetched state.

`src/app/admin/access/AccessManager.tsx` now:

- Reconciles a clean row against each successful authoritative read, in both enabled → revoked and revoked → enabled directions, without remounting `MutationForm` or losing its pending-submit state.
- Preserves an unsaved selection if authority has not changed. If authority changes while the selection is dirty, preserves the selection visibly but raises an explicit alert identifying the latest enabled/revoked authority; both checkbox and Save remain disabled until **Use latest access** explicitly resets the draft. The operator may then deliberately edit and save again. A later refetch or an in-flight mutation's completion does not silently clear the conflict.
- Disables stale rows during the account/grant refetch and after a failed read. Only a successful current-event read enables them again; successful retry clears the read error. Superseded responses still use the existing effect cancellation guard.
- Marks a successfully submitted selection clean so its next read reconciles normally. Snapshot identity matters even if that read returns the pre-save enabled value again; otherwise a completed save followed by an intervening external change could leave another stale checkbox.
- Keeps the existing RPC names/parameters and backend enforcement unchanged. `MutationForm.tsx`, route/platform guards, backend, dependencies, lockfiles and trusted `tooling/` were not modified. The access component was expanded from compressed source into readable code while making this narrow fix.

`AccessManager.test.tsx` exercises the real TSX components and real `MutationForm` in JSDOM, mocking only Supabase transport and the router refresh seam. In the other-account cases, clicking staff2's real Save causes `MutationForm` to call the mocked `router.refresh`, which supplies a fresh same-event prop object and exercises the actual account/grant loading effect for staff1. This is not real Next RSC, authenticated HTTP, persistence, concurrency or database integration evidence.

## Witnessed RED → GREEN evidence

Each production behavior change followed its failing test run. All commands used the offline sandbox with one UI worker. Raw logs were retained rather than overwritten.

| Slice | Witnessed RED | GREEN |
|---|---|---|
| Clean same-event/account authority transitions in both directions | `verification/review-acl-01-red.log`: exit 1, 2 failed / 3 passed; checked state remained true after revoke and false after enable | `verification/review-acl-01-green.log`: exit 0, 5 passed |
| Explicit dirty-draft conflict in both directions | `verification/review-acl-02-red.log`: exit 1, 2 failed / 5 passed; conflict alerts absent | `verification/review-acl-02-green.log`: exit 0, 7 passed |
| Disable stale saves while refetching and after failed read, recover only after success | `verification/review-acl-03-red.log`: exit 1, 1 failed / 11 passed; fieldset incorrectly enabled during deferred read | `verification/review-acl-03-green.log`: exit 0, 12 passed |
| Reconcile a completed save against a fresh read even when authority returns to its pre-save value | `verification/review-acl-04-red.log`: exit 1, 1 failed / 15 passed; checkbox incorrectly remained checked | `verification/review-acl-04-green.log`: exit 0, 16 passed |

Additional characterization tests passed when first introduced: four other-account-save cases (both authority directions, each with clean and dirty drafts), preservation of an unchanged-authority unsaved draft, and two deferred-save cases proving the pending form stays mounted and a discovered conflict survives save completion. They are not misrepresented as separate witnessed RED fixes.

The three pre-existing access tests remain: exact enable payload, explicit false revoke payload, and account-lookup error handling.

## Final offline checks

Machine-readable evidence: `verification/review-acl-final-results.json`. The serial run started `2026-10-26T02:47:13.338Z` and finished `2026-10-26T02:47:40.484Z`.

| Check | Actual result | Evidence |
|---|---|---|
| UI (`npm run test:ui -- --maxWorkers=1`) | Exit 0; **78 passed in 12 files**, including 16 access tests; 13 additional tests versus the parent-verified 65-test baseline | `verification/review-acl-final-ui.log` |
| Lint (`npm run lint`) | Exit 0, no lint errors or warnings | `verification/review-acl-final-lint.log` |
| Typecheck (`npm run typecheck`) | Exit 0 | `verification/review-acl-final-typecheck.log` |
| Production build (`npm run build`) | Exit 0; 17/17 static page artifacts generated | `verification/review-acl-final-build.log` |
| Real signed-out production HTTP | Exit 0; **16 passed, 0 failed, 0 skipped** | `verification/review-acl-final-http.log`, `verification/review-acl-http-server.log` |

Reproduce the final sequence:

```sh
/usr/bin/python3 -I /root/.hermes/projects/golf-tournament-sponsors/tooling/sandbox.py \
  --workspace /root/.hermes/projects/golf-tournament-sponsors/work-frontend \
  --timeout 600 -- node verification/review-acl-run-checks.mjs
```

For the individual TDD slices, the inner command was `npm run test:ui -- --maxWorkers=1 src/app/admin/access/AccessManager.test.tsx`, with stdout/stderr captured to the corresponding `review-acl-*.log` and its real exit code propagated.

The new review-only runner preserves all earlier verification artifacts. For HTTP it evaluates the existing `verification/frontend-http-smoke.mjs` module, changing only the destination of the server log to `review-acl-http-server.log`. The module starts and stops an actual production Next server inside the isolated sandbox and performs actual loopback HTTP requests. Its checks cover home/login markup, 12 signed-out protected-route 307 redirects (including access/settings/entries/print/leaderboards/history/catalog), a legacy `/c/legacy-token` public shell, and the delivered production stylesheet. Build/server configuration uses only the fake `http://127.0.0.1:54321` Supabase URL and `offline-fake-key`; no Supabase server is present and no fabricated service responses are used by these HTTP checks.

## Remaining gates and limits

- **Independent merged review/local services:** Parent must combine the final reviewed backend and this frontend fix and independently review the merged result. Backend M1 fix `7824a8103cdd8334512245d0c8e04e134a1e69be` was supplied as context; this frontend worker neither changed nor verified that backend. Use an authorized real local Supabase Auth/PostgREST/Storage stack for named RPC dispatch, nested reads, actual persisted writes/readbacks, fresh grants and error responses.
- **Authenticated boundaries:** Exercise platform, granted staff, same-organization ungranted owner/admin, revoked creator and no-grant identities via real authenticated requests, including direct route access and revocation without logout. The signed-out HTTP checks and mocked component refresh tests do not satisfy this gate.
- **Concurrent writers:** The frontend reconciles reads it receives and blocks visible conflicts; it is not compare-and-swap or an atomic write-conflict protocol. It cannot cancel an already issued RPC, detect changes never fetched, or guarantee ordering of competing administrator requests. No backend API/concurrency change or concurrency approval is claimed.
- **Storage:** Actual permitted and denied uploads, malformed paths, revoked users, wrong-event/kind selection, denied overwrite/update/delete and retained objects after errors still need authorized local service verification. Public marketing-image URLs can remain downloadable after revocation/archive; no revocable public-delivery promise is made.
- **Real browser/print/player:** Mobile layout, browser interaction/focus, real RSC refresh, image-load popup timing, print pagination, scannable QR and golfer retry/scoring compatibility against a real local backend remain browser/service gates. JSDOM does not prove those properties.
- **Publication authority:** Deployed policy/privilege inventory, trusted Troy/platform-admin identities, migration/application order, human publication approval and deployment remain separate release gates. No hosted Supabase, credentials, external network access, push, deployment, account/system/gateway/profile changes or task completion occurred.

The existing nonblocking Vite warning about the future native config loader remains in UI logs; no dependency/config change was made for it. No blocking execution failure occurred in the final run. Earlier source and verification evidence were preserved.
