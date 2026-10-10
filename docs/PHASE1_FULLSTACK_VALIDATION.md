# Phase 1 full Supabase validation

The user approved disposable full-stack testing in the existing public GitHub
repository on October 9, 2026. This adds the `Phase 1 full Supabase PostgreSQL 17
integration` job to PRs targeting `beta-friends`; it does not create a hosted
project, publish a frontend or deploy functions outside the runner.

## Execution and isolation

The job uses standard `ubuntu-24.04` with a public-repository guard, 30-minute
deadline, one full-stack run per PR and cancellation of superseded runs. It adds
no artifact uploads, caches, package publishing or larger runners. The official
Supabase CLI 2.120.0 archive is pinned and SHA-256 verified; new action references
are pinned to commits. Node dependencies use exact versions and `npm ci` with
lifecycle scripts disabled. No production environments, hosted service secrets or
Stripe API credentials are supplied.

`scripts/fullstack/prepare.py` makes a fresh project under `RUNNER_TEMP`, with
PostgreSQL 17, Auth, PostgREST, Realtime, Storage, Mailpit and Edge Runtime. It
copies only the application bootstrap, migrations and function source. A private,
per-workflow marker identifies the disposable database. Both test entry points
require Actions, this directory, fixed loopback ports and the exact marker before
application writes. The original native entry point still cannot accept a DSN.

Dependency imports are warmed without a signed-in user or Stripe configuration.
A dedicated `autotype_ci` test UID's outbound traffic and the stack containers' external forwarding
are then rejected; the Actions agent keeps its own network access to report results. The JavaScript guard separately rejects non-local HTTP, TCP
and WebSocket destinations. Cleanup stops/removes only the fixture stack.
Ephemeral credentials remain in a runner-local file and are masked in logs.

The current app polls REST for multiplayer updates; it does not subscribe to
Realtime. A **CI-only** publication includes race tables so the test can exercise
actual Realtime delivery and RLS privacy. Subscriptions wait for the server `system` message confirming Postgres Changes readiness before fixture writes; a WebSocket `SUBSCRIBED` status alone is insufficient. No production publication is enabled.

## Test coverage

The JavaScript matrix runs against a synthetic legacy upgrade, then again after
`supabase db reset --local` on a fresh install. The legacy setup applies the
foundation and 46 prior migrations, creates a real Auth account, historical
progression and a fake paid order, then applies the four original Phase 1 files
and the two native lock corrections. Stats, wallet, ledger and paid-order state
must remain unchanged. The fresh reset applies the complete release sequence.
Neither setup uses the Auth/Storage stub prelude from the older native fixtures.

The matrix covers:

- Real Auth account creation, password login, authenticated user lookup, refresh,
  sign-out, revoked refresh token, incorrect password and a validly signed expired-JWT rejection. The signing keys come only from the new runner-local Auth container.
- Actual Edge gateway rejection of missing/malformed auth, JWT-derived identity,
  user-metadata privilege spoofing and denied ordinary-player staff actions.
- PostgREST wallet isolation, unauthorized wallet/stat/result writes, inaccessible
  inbox/run history and browser-role denial of private Phase 1 RPCs.
- Classic, Context, Evil, Daily and Sentence saves through the Edge gateway,
  six concurrent identical receipts, exact retry and changed-receipt rejection.
- Practice isolation, forged/foreign/expired challenges, actual saved stats and
  rewards, live leaderboard projection and the app's core XP/level calculations.
- Two-account friendship/chat, outsider denial, race participant/outsider reads,
  actual Realtime updates, resubscription, simultaneous race finishes and immutable
  receipts without account rewards.
- Staff reset, stale tournament challenge rejection, fresh-run completion and
  exactly-once award authorization through the real gateway.
- Real Storage upload/upsert/delete ownership checks.
- Signed synthetic Checkout events through the actual Edge gateway: concurrent duplicate credit, signature validation, invalid signature and live-event rejection. The worker receives only a fake `sk_test_fixture` value and an ephemeral signing secret; no Stripe API request or transaction is made.
- Signed synthetic Stripe events through the production handler source with fake
  canonical provider reads and the actual local PostgREST/database adapter:
  early refunds, duplicate concurrent credit, reconciliation and signature failure.

`scripts/test_phase1_fullstack_native.py` separately reuses all 15 native scenarios
against the real Supabase PostgreSQL 17 database, with distinct backend connections,
observed lock waits, bounded timeouts and the existing deadlock/rollback/retry
assertions. The original PostgreSQL 16 job, 37 regressions and release audit remain.

## Confirmed compatibility fix

[Initial full-stack run](https://github.com/lnterry6-max/AutoType/actions/runs/38019170805)
started PostgreSQL 17 migration application but failed in
`20261003003903_security_hardening.sql`: the CLI installation has no
`public.rls_auto_enable()` Dashboard-managed helper. The migration unconditionally
revoked/granted that optional function and aborted with SQLSTATE `42883`.

That historical migration now checks `to_regprocedure` before hardening the
optional helper. Existing-helper permissions and mandatory Auth trigger hardening
are preserved. Application migrations already enable their own RLS explicitly;
no placeholder helper is introduced in the full stack. This is a fresh-install
compatibility repair, not a hosted migration or change to existing records.

## Results

[Completed Actions run 520](https://github.com/lnterry6-max/AutoType/actions/runs/38022260709), application/test commit `006458053c8ff0aeb56dce98e6abd50542470ffe`, passed all four jobs:

| Check | Result |
| --- | --- |
| Release audit | Passed; 27 HTML pages and existing release regressions |
| Locked Node Phase 1 regressions | 37 passed, 0 failed |
| Existing native PostgreSQL 16.15 suite | 15 passed, 0 failed |
| Real Supabase synthetic upgrade, PostgreSQL 17.11 | 17 passed, 0 failed |
| Real Supabase fresh installation, PostgreSQL 17.11 | 17 passed, 0 failed |
| Native contention on actual Supabase PostgreSQL 17.11 | 15 passed, 0 failed |
| Disposable stack cleanup | Passed; stopped without backup |
| Uploaded artifacts | None |

Fresh installation applied the bootstrap, all **52 release migrations** (46 prior,
four Phase 1 and two native corrections), plus the CI-only marker/publication.
The upgrade assertions preserved synthetic historical stats, wallet, ledger and
paid-order state. Both inherited deadlocks were reproduced only by temporarily
loading the vulnerable control function into the disposable database; the final
functions passed their forced interleavings and retry/accounting assertions.
Expected invalid-signature errors are negative-test evidence, not suite failures.

The actual service snapshot was PostgreSQL `17.11.0.004`, Auth `v2.197.0`,
PostgREST `v16.4`, Realtime `v2.140.10`, Storage `v1.79.36`, Edge Runtime
`v1.77.4`, Kong `2.8.1` and Mailpit `v1.31.3`.

Earlier runs exposed two harness defects: firewalling the shared runner UID
prevented the Actions agent from reporting results, and Realtime writes raced
replication readiness. Test traffic now uses its own restricted UID, proper signed-in
SDK sessions and the backend readiness signal described in [Supabase's troubleshooting guide](https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting).
The temporary stable-CLI retry was unnecessary once the firewall error was found;
the successful workflow uses pinned CLI **2.120.0**.

The repository is public and the workflow uses standard runners. [GitHub's billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
confirms this compute is free; no cache, artifacts, Packages, custom images or paid
infrastructure were created. No hosted Supabase, production data or real Stripe
credentials/transactions were used. No merge or production deployment occurred.

## Remaining deployment gates

Runner-local Supabase is not evidence for every managed-platform setting. Hosted
gateway/key behavior, configured grants/exposure/publications, pooler/request
timeouts and managed operations need an approved isolated target if those differ
from the runner configuration. Production existing-record conflicts have not been
measured; production preflight, recovery and rollout require separate approval.

Physical iOS/Android keyboard, installed-PWA, network transitions, backgrounding,
actual Pages clean-URL hosting and off-LAN reloads remain device/staging checks.
Synthetic webhooks do not establish provider-connected delivery or actual Stripe
resource hydration. No payment transaction was created; provider-connected test
validation remains separate. Pending inbox monitoring/reconciliation ownership,
old-handler maintenance order and accepted client-telemetry anti-cheat scope also
remain release decisions. Passing CI does not authorize deployment or merge.
