# Phase 1: security and game integrity

Development branch: `phase1/game-integrity-hardening`. This document records the
intentional behavior changes, test boundaries, and release procedure. Nothing in
this phase authorizes deployment, hosted database changes, or payments.

## Reward verification

Cause: custom/race completion payloads bypassed the challenge gate and reached a
legacy SQL function that incremented stats, awarded achievements, and minted
coins/tickets from client metrics.

Online custom games and multiplayer races now remain playable as **practice**:
they do not award account XP, achievements, coins, tickets, or leaderboard stats.
Race results and winners are still saved by the race path. NPC and Plinko remain
practice. Existing balances, stats, achievements, history, and local-only guest
progress are preserved. This is a deliberate necessary rule change: account
rewards cannot be safely preserved through the unchallenged legacy route.

Challenge-backed Word, Context, Sentence, Evil, Daily and Tournament reward
formulas are preserved. Saves require non-null, consistent metrics and the
authenticated user's issued, unexpired challenge. A challenge has at most one
result. Exact retries return a verified saved outcome with zero new rewards;
changed payloads or another round ID cannot replace a saved completion.

The frontend distinguishes verified, practice, unverified, and failed-save
outcomes. Unknown server responses never imply confirmed account rewards.

These checks reject arbitrary/challenge-free minting and impossible metrics.
They do not prove that a human typed the input: plausible client-reported metrics
and automation remain an anti-cheat limitation. Stronger telemetry is separate
from closing these four P1 paths; do not advertise attested human gameplay.

## Local tests

`npm ci && npm run test:phase1` runs executable Node fixtures and in-memory
PostgreSQL through PGlite. The harness always creates a fresh local database and
does not accept hosted connection strings. It applies the bootstrap and all
ordered migrations unchanged, with minimal Supabase Auth/Storage schema stubs.
Application SQL, permissions, constraints and transactions run on PostgreSQL.

PGlite serializes queries on one connection. Concurrently scheduled requests test
replay/final-state behavior, but do not establish native multi-session lock
contention or deadlock behavior. Those checks require an isolated full Supabase
or PostgreSQL environment and two authenticated users before deployment.

## Task 2: atomic multiplayer receipts

Previously the gateway updated the player, queried the opponent and finalized the room in separate requests; errors on several writes were unchecked. Both friend and Quick Match finishes now lock the room before the participant in a single transaction. Cancelled, countdown, missing, malformed and unauthorized rooms reject results. An exact retry reads the original receipt; different metrics cannot replace it. Rank uses score, then duration, then errors; identical metrics produce a draw. Creating a friend race and its two participants is atomic too.

Races retain their targets, matchmaking and result history. They do not award account progression (Task 1). The frontend rounds milliseconds for the integer RPC, retains a retry payload and restores a finished receipt on reconnect. A replay needs a new room. Local tests cover both race types, invalid/cancelled submissions, exact retry, replacement attempts, reconnect receipts, ordered ties, authentication and concurrently scheduled finishes. Separate-connection contention still requires staging PostgreSQL testing.

## Task 3: durable Stripe reconciliation

Cause: refund/dispute RPCs inserted an event as processed before finding an order, then returned `ignored` when the PaymentIntent had not been linked. Retrying that event could never apply it.

The additive inbox stores received time, payload, pending/applied state, attempts and application error. API responses distinguish `pending`, `applied` and `already_processed`. Unmatched adjustments remain pending. Credit, adjustment and reconciliation calls serialize by PaymentIntent and lock the order; credit runs before pending adjustments regardless of arrival order. Failed application rolls back its subtransaction and leaves a durable pending record; webhook application/database errors return 500 for delivery retry. A service-only reconciliation RPC can retry a known intent without deleting history.

Checkout binds the signed metadata order ID if its webhook arrives before session attachment. Legacy session-only pending credits drain on attachment. Crediting validates the original order snapshot, so a later catalog change cannot change the purchase. Completed orders and unique provider objects prevent double credits/adjustments, including partial refunds rounded to zero coins. Adjustment balances are recomputed from unique objects; overlapping refunds and dispute holds cannot reverse more than the purchased pack. Dispute wins restore only the remaining hold. Existing debt-aware wallet helpers and purchase history remain intact.

The webhook verifies the raw-body signature before processing, retrieves current refund/dispute objects to avoid stale snapshots, and guards terminal-state regression during overlapping delivery. Stripe documents unordered delivery and warns against using second-resolution event timestamps to infer order: [Stripe webhook documentation](https://docs.stripe.com/webhooks#event-ordering).

Checkout, refund and webhook functions now require test secret/restricted keys; live events reject even when an old `STRIPE_LIVE_ENABLED` secret is true. No settings or credentials were changed, and tests never invoke a Stripe payment/refund API. Restricted test keys need the relevant read permissions for canonical object retrieval. Old gateways must be stopped during rollout: their compatibility SQL wrappers cannot infer a Stripe object's live mode, so the new Edge guards are mandatory.

Historical events discarded by the old implementation are preserved but are not automatically reconstructed: old payloads omit amounts/status. After explicit approval, inspect affected test PaymentIntents and replay authenticated events or submit canonical test objects through the restricted ingress. Do not delete old `payment_events`, adjustment records or ledger rows. The unique intent index deliberately fails deployment if historical duplicate bindings exist; review and reconcile those before migrating.

## Task 4: tournament runs and eligibility

Cause: built-in resets deleted registrations and reopened the same tournament ID without invalidating issued challenges. Finishing an old challenge could award ordinary round rewards and overwrite a newly registered entry.

Tournaments and entries now carry a run UUID, issued challenges/results carry the tournament run UUID, and completion checks the current run before doing any reward write. Start, finish, cancel/reset and award operations lock the tournament before challenges/entries/wallets. Completion requires a running tournament and an eligible current-run entry with no score, and checks that exactly that entry saves. Duplicate saved receipts issue no rewards; receipts from a previous run reject after reset. Awarding requires a completed top score from the running current run.

Reset rotates the run, archives standings and abandons outstanding challenges before deleting entries. Cancel/close/delete also invalidate outstanding challenges. Reopening a closed/cancelled event, or moving a running event back to registration, rotates its run automatically. Prior custom-event standings are retained in private run history before a fresh registration replaces the entry. The existing built-in reset archives and unused-registration ticket refunds remain; only current-run registrations are refunded. Frontend/admin snapshots show current-run entries so old scores do not block re-registration or appear as current standings.

Deploying this migration abandons legacy outstanding tournament challenges, which had no reliable run ID. Their participants retain registrations and must start a fresh challenge. Existing completed scores, XP, achievements, wallets, purchases and archives are preserved. Legacy completed scores are retained as history, not retroactively attested. Targets and reward formulas are unchanged; variable tournament sentence lengths and human-typing attestation remain separate concerns.

## Combined verification and release limits

The final fixtures execute the actual game keyboard completion code against a stub DOM and real local PostgreSQL RPCs for Word, Context, Sentence, Evil and Daily. They also exercise Custom/NPC practice, unknown/failed responses, immutable race reconnects and exact failed-save retry. Sentence phrase-acceptance SQL tests preserve reduced scoring and true input counts. Perfect-round validation checks the score's streak bonus, clue flag, increments and minimum possible key count; impossible combinations reject without rewards. All security-definer functions introduced/replaced by Phase 1 use an empty search path and fully qualified application objects. Browser roles cannot invoke the mutations/internal helpers or read the Stripe inbox/run archives.

Before release, use an isolated full Supabase project to verify native multi-connection contention (both race finishes, same challenge retry, reset versus finish, credit versus adjustment), actual JWT/PostgREST routing, Realtime updates, Auth/Storage policies, two-account friend/Quick Match UX, and physical iOS/Android installed-PWA keyboard/reconnect behavior. Local Auth/Storage stubs and DOM fixtures do not establish these results. The implementation and local checks did not change hosted databases, credentials, payments, Stripe settings or deployments.

## Deployment sequence — approval required

1. Review the development commits; back up database schema/data and retain ledger/order/event history. In a separate staging Supabase project, run the bootstrap plus all migrations and the test suite. Preflight duplicate non-null `round_results.challenge_id` and `payment_orders.provider_payment_intent_id` values; new unique indexes intentionally fail on conflicts. Review any historical ignored adjustments and overlapping legacy refund/dispute counters. Do not silently delete conflicting records or reset balances.
2. Put game result/tournament mutations and checkout/refund operations into a controlled maintenance window. Keep webhook delivery retries available with a temporary retryable response while replacing the handler; do not discard deliveries. This is mandatory because the old race gateway writes tables directly, and old Stripe handlers lack the new beta live guards.
3. Apply, in order: `20261009231001_phase1_reward_verification.sql`, `20261009231247_phase1_atomic_race_results.sql`, `20261009231719_phase1_stripe_event_reconciliation.sql`, `20261009232126_phase1_tournament_run_isolation.sql`. Check grants, RLS, indexes, the new inbox/archive tables, and PostgREST schema reload. Every earlier deployed migration remains unchanged.
4. Deploy the reviewed `game-api`, `create-checkout-session`, `refund-payment` and `stripe-webhook` functions. Confirm existing payment credentials are test credentials and verify the beta rejects live mode; any secret/configuration change needs separate explicit approval. Never test a real payment or refund in production.
5. Publish the frontend only after explicit approval, using the updated asset query versions on the 26 pages that load the backend (the release audit covers 27 pages, including the 404 page). Run two-account staging smoke checks for verified saves, practice, race retry/reconnect and tournament reset/re-registration. Verify an isolated signed test event's received/pending/applied/duplicate lifecycle and pending reconciliation before restoring traffic.
6. Monitor pending inbox rows/last errors and ledger/order consistency. If unmatched events remain after a credit/link, review their PaymentIntent and run the service-only reconciliation RPC in the approved environment. Reconcile historical ignored events separately from current traffic using authenticated canonical test objects. No scheduler or hosted service was configured by this phase.

## Rollback and recovery

Prefer maintenance plus a corrective forward migration/function deployment. Do not restore the vulnerable reward, race or adjustment handlers, delete the inbox, rewind run IDs or reopen old challenges. A frontend rollback can keep the hardened backend, but may lose the clearer save labels and receipt UX; verify compatibility before enabling traffic. Retain all additive columns, archives, events, receipts and ledger rows through recovery.

Before retrying a payment recovery, compare order snapshots, unique provider object records, wallet debt and ledger deltas. Exact event/receipt retries are safe; replacement metrics/event bindings reject. A failed Stripe application stays pending and exposes its error. An already-applied credit's retry still drains pending adjustment failures without crediting twice. Do not mark pending rows applied manually, remove duplicate guards, replay old currency deltas directly, restore wallet tables independently of the ledger, or re-enable live mode. If a full database restore is unavoidable, reconcile events received after the backup against ledger/order history under explicit approval before reopening traffic.

Readiness: the four P1 paths are implemented and locally testable. Approval for deployment should wait for the isolated native concurrency, Supabase routing and two-user/mobile smoke checks above. This is not a claim of tamper-proof human gameplay or validation of hosted production configuration. Phase 2 was not started.

### Final local verification (October 9, 2026)

- Node.js `v24.21.0`, npm `11.19.0`; clean `npm ci` succeeds and reports zero dependency vulnerabilities.
- `npm run test:phase1`: **37 passed, 0 failed** (9 reward, 5 race, 10 Stripe, 8 tournament/upgrade/permission, 5 frontend tests). Negative signature/database failures logged by fixtures are expected assertions, not unhandled test failures.
- `python3 scripts/audit.py`: **passed**, 27 HTML pages, all 17 existing regression scripts (18 reported checks), shared assets, links, export/API references, CSS structure, PWA/clean URL and secret checks.
- `node --check`: **40 JavaScript/CJS files passed**; the audit also checks inline scripts.
- Deno `2.9.6` TypeScript check: **all 5 Edge Functions passed**, including unchanged `delete-account`. Runtime dependencies resolved to Stripe `22.6.2` and Supabase JS `2.117.3` during this check; existing major-range production imports remain.
- Archived per-task commit test runs also passed independently: reward **9/9**, race **19/19**, Stripe **29/29**; the final tournament/combined tree passed **37/37**. These used the same pinned local dependency versions and no hosted connections.
- `git diff --check`: **passed**. The protected local and remote `beta-friends` still point to base `809e4a12bd8a18d070f8612b7e6a380a63fd13b6`.

Interim failures were resolved: a nullable authenticated-user reference in the gateway type check, an invalid Refund `livemode` property assumption (test-key and signed parent-event guards remain), stale asset-version assertions, and fixture DOM/archive-field mismatches. The executable reconnect fixture also exposed and fixed mobile controls remaining visible after restoring a saved race. Native PostgreSQL startup failed at `shmget` under the sandbox, so native multi-session tests remain unexecuted; they were not replaced with a claim that serialized PGlite queries prove concurrency safety.
