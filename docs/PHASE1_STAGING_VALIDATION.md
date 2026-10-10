# Phase 1 independent review and staging validation

Status: **plan only; staging checks below have not been executed**. Review branch:
`phase1/game-integrity-hardening`; draft PR target: `beta-friends`.

The branch push and draft PR are authorized. Merging, deployment, hosted migrations,
production settings, credentials changes, real payments and paid infrastructure are
not authorized. Use an existing explicitly approved isolated staging environment;
otherwise pause before provisioning or applying anything. Create synthetic accounts
and fixtures only. Do not clone private production user records into staging.

## Evidence available to reviewers

On October 9, 2026, Node 24.21.0/npm 11.19.0 ran all **37 Phase 1 tests successfully**.
`python3 scripts/audit.py` passed for 27 HTML pages and the existing regression checks.
All 40 JavaScript/CJS files passed syntax checks; Deno checked all five Edge Functions.
Tracked-file scans found no credential-pattern matches, environment files, local
databases, logs, dependency directories or duplicate/generated migration copies.
The existing browser Supabase publishable configuration is public client configuration,
not a privileged secret. Package manifests/lockfile are intentional reproducible test
inputs, not generated build output.

These results exercise real application SQL in PGlite with Auth/Storage stubs and a
stub DOM. They do **not** establish native PostgreSQL lock behavior, hosted JWT/RLS/
Realtime behavior, or physical mobile/PWA behavior. The PR workflow now runs separate release-audit and Phase 1 checks for every PR
targeting beta-friends, including drafts and retargeted PRs. It uses npm ci, then
npm run test:phase1 in a network namespace with no network interfaces. The npm
script self-checks and preloads a network guard; each worker uses an in-memory
PGlite database and injected Auth/Stripe fixtures. No service secrets or Git
credentials are supplied to the tests. Dependency installation uses npm registry
access before test execution, with package lifecycle scripts disabled.

Review the implementation and limitations in [PHASE1_HARDENING.md](PHASE1_HARDENING.md).
All four Phase 1 migrations are additive files; no earlier migration was edited.

## Environment and evidence rules

- Record the reviewed commit, PostgreSQL/Supabase versions, migration versions/checksums,
  Edge Function versions and frontend asset versions before testing. Use that same
  commit throughout a validation run.
- Use synthetic users A and B, an unrelated user C, a separate synthetic staff account,
  synthetic wallets/rounds/rooms/tournaments, and fake order/event/provider identifiers.
  Isolate the frontend from production URLs before logging in or playing.
- Keep the service-role key and Stripe signing/test keys server-side. Do not put JWTs,
  cookies, Authorization headers, raw secrets or private records in PR evidence.
- Record test ID, environment, UTC time, expected/actual outcome, database invariant,
  pass/fail and evidence location. Summarize counts and use synthetic identifiers.
- No tests below authorize purchases, payment/refund API creation, production writes,
  hosted settings changes or infrastructure purchases. Real Stripe API reads, if needed
  for canonical test objects, must be restricted to an approved test environment.

## Migration preflight and upgrade review

Run preflight read-only as an authorized administrator in the approved target, before
maintenance or migration application. Export only aggregate counts; review any affected
records in place under separate authorization. These queries use the legacy schema:

```sql
begin transaction read only;
-- Both uniqueness gates must have zero conflicting groups.
select count(*) as duplicate_challenge_groups from (
  select challenge_id from public.round_results where challenge_id is not null
  group by challenge_id having count(*) > 1
) conflicts;
select count(*) as duplicate_intent_groups from (
  select provider_payment_intent_id from public.payment_orders
  where provider_payment_intent_id is not null and provider_payment_intent_id <> ''
  group by provider_payment_intent_id having count(*) > 1
) conflicts;
-- Empty bindings are excluded from the intent index, but need lifecycle review.
select count(*) as empty_intent_bindings from public.payment_orders
where provider_payment_intent_id = '';
select count(*) as finalized_orders_missing_binding from public.payment_orders
where completed_at is not null and
  (nullif(provider_payment_intent_id, '') is null or
   nullif(provider_session_id, '') is null);
select count(*) as adjustment_counter_conflicts from public.payment_orders
where coins_reversed + dispute_coins_reversed > coins
   or refunded_amount_cents > amount_cents;
select count(*) as adjustment_snapshot_conflicts
from public.payment_adjustments a join public.payment_orders o on o.id=a.order_id
where a.amount_cents > o.amount_cents or
  (a.kind='refund' and a.status not in ('pending','requires_action','succeeded','failed','canceled')) or
  (a.kind='dispute' and a.status not in ('warning_needs_response','warning_under_review',
    'warning_closed','needs_response','under_review','won','lost'));
select count(*) as legacy_tournament_attempts_to_abandon
from public.round_challenges where mode='tournament' and status='issued';
select count(*) as orphan_tournament_entries
from public.tournament_entries e left join public.tournaments t on t.id=e.tournament_id
where t.id is null;
select count(*) as missing_player_support_rows from public.profiles p
left join public.wallets w on w.user_id=p.id
left join public.player_stats s on s.user_id=p.id
where w.user_id is null or s.user_id is null;
rollback;
```

Additional review gates:

1. Check the migration history matches the unchanged bootstrap/prior migrations and
   contains none of the four new versions already applied under different contents.
   Review collisions with the new inbox/archive tables, run columns, function signatures,
   triggers and index names. A same-named `round_results_single_challenge_idx` must have
   the intended unique definition: `IF NOT EXISTS` alone does not verify an old object.
2. Validate existing indexes, foreign keys, status constraints, RLS, ownership and
   grants/default privileges. Compare actual function definitions and grants, including
   legacy Stripe wrappers, against the reviewed SQL. No anon/authenticated role should
   execute privileged mutation helpers or read the private inbox/run archive.
3. Compare payment order snapshots, unique provider adjustment objects, order reversal
   counters and ledger/wallet debt invariants. Counter sums below the pack limit can
   still disagree with legacy ledger history; the aggregate check is not a reconciliation.
   Do not delete duplicates, reset balances or manually mark events applied to pass.
4. Historical `payment_events` marked processed before an order existed may have no
   matching adjustment and insufficient amount/status data. Review their provenance and
   canonical **test** objects before any approved replay. Do not replay historical live
   events through these test-only handlers. Preserve events, adjustments and ledger rows.
5. The tournament migration intentionally abandons all legacy issued tournament
   challenges. Count them, communicate that a fresh attempt is required, and verify
   registrations/completed scores and rewards remain intact. Entries receive the current
   run UUID; completed legacy results are not retroactively attested.
6. In approved staging, test both fresh installation and a synthetic legacy upgrade.
   Seed conflict fixtures deliberately; confirm migration failure prevents rollout,
   with no hidden cleanup or partial unintended state. Verify actual migration runner
   transaction behavior and a reviewed backup/forward-recovery procedure.

Apply only after staging authorization, in this order:

1. `20261009231001_phase1_reward_verification.sql`
2. `20261009231247_phase1_atomic_race_results.sql`
3. `20261009231719_phase1_stripe_event_reconciliation.sql`
4. `20261009232126_phase1_tournament_run_isolation.sql`

Recheck grants, RLS, unique indexes, triggers, PostgREST schema reload and migration
history. Large-table index building and challenge/entry updates take locks: measure
runtime on representative synthetic volume before choosing a maintenance window.
No production volume or preflight result has been established by local tests.

## Native PostgreSQL concurrency and retries

Use independent native PostgreSQL connections, not one PGlite connection. Use two
worker sessions and an observer; bound lock/statement timeouts and record blocked
sessions via `pg_stat_activity`/`pg_locks` with approved diagnostic permissions.
Use transaction barriers to prove overlap, then release locks; repeat with the workers
reversed and both submission orders. Re-run critical cases through authenticated Edge
requests as well as direct service-role SQL in the isolated environment.

| ID | Scenario | Required result/invariant |
| --- | --- | --- |
| PG-1 | Friend race and Quick Match: A/B finish together; hold room lock to demonstrate the second transaction waits | Exactly one immutable result per player; room finalizes once; consistent winner by score, duration, errors; identical metrics draw |
| PG-2 | Same player submits exact result concurrently, then changes metrics | Exact retry returns original receipt with no extra mutation; changed payload rejects; opponent result unchanged |
| PG-3 | Drop response after commit; retry identical payload; reload/reconnect | Receipt remains readable and immutable; no replay of the finished room; fresh room required |
| PG-4 | Finish versus room cancellation; missing/countdown/malformed room; unrelated participant | A serialized valid outcome or explicit rejection, no partial player/room writes or rewards |
| PG-5 | Same challenge/round retry concurrently, including two distinct round IDs for one challenge | One result/reward only; exact retry adds zero; replacement rejects; rollback on validation failure |
| PG-6 | Tournament reset/cancel versus finish; two resets; award versus reset and non-tournament round save | Valid serial outcome with run isolation; no stale rewards, double refunds, mixed standings or deadlocks |
| PG-7 | Stripe credit versus adjustment/reconciliation; same event/object on two connections | One credit, bounded reversal, durable pending/error state; safe retry; no deadlock |

A statement timeout must leave no partial writes. Retry only immutable payloads and
retryable transport failures. Check ledger/stat/wallet deltas before and after each
case. A scheduled `Promise.all` without separate sessions is not concurrency evidence.

## Supabase Auth, RLS, permissions and multiplayer

| ID | Scenario | Required result |
| --- | --- | --- |
| SB-1 | Real staging Auth signup/login, refresh, logout, expired/malformed JWT; user-ID spoof in body | Edge gateway uses verified identity; invalid auth rejects; account recovery/redirect stays on staging |
| SB-2 | anon, A, B, C call privileged RPCs directly or access private inbox/history | Privileged calls/data denied; service-only outer RPC allowed; internal helpers remain owner-only |
| SB-3 | A reads/writes B's wallet, stats, orders, adjustments, challenges, entries and race membership via REST | Only intended reads permitted by existing policies; reward/balance/status spoof writes denied; inspect actual hosted grants/RLS, not only browser UI |
| SB-4 | A/B friend race and Quick Match with two browsers; C tries joining/submitting/reading private receipts | Authorized pair receives targets, progress and identical winner; outsider cannot mutate or obtain protected data |
| SB-5 | A/B disconnect/reconnect, token refresh, tab background, repeated finish and opponent disconnect | Realtime/subscriptions recover without duplicated listeners; saved receipt restored; failed-save retry clear; no account rewards for practice races |
| SB-6 | Word/Context/Sentence/Evil/Daily verified saves; Custom/NPC practice; unknown response; rejected save | Existing verified formulas preserved; practice earns no account XP/currency/achievements; unknown/failed responses never report earned rewards |

Test real PostgREST overload resolution, schema cache and Realtime publications/policies.
Do not infer protection from service-role tests, since that role bypasses RLS.

## Tournament run lifecycle

Create a synthetic tournament and two registrations. Start an issued challenge, reset
with the synthetic staff identity, and save its old payload after fresh registration.
Require old submission/retry to reject without wallet/stat/achievement/entry changes;
require a new challenge to contain the new run UUID and complete once. Inspect private
archives with the approved service role; prior standings must remain available.

Repeat for built-in reset (unused registration ticket refunds exactly once), custom
reopen, cancellation/close/delete, withdrawn/disqualified/missing entry, expired
challenge and a completed previous-run receipt. Current-run exact retries add no
rewards. Award only the current running run's completed top scorer, once. Non-staff
reset/award requests reject. Check variable Sentence tournament scoring and both
players' registration/standings screens as well as SQL invariants.

## Stripe simulated/test-only event validation

Default to locally signed fixtures with fake provider IDs and a stub canonical-object
reader, as in `scripts/phase1-stripe.test.cjs`. Hosted endpoint checks require an approved
isolated handler/test environment. Stripe CLI/provider-generated test events may not
match AutoType's order metadata: seed synthetic order snapshots and use matching signed
fixture events. If canonical refund/dispute reads are needed, use existing authorized
**test** objects or a local mock; do not create a charge/refund/payment to satisfy a fixture.

| ID | Scenario | Required result |
| --- | --- | --- |
| ST-1 | Bad/missing signature, altered raw body, mock live-key configuration, `livemode:true`, old live-enable flag | Reject before credit/adjustment; test-only guard cannot be bypassed; no live credentials needed for this test |
| ST-2 | Refund/dispute before order link/credit, then credit; credit before session attachment | Early event retained pending; signed order snapshot binds correctly; credit once and drains pending adjustments |
| ST-3 | Same event repeated; different events for same refund/dispute object; concurrent duplicate delivery | Applied/already-processed receipts; one provider object effect and one purchase credit |
| ST-4 | Partial/full refunds, zero-coin rounding, refund/dispute overlap, dispute win/loss/warning states; reversed delivery order | Recomputed combined reversal never exceeds pack; restore only remaining hold; debt-aware wallet/ledger consistent |
| ST-5 | Stale event snapshot with canonical current test status; terminal then stale active status | Canonical retrieval and terminal guard prevent regressing balances/status |
| ST-6 | Inject missing wallet/application failure and database outage, then recover/retry applied credit | Error returns retryable response; pending payload/error retained when transaction can commit; reconciliation drains failure without double credit |
| ST-7 | Wrong user/pack/amount/currency/order/session/intent; changed duplicate identity | No credit; rejected/retained error requires review; original event identity immutable |
| ST-8 | Checkout expiry and unknown intent; explicit service reconciliation; replay legacy session-only event | Only pending order cancels; unresolved intent stays visible; reconciler permission enforced; attachment drains compatible pending credit |

Inspect inbox state/attempts/error, payment order snapshot, event/object uniqueness,
ledger deltas and wallet debt together. The 200 response for an unresolved but durably
stored event must not be mistaken for applied funds. Demonstrate a documented operational
owner and reconciliation procedure: Phase 1 did not configure a hosted scheduler.

## Physical mobile and installed PWA

Use physical iPhone/iPad Safari (browser and Add to Home Screen), Android Chrome
(browser and installed PWA), plus a desktop baseline. Record OS/browser versions.
Serve staging with valid HTTPS and correct staging Auth redirects; do not change
production app/site settings for these tests.

- Complete each verified mode and practice Custom/NPC/race; verify scores, phrase input,
  clue usage, errors/backspace, DONE overlay, progression labels and keyboard behavior.
- Finish and reload/reconnect a saved race: mobile input/controls stay hidden, receipt
  and winner restore, and a fresh race requires a new room.
- Test airplane mode mid-round/at save, Wi-Fi-to-cellular transition, lost response after
  commit, background/foreground and app restart. Never imply rewards before confirmation;
  identical retries cannot double-save. Record what survives restart versus in-memory retry.
- Check portrait/landscape, safe areas, browser chrome/keyboard resize, touch targets,
  hardware keyboard, zoom, VoiceOver/TalkBack and reduced motion. Focus should remain usable.
- Navigate/deep-link/reload clean GitHub Pages URLs, legacy HTML URLs, query/hash, auth
  redirects and 404 in browser/PWA. Confirm current assets after an upgrade; the worker
  intentionally does not provide offline request interception. Offline failure must be clear.
- Recover multiplayer subscriptions with two physical devices and two synthetic accounts;
  validate neither reconnect nor stale cache bypasses the server's run/receipt checks.

## Release gates and rollout review

Every matrix case needs evidence and an owner. Failures block release; unexecuted cases
remain open. Current blockers are native concurrency, hosted Auth/RLS/permissions and
two-user Realtime, physical devices, target preflight/migration dry run, and Stripe
signed-event/reconciliation validation in the chosen isolated staging environment.
Historical data conflicts may add blockers; none have been measured on a hosted database.
Plausible forged client telemetry remains an anti-cheat limitation, not proof of human
input. Reviewers must accept that scope or require further work before competitive release.

Before any deployment approval, agree the maintenance sequence for old game/tournament
and payment handlers, retryable webhook delivery, backup/recovery, pending-inbox monitoring
and reconciliation ownership. Old SQL compatibility wrappers cannot themselves infer
Stripe live mode; old gateways must not remain active alongside the new database paths.
Keep ledger/history/additive columns during forward recovery. See the hardening document
for the ordered rollout and rollback cautions. Stop after review/plan publication and
wait for explicit approval before applying migrations, deploying, merging or publishing.
