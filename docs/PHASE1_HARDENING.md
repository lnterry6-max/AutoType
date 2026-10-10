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

The webhook verifies the raw-body signature before processing, retrieves current refund/dispute objects to avoid stale snapshots, and guards terminal-state regression during overlapping delivery. Stripe documents unordered delivery and warns against using second-resolution event timestamps to infer order: https://docs.stripe.com/webhooks#event-ordering.

Checkout, refund and webhook functions now require test secret/restricted keys; live events reject even when an old `STRIPE_LIVE_ENABLED` secret is true. No settings or credentials were changed, and tests never invoke a Stripe payment/refund API. Restricted test keys need the relevant read permissions for canonical object retrieval. Old gateways must be stopped during rollout: their compatibility SQL wrappers cannot infer a Stripe object's live mode, so the new Edge guards are mandatory.

Historical events discarded by the old implementation are preserved but are not automatically reconstructed: old payloads omit amounts/status. After explicit approval, inspect affected test PaymentIntents and replay authenticated events or submit canonical test objects through the restricted ingress. Do not delete old `payment_events`, adjustment records or ledger rows. The unique intent index deliberately fails deployment if historical duplicate bindings exist; review and reconcile those before migrating.
