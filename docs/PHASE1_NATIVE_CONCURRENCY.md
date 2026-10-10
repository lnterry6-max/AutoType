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
Fixture defaults are an eight-second statement timeout, four-second lock timeout
and 100ms deadlock detection; timeout tests shorten the relevant limit to 150ms.
These settings belong only to the disposable cluster/connections. Production and
hosted database timeout settings were neither read nor changed. Match request
deadlines, retry policy and representative load during approved staging.

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
and checks exact balances, one win and retry behavior.

[Run 508](https://github.com/lnterry6-max/AutoType/actions/runs/38016667963)
passed all 12 initial native cases, including the fixed award ordering, and
confirmed a second deadlock in the original Checkout attachment. Its first inbox
scan could be empty, then a legacy session-only event could commit pending while
attachment held the order. A competing metadata credit held the intent and waited
for that order; attachment's second scan then tried to acquire that intent.
An ingress deadlock can be retained as `pending`/`last_error` by the reconciliation
exception block, rather than surfacing as an HTTP/database exception.

`20261010022312_phase1_checkout_lock_snapshot.sql` captures a sorted intent array
before taking the order lock and reconciles only that locked set. An exact
attachment retry also drains its captured pending events. Late arrivals outside
the set remain durable and are handled by delivery/attachment retry or the existing
service-only reconciliation RPC. The fixed late-arrival interleaving is repeated
three times, including a late event with no competing credit and recovery by exact
attachment retry. Additional cases cover concurrent stale/terminal fake disputes
and four distinct game modes updating one player's counters.

[Run 510](https://github.com/lnterry6-max/AutoType/actions/runs/38016971919),
implementation/test commit `db234e5616939c04482ccbae3d4a788a7a22c3d5`, passed:

- **15 native cases, 0 failures**, PostgreSQL 16.15, distinct real backend
  connections and controlled waits. The bootstrap plus **52 migrations** applied
  successfully: 46 prior, four original Phase 1 and two corrective migrations.
- **37 Phase 1 regressions, 0 failures**, Node 22, locked `npm ci`, lifecycle
  scripts disabled and `npm run test:phase1` without external networking.
- **Release audit passed**, 27 HTML pages and existing regression checks.

The two original functions are restored only temporarily inside disposable
fixtures to prove the tests detect the old failures. Fixed contention cases
then execute the final migrated functions and pass without deadlock. Forced
SQLSTATE `55P03` lock timeout and `57014` statement timeout roll back partial
round writes; fake Stripe lock-timeout application retains its error pending,
rolls back order/wallet/ledger writes, and retries once safely. No server-side
automatic retry was added: tests explicitly retry immutable receipts/events.

Late legacy events can remain pending even after a competing metadata credit:
that credit may have scanned the legacy row before the session binding became
visible. The exact attachment/event retry or service-only reconciliation drains
the row without a second credit. Monitoring and reconciliation ownership remain
release requirements; an HTTP 200/pending acknowledgement is not final settlement.

The initial native runs fixed fixture-only setup/decoder/assertion issues before
the final pass. No additional financial/accounting defect was found in the tested
matrix. Small synthetic fixtures and controlled interleavings are bounded
evidence, not an exhaustive load test or proof that every transaction pairing
is deadlock-free.

## Migration review

Both corrections replace existing functions only: no tables/columns/indexes,
credential changes, data deletion, wallet reset or history rewrites. Existing
function signatures and service-only execution grants remain. Prize eligibility,
reward amounts, ledger/audit writes and session/user/order binding checks remain.
The award now fails closed if the winner's stats row is missing; target preflight
must review missing stats/wallet support records in addition to uniqueness gates.
The Checkout array is sorted and never expands after the order lock. All prior
migration files retain their committed contents. Apply both corrections after
the four original Phase 1 files in any separately approved target.

## Remaining staging requirements

Native PostgreSQL alone cannot verify Supabase JWT/Auth lifecycle, PostgREST
schema exposure, hosted grants and RLS configuration, Storage or Realtime,
two-account multiplayer UI or physical iOS/Android/PWA reconnection. PostgreSQL 16
on the runner also does not establish the previously inventoried hosted PostgreSQL
17 environment's behavior. Existing-record migration preflight and real signed
Stripe **test** webhook hydration/delivery still need an approved isolated staging
environment. No production configuration was inspected or changed in this work.
