# Phase 1 review, CI isolation and minimal staging setup

Review scope: PR #30, based on `beta-friends` at
`809e4a12bd8a18d070f8612b7e6a380a63fd13b6`; reviewed implementation head
`9617b43ac6da67b899324f7e6770ea68294be710`. This follow-up changes testing and
review documentation only. It does not change application/Edge Function behavior,
SQL migrations, production configuration, credentials or infrastructure.

## Compatibility and security review

All 52 files in the implementation PR were reviewed by category:

| Files | Review outcome |
| --- | --- |
| 26 HTML files | Changes are exclusively cache-version updates for backend/game/progression assets; no markup/navigation changes. No CSS files changed. Existing release audit covers inline scripts, PWA/URLs and accessibility landmarks. |
| `game.js`, `progression-feedback.js`, `backend.js` | Practice mode avoids account progression; verified/failed/unknown outcomes are distinct; race retries keep exact metrics and reconnect restores receipts; snapshots filter current tournament runs. Executable frontend fixtures and existing regressions pass. |
| Four changed Edge Functions | Gateway uses Auth `getUser` identity, not supplied user IDs; race integer validation routes to atomic RPCs; test-key/live-event guards remain; webhook signature validation precedes canonical resource reads. Auth and Stripe clients are injected in tests. |
| Four new migrations | Earlier migrations unchanged. Review covered null/bounds validation, exact retry identity, constraints, tournament eligibility/run isolation, locks, accounting and permission revocations. New/replaced security-definer functions use an empty search path; private inbox/archive access and internal-helper permissions are tested. |
| Package manifests and six Phase 1 fixture files | Fixed dependency versions with integrity-checked lockfile; fresh in-memory PGlite per suite; no hosted connection strings; synthetic users/IDs; real Stripe SDK used for local signature operations only, resource clients mocked. |
| Existing audit/regression script changes | Expected asset versions and intentional practice assertions updated; existing checks retained. |
| Hardening/staging documentation and ignore rules | Intentional behavior, preservation of historical data, approval boundaries, recovery and test limitations documented; node_modules/test caches excluded. |

No confirmed new application regression or additional reward-minting path was found
in this review/local validation. That is bounded evidence, not a claim of complete
production compatibility or tamper-proof gameplay. Preserve these explicit release
risks and proposed checks:

1. **Native lock contention remains untested.** Round save locks player stats before
   wallet; tournament award credits wallet before updating player stats (tournament
   migration around the reward/save and award sections). This inherited lock-order
   inversion can plausibly deadlock when a non-tournament save and an award target
   the same account. Treat it as a concrete contention risk, not an observed failure.
   Include award-versus-normal-round and retry tests in native staging. If reproduced,
   align lock ordering across affected mutations before release.
2. **Migration compatibility requires target preflight.** Duplicate challenge/intent
   bindings prevent unique index creation. Same-named existing objects, divergent
   migration history/default grants and historical adjustment/ledger counters need
   review. Synthetic upgrade fixtures preserve balances and completed standings, but
   do not establish production data compatibility. Legacy issued tournament challenges
   are intentionally abandoned, requiring fresh attempts.
3. **Stripe delivery/recovery depends on canonical test reads and operations.** The
   terminal-status guard covers stale active snapshots; overlapping canonical fetches,
   failure/retry and pending-inbox monitoring still need the isolated event matrix.
   Previously ignored historical events may lack recoverable amount/status data.
   Do not delete history or assume a 200/pending receipt means funds were applied.
4. **Frontend/hosted routing remains partly simulated.** Tests use a stub DOM and
   minimal Auth/Storage schemas. Actual JWT expiry, PostgREST overload/schema-cache
   behavior, Realtime permissions, two devices and installed-PWA keyboards/reconnect
   require the published staging plan. Normal verified-round save failures lack the
   race-specific retry button; that existing UX limitation should be tested explicitly.
5. **Dependency resolution and anti-cheat scope remain limitations.** Local test
   dependencies are pinned; existing Edge/CDN major-range imports are not fully pinned
   by this CI job. Type checks passed against the previously resolved SDKs, but staging
   should record actual versions. Plausible client telemetry/automation is still not
   proof of human typing.

## Automated checks and isolation

`.github/workflows/backend-audit.yml` retains the existing `audit` check and adds
`Phase 1 regression tests` for every PR targeting `beta-friends`, including drafts,
new commits, reopening and base-branch edits. No path filter or draft exclusion is
used. Existing push/other-base audit triggers remain. These workflow definitions
are currently proposed in the Phase 1 branch; they become the target branch default
only after a separately approved merge.

The new job runs Node 22, `npm ci` with package lifecycle scripts disabled, then
`npm run test:phase1`. Checkout does not persist Git credentials. Permissions are
`contents: read`; no environment, production/Supabase/Stripe secrets, deploy step,
hosted connection string or service container is configured.

Installation accesses the npm registry. Test execution occurs inside Linux
`unshare --net`, an independent network namespace with no network interfaces/routes.
Failure to create the namespace fails the check; there is no network-enabled fallback.
The npm script additionally runs an isolation self-check, then preloads
`scripts/phase1-network-guard.cjs` in the test runner/workers. HTTP(S), TCP/TLS, UDP,
DNS, fetch and synchronized built-in ESM clients fail before requests. The guard is
also active in local npm test runs. It is a guard against accidental client use;
Linux namespace isolation is the CI egress boundary, including subprocesses.

PGlite is instantiated without a disk path/remote URL. SQL roles/Auth/Storage are
local stubs; service clients and canonical Stripe reads are mocked. No Stripe
payment/refund API is called. The suite still has 37 regression tests; isolation
self-check probes are separate and do not inflate that count. Unit/SQL/DOM evidence
is deliberately separate from the native/hosted/physical staging requirements.

## Read-only staging inventory

On October 9, 2026 (local date), the connected Supabase inventory returned one
accessible project: **AutoType**, reference `nukgycwyvzzxvsewhcqi`, region `us-east-1`,
status `ACTIVE_HEALTHY`, PostgreSQL engine 17. Its development-branch inventory was
empty. This is the existing app project, not a separately verified staging target.
No separate staging project or development branch is visible through this connection.
Projects outside its access scope could exist; absence here is not proof across
unconnected accounts/organizations.

Only management project/branch metadata was requested. No SQL, tables, user records,
logs, keys, credentials or database contents were accessed; no service changes occurred.

## Minimal safe setup plan — approval required before execution

1. Confirm whether an existing staging project outside the current connection can be
   identified by name/ref. Otherwise approve a new independent **AutoType Staging**
   project in the organization you select, preferably `us-east-1`/PostgreSQL 17 for
   comparable behavior. Check quota/cost first; request a zero-cost/free-only budget
   if available. If unavailable, stop for a specific cost approval rather than upgrading
   or using a paid project. Nothing has been provisioned or cost-approved.
2. Start empty. Apply only the reviewed bootstrap/prior migrations and four Phase 1
   migrations after separate staging-write approval. Seed synthetic accounts A/B/C,
   staff, challenges, rooms, tournaments and fake payment records. Do not branch/copy
   production rows, backups, Storage objects, Auth users or financial history.
3. Use newly issued staging-only configuration/credentials, held server-side where
   privileged. Creating/using those credentials and configuring Auth redirects need
   explicit staging approval; do not reuse or alter production credentials/settings.
   Use a local or already approved isolated frontend with staging public configuration.
   Choose a trusted HTTPS staging URL before physical PWA tests; do not publish to
   the production GitHub Pages workflow to obtain a preview.
4. Separately approve deployment of the reviewed Edge Functions **to that staging
   project only**. Confirm project refs, allowed staging URLs and source commit before
   each write. Start payment checks with signed fake events and mocked canonical reads;
   any existing Stripe sandbox/test-object integration needs its own explicit staging
   scope and test-only credentials. No charge, payment or refund creation is needed.
5. Execute [PHASE1_STAGING_VALIDATION.md](PHASE1_STAGING_VALIDATION.md), including
   separate native sessions and award-versus-normal-round contention. Store sanitized
   evidence, test IDs, exact versions and pass/fail results. Assign owners for retained
   pending events/reconciliation and test-project cleanup. Production remains untouched.

Approval needs to identify the organization/project/region, a permitted cost ceiling,
allowed staging schema/fixture/Auth/credential changes, staging-only function deployment
and frontend URL, and the simulated/test-only Stripe scope. Provisioning approval alone
must not be treated as approval to migrate/deploy or change production.

## Readiness

The reviewed Phase 1 implementation and isolated CI suite are ready to enter approved
isolated staging validation. They are not ready for production approval. Remaining gates:
native transaction contention/retries; actual Supabase Auth/RLS/grants/PostgREST/Realtime;
two-user gameplay; reset/stale challenges under real contention; target preflight and
upgrade dry run; isolated webhook ordering/reconciliation; physical mobile/PWA/navigation;
and operational monitoring/recovery ownership. Any native deadlock or target preflight
conflict must be resolved before release. No hosted migrations/functions or settings
were changed by this follow-up.
