# Phase 1 native PostgreSQL concurrency validation

## Environment and boundaries

The Mac has no system PostgreSQL commands or Docker. A previously downloaded
PostgreSQL 18.4 bundle is present, but this Codex sandbox denies `shmget` during
`initdb`, including with mmap settings. No additional software was installed.
The user approved using the existing GitHub Actions runner instead.

`scripts/test_phase1_native.py` uses Python's standard library and installed
libpq. It creates a new private cluster under `/tmp`, disables TCP listening,
rejects host authentication and uses only its own private Unix socket. It cannot
accept a database URL, existing cluster, credentials or production connection.
It applies the bootstrap, every existing migration and all four Phase 1 migrations
in order, then stops the server and removes its synthetic cluster on exit.
Auth and Storage schemas are fixture stubs; this is native PostgreSQL validation,
not hosted Supabase Auth/PostgREST/Realtime validation.

The additional `Phase 1 native PostgreSQL concurrency` job uses preinstalled
PostgreSQL 16 on `ubuntu-24.04`. Server and client processes run as the runner
user in one network namespace with external networking disabled. It installs no
packages or images and receives no Supabase/Stripe secrets. The release audit and
the 37-test `npm ci` / `npm run test:phase1` job remain separate required evidence.

## Executable coverage

Each worker owns a distinct libpq connection and backend PID. Thread barriers
start competing calls together; `pg_blocking_pids` verifies controlled lock waits.
Tests use bounded statement/lock timeouts and PostgreSQL's real deadlock detector.

- Original tournament award versus normal round save for one player: reproduce
  the inherited wallet/stats lock inversion, assert SQLSTATE `40P01`, retry the
  aborted operation and check one prize, one result and one win.
- Simultaneous two-player finishes, duplicate race retries, immutable metrics,
  stable winner and tie; no account reward mutations from race practice.
- Six simultaneous identical round receipts, and six conflicting receipt IDs
  for one challenge; exactly one reward and one verified round.
- Reset wins versus completion, and completion wins versus reset: stale-run
  rejection, no partial account writes, preserved completed rewards and fresh
  re-registration/challenge.
- Forced round lock and statement timeouts: rollback consumed challenge/result,
  stats, achievements, wallet and ledger; exact retry commits once.
- Fake early refund, concurrent duplicate credits/refunds, unique adjustment
  objects and reconciliation; fake PaymentIntent cannot bind to two orders.
- Forced Stripe wallet lock timeout: retain pending error while rolling back
  order/credit/ledger; event retry applies once.
- Browser-role denial for the private inbox/archive and payment ingress RPC.
- Late pending legacy Checkout event arriving between attachment's first and
  second inbox scans: investigate the intent/order lock inversion with a
  temporary fixture-only trigger and real competing transactions.

All Stripe payloads are synthetic SQL fixtures. No Stripe SDK request, webhook
delivery to a hosted service, financial transaction or production data is used.

## Results

[Initial native evidence](https://github.com/lnterry6-max/AutoType/actions/runs/38016538704)
ran PostgreSQL **16.15**, applied the bootstrap plus all 50 existing/Phase 1
migrations, and reproduced the award/normal-save deadlock as SQLSTATE `40P01`.
Race finishes, both reset/completion orderings and timeout rollback passed.
The run also exposed fixture decoder/error-message issues, now corrected; that
initial run is not a full-suite pass.

`20261010022038_phase1_native_lock_order.sql` adds a forward migration that takes
the winner's stats lock before wallet credit, matching verified/sentence saves.
It preserves staff/current-run/top-score eligibility, rewards, private execution
grants and the empty function search path. Prior migrations are unchanged.
Native regression coverage repeats the forced award/round contention three times
and checks exact balances, one win and retry behavior. Full fixed-suite evidence
and the late-Checkout investigation are pending the next Actions run.

## Remaining staging requirements

Native PostgreSQL alone cannot verify Supabase JWT/Auth lifecycle, PostgREST
schema exposure, hosted grants and RLS configuration, Storage or Realtime,
two-account multiplayer UI or physical iOS/Android/PWA reconnection. PostgreSQL 16
on the runner also does not establish the previously inventoried hosted PostgreSQL
17 environment's behavior. Existing-record migration preflight and real signed
Stripe **test** webhook hydration/delivery still need an approved isolated staging
environment. No production configuration was inspected or changed in this work.
