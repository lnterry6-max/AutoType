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
