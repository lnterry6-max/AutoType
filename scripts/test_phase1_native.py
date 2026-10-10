#!/usr/bin/env python3
"""Native PostgreSQL contention tests; stdlib + an already installed libpq only.

This entry point ALWAYS creates its own disposable cluster. It accepts a binary
directory, never a database URL, hosted key, existing data directory or password.
Auth/Storage are schema stubs, not a substitute for full Supabase staging.
"""
import argparse
import concurrent.futures
import ctypes
import ctypes.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
BUILTIN = "11111111-1111-4111-8111-111111111111"
BASELINE = ROOT / "supabase/migrations/20261009232126_phase1_tournament_run_isolation.sql"
STRIPE_BASELINE = ROOT / "supabase/migrations/20261009231719_phase1_stripe_event_reconciliation.sql"


class DatabaseError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(f"{code}: {message.strip()}")


class Connection:
    """Small libpq adapter with bound parameters and one connection per worker."""
    def __init__(self, cluster, name="fixture"):
        self.pq = cluster.pq
        self.handle = self.pq.PQconnectdb(cluster.dsn.encode())
        if self.pq.PQstatus(self.handle) != 0:
            message = self.pq.PQerrorMessage(self.handle).decode()
            self.close()
            raise RuntimeError(message)
        self.query("set application_name=" + "'" + name + "'")
        self.query("set statement_timeout='8s'; set lock_timeout='4s'; set deadlock_timeout='100ms'")
        self.pid = int(self.query("select pg_backend_pid() as pid")[0]["pid"])

    def query(self, sql, params=()):
        values = [None if x is None else (json.dumps(x) if isinstance(x, (dict, list))
                  else str(x).lower() if isinstance(x, bool) else str(x)).encode() for x in params]
        if values:
            array = (ctypes.c_char_p * len(values))(*values)
            result = self.pq.PQexecParams(self.handle, sql.encode(), len(values), None, array, None, None, 0)
        else:
            result = self.pq.PQexec(self.handle, sql.encode())
        if not result:
            raise RuntimeError(self.pq.PQerrorMessage(self.handle).decode())
        try:
            if self.pq.PQresultStatus(result) not in (1, 2):
                code = self.pq.PQresultErrorField(result, ord("C"))
                raise DatabaseError(code.decode() if code else "unknown", self.pq.PQresultErrorMessage(result).decode())
            names = [self.pq.PQfname(result, i).decode() for i in range(self.pq.PQnfields(result))]
            return [{name: None if self.pq.PQgetisnull(result, row, col) else
                     self.pq.PQgetvalue(result, row, col).decode()
                     for col, name in enumerate(names)} for row in range(self.pq.PQntuples(result))]
        finally:
            self.pq.PQclear(result)

    def rpc(self, name, args):
        if not name.startswith("autotype_") or not name.replace("_", "").isalnum():
            raise ValueError("Invalid fixture RPC")
        slots = ",".join(f"${i+1}" for i in range(len(args)))
        return json.loads(self.query(f"select public.{name}({slots}) as result", args)[0]["result"])

    def close(self):
        if getattr(self, "handle", None):
            self.pq.PQfinish(self.handle)
            self.handle = None


class Cluster:
    def __init__(self, pg_bin):
        self.bin = Path(pg_bin).resolve()
        for binary in ("initdb", "pg_ctl", "postgres"):
            if not (self.bin / binary).is_file():
                raise RuntimeError(f"Missing preinstalled PostgreSQL binary: {self.bin / binary}")
        # Do not inherit libpq service files, passwords, endpoints or connection options.
        for key in list(os.environ):
            if key.startswith("PG"):
                os.environ.pop(key)
        library = ctypes.util.find_library("pq")
        if not library:
            library = str(self.bin.parent / "lib/libpq.5.dylib")
        self.pq = ctypes.CDLL(library)
        pointer, integer, string = ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p
        signatures = {
            "PQconnectdb": (pointer, [string]), "PQstatus": (integer, [pointer]),
            "PQerrorMessage": (string, [pointer]), "PQfinish": (None, [pointer]),
            "PQtransactionStatus": (integer, [pointer]),
            "PQexec": (pointer, [pointer, string]),
            "PQexecParams": (pointer, [pointer, string, integer, pointer, pointer, pointer, pointer, integer]),
            "PQresultStatus": (integer, [pointer]), "PQresultErrorField": (string, [pointer, integer]),
            "PQresultErrorMessage": (string, [pointer]), "PQnfields": (integer, [pointer]),
            "PQntuples": (integer, [pointer]), "PQfname": (string, [pointer, integer]),
            "PQgetvalue": (string, [pointer, integer, integer]),
            "PQgetisnull": (integer, [pointer, integer, integer]), "PQclear": (None, [pointer]),
        }
        for name, (result, args) in signatures.items():
            fn = getattr(self.pq, name)
            fn.restype, fn.argtypes = result, args
        # Short socket path for macOS, private permissions, outside the checkout.
        self.directory = Path(tempfile.mkdtemp(prefix="autotype-phase1-", dir="/tmp"))
        self.data = self.directory / "data"
        self.socket = self.directory / "socket"
        self.socket.mkdir(mode=0o700)
        self.started = False
        self.dsn = f"host={self.socket} dbname=postgres user=autotype_fixture connect_timeout=5"

    def start(self):
        subprocess.run([str(self.bin / "initdb"), "-D", str(self.data), "--no-locale", "--encoding=UTF8",
                        "-U", "autotype_fixture", "--auth-local=trust", "--auth-host=reject"], check=True,
                       stdout=subprocess.DEVNULL)
        options = (f"-c listen_addresses='' -c unix_socket_directories='{self.socket}' "
                   "-c unix_socket_permissions=0700 -c max_connections=24 -c shared_buffers=32MB")
        subprocess.run([str(self.bin / "pg_ctl"), "-D", str(self.data), "-l", str(self.directory / "server.log"),
                        "-o", options, "-w", "start"], check=True, stdout=subprocess.DEVNULL)
        self.started = True

    def close(self):
        if self.started:
            subprocess.run([str(self.bin / "pg_ctl"), "-D", str(self.data), "-m", "immediate", "-w", "stop"],
                           check=True, stdout=subprocess.DEVNULL)
        shutil.rmtree(self.directory)


FIXTURE_SCHEMAS = """
create role postgres superuser;
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema extensions;
set search_path=public,extensions;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text) $$;
grant usage on schema auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,name text,bucket_id text,owner uuid);
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
"""


def original_function(file, name):
    text = file.read_text()
    begin = text.index("create or replace function public." + name + "(")
    end = text.index("$$;", begin) + 3
    return text[begin:end]


class NativeConcurrency(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = Connection(CLUSTER)
        cls.db.query(FIXTURE_SCHEMAS)
        cls.db.query((ROOT / "supabase/bootstrap/001_backend_foundation.sql").read_text())
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            try:
                cls.db.query(migration.read_text())
            except DatabaseError as error:
                raise RuntimeError(f"Migration {migration.name}: {error}") from error
            print(f"Applied {migration.name}", flush=True)
        print("Native server:", cls.db.query("select version() as version")[0]["version"], flush=True)
        assert cls.db.query("show listen_addresses")[0]["listen_addresses"] == ""

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.connections = []
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=8)

    def tearDown(self):
        # Connections have bounded statements; release fixture locks before joining workers.
        for connection in self.connections:
            if connection.handle:
                self.db.query("select pg_cancel_backend($1)", [connection.pid])
        self.pool.shutdown(wait=True)
        for connection in self.connections:
            connection.close()

    def connection(self, name="fixture_worker"):
        connection = Connection(CLUSTER, name)
        self.connections.append(connection)
        return connection

    def user(self, developer=False):
        identity = str(uuid.uuid4())
        username = "fixture_" + identity.replace("-", "")[:12]
        self.db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
                      [identity, username + "@example.invalid", {"username": username, "display_name": username}])
        if developer:
            self.db.query("update user_roles set role='developer' where user_id=$1", [identity])
        return identity

    def challenge(self, identity, mode="classic", tournament=None):
        challenge = self.db.rpc("autotype_start_round", [identity, mode, tournament])
        self.db.query("update round_challenges set issued_at=now()-interval '20 seconds' where id=$1",
                      [challenge["challenge_id"]])
        return challenge

    def metrics(self, identity, challenge):
        words = len(challenge["target_text"].split())
        score = words * 20 + sum(min(i * 5, 30) for i in range(words))
        return [identity, challenge["challenge_id"], str(uuid.uuid4()), challenge["mode"], score,
                words, 0, words, words * 8, 0, 5000, False]

    def count(self, sql, args=()):
        return int(next(iter(self.db.query(sql, args)[0].values())))

    def snapshot(self, identity):
        return json.loads(self.db.query("""select jsonb_build_object('stats',to_jsonb(s),'wallet',to_jsonb(w),
          'ledger',(select coalesce(jsonb_agg(x order by x.id),'[]'::jsonb) from economy_transactions x where x.user_id=$1),
          'achievements',(select coalesce(jsonb_agg(x order by x.achievement_id),'[]'::jsonb) from user_achievements x where x.user_id=$1)) as value
          from player_stats s join wallets w using(user_id) where s.user_id=$1""", [identity])[0]["value"])

    def blocked(self, connection, blocker=None):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            blockers = json.loads(self.db.query("select to_json(pg_blocking_pids($1)) as pids", [connection.pid])[0]["pids"])
            if blockers and (blocker is None or blocker.pid in blockers):
                return
            time.sleep(0.01)
        self.fail(f"Backend {connection.pid} never reached the required lock barrier")

    def transaction(self, connection, name, args):
        try:
            if connection.pq.PQtransactionStatus(connection.handle) == 0:
                connection.query("begin")
            result = connection.rpc(name, args)
            connection.query("commit")
            return result
        except DatabaseError as error:
            connection.query("rollback")
            return error

    def simultaneous(self, name, args_list, blocker=None):
        connections = [self.connection() for _ in args_list]
        self.assertEqual(len(set(c.pid for c in connections)), len(connections))
        barrier = threading.Barrier(len(connections))
        def run(connection, args):
            barrier.wait(timeout=3)
            return self.transaction(connection, name, args)
        futures = [self.pool.submit(run, c, args) for c, args in zip(connections, args_list)]
        if blocker:
            for connection in connections:
                self.blocked(connection)
            blocker.query("rollback")
        return [future.result(timeout=10) for future in futures]

    def tournament(self, builtin=False, complete=True):
        actor, player = self.user(True), self.user()
        tournament = BUILTIN if builtin else str(uuid.uuid4())
        if builtin:
            self.db.rpc("autotype_reset_builtin_tournaments", [actor])
        else:
            self.db.query("insert into tournaments(id,slug,name,status,max_players,reward_coins) values($1,$2,'Synthetic','open',16,300)",
                          [tournament, "fixture_" + tournament])
        self.db.rpc("autotype_join_tournament", [player, tournament])
        self.db.query("update tournaments set status='running' where id=$1", [tournament])
        challenge = self.challenge(player, "tournament", tournament)
        args = self.metrics(player, challenge)
        if complete:
            self.db.rpc("autotype_record_verified_round", args)
        return actor, player, tournament, challenge, args

    def test_01_reproduce_inherited_award_round_deadlock(self):
        # Only the disposable fixture temporarily restores the original function.
        fixed = self.db.query("select pg_get_functiondef('public.autotype_award_tournament(uuid,text,uuid)'::regprocedure) as body")[0]["body"]
        self.db.query(original_function(BASELINE, "autotype_award_tournament"))
        try:
            actor, player, tournament, _, _ = self.tournament()
            args = self.metrics(player, self.challenge(player))
            a, b = self.connection(), self.connection()
            a.query("begin")
            a.query("select 1 from player_stats where user_id=$1 for update", [player])
            b.query("begin")
            award = self.pool.submit(self.transaction, b, "autotype_award_tournament", [actor, tournament, player])
            self.blocked(b, a)  # Award has the wallet and now waits for stats.
            save = self.pool.submit(self.transaction, a, "autotype_record_verified_round", args)
            outcomes = [award.result(timeout=10), save.result(timeout=10)]
            self.assertEqual([x.code for x in outcomes if isinstance(x, DatabaseError)], ["40P01"])
            print("CONFIRMED: original award/round ordering produces SQLSTATE 40P01", flush=True)
            # The victim rolls back all its writes; retry only that operation.
            for result, name, params in zip(outcomes, ["autotype_award_tournament", "autotype_record_verified_round"],
                                            [[actor, tournament, player], args]):
                if isinstance(result, DatabaseError):
                    self.db.rpc(name, params)
            self.assertEqual(self.count("select tournament_wins from player_stats where user_id=$1", [player]), 1)
            self.assertEqual(self.count("select count(*) from round_results where id=$1", [args[2]]), 1)
            self.assertEqual(self.count("select count(*) from economy_transactions where user_id=$1 and kind='tournament_prize'", [player]), 1)
        finally:
            self.db.query(fixed)

    def test_02_concurrent_race_finishes_and_exact_retries(self):
        for tie in (False, True):
            a, b, race = self.user(), self.user(), str(uuid.uuid4())
            before = self.snapshot(a)
            self.db.query("insert into race_rooms(id,host_id,mode,target_text,status,match_type,created_at) values($1,$2,'context','one two three four','waiting','friend',now()-interval '1 minute')", [race, a])
            self.db.query("insert into race_players(race_id,user_id) values($1,$2),($1,$3)", [race, a, b])
            blocker = self.connection()
            blocker.query("begin")
            blocker.query("select 1 from race_rooms where id=$1 for update", [race])
            aa, bb = [a, race, 110, 5000, 0, 0], [b, race, 110 if tie else 130, 5000, 0, 0]
            results = self.simultaneous("autotype_submit_race_result", [aa, bb, aa, bb], blocker)
            self.assertFalse(any(isinstance(x, DatabaseError) for x in results), results)
            room = self.db.query("select status,winner_id from race_rooms where id=$1", [race])[0]
            self.assertEqual(room, {"status": "finished", "winner_id": None if tie else b})
            self.assertEqual(self.count("select count(*) from race_players where race_id=$1 and finished_at is not null", [race]), 2)
            self.assertEqual(self.snapshot(a), before)
            with self.assertRaisesRegex(DatabaseError, "already finalized"):
                self.db.rpc("autotype_submit_race_result", [a, race, 130, 5000, 0, 0])

    def test_03_duplicate_rounds_and_conflicting_receipts(self):
        for conflicting in (False, True):
            player = self.user()
            args = self.metrics(player, self.challenge(player))
            blocker = self.connection()
            blocker.query("begin")
            blocker.query("select 1 from round_challenges where id=$1 for update", [args[1]])
            payloads = [args[:] for _ in range(6)]
            if conflicting:
                for payload in payloads:
                    payload[2] = str(uuid.uuid4())
            results = self.simultaneous("autotype_record_verified_round", payloads, blocker)
            successes = [x for x in results if not isinstance(x, DatabaseError)]
            self.assertEqual(len(successes), 1 if conflicting else 6)
            if not conflicting:
                self.assertEqual(sum(not x.get("duplicate", False) for x in successes), 1)
            else:
                self.assertTrue(all("already" in str(x).lower() or "consumed" in str(x).lower()
                                    for x in results if isinstance(x, DatabaseError)), results)
            self.assertEqual(self.count("select verified_rounds from player_stats where user_id=$1", [player]), 1)
            self.assertEqual(self.count("select count(*) from economy_transactions where user_id=$1 and kind='round_reward'", [player]), 1)

    def test_04_reset_wins_against_completion(self):
        actor, player, tournament, challenge, args = self.tournament(builtin=True, complete=False)
        before = self.snapshot(player)
        reset, save = self.connection(), self.connection()
        reset.query("begin")
        reset.query("select 1 from tournaments where id=$1 for update", [tournament])
        future = self.pool.submit(self.transaction, save, "autotype_record_verified_round", args)
        self.blocked(save, reset)
        reset.rpc("autotype_reset_builtin_tournaments", [actor])
        reset.query("commit")
        result = future.result(timeout=10)
        self.assertIsInstance(result, DatabaseError)
        self.assertIn("run changed", str(result))
        self.assertEqual(self.snapshot(player), before)
        self.db.rpc("autotype_join_tournament", [player, tournament])
        self.db.query("update tournaments set status='running' where id=$1", [tournament])
        fresh = self.challenge(player, "tournament", tournament)
        self.assertNotEqual(fresh["tournament_run_id"], challenge["tournament_run_id"])
        self.assertTrue(self.db.rpc("autotype_record_verified_round", self.metrics(player, fresh))["verified"])

    def test_05_completion_wins_against_reset(self):
        actor, player, _, _, args = self.tournament(builtin=True, complete=False)
        save, reset = self.connection(), self.connection()
        save.query("begin")
        save.rpc("autotype_record_verified_round", args)
        future = self.pool.submit(self.transaction, reset, "autotype_reset_builtin_tournaments", [actor])
        self.blocked(reset, save)
        save.query("commit")
        self.assertNotIsInstance(future.result(timeout=10), DatabaseError)
        self.assertEqual(self.count("select verified_rounds from player_stats where user_id=$1", [player]), 1)
        self.assertEqual(self.count("select count(*) from round_results where id=$1", [args[2]]), 1)
        with self.assertRaisesRegex(DatabaseError, "run changed"):
            self.db.rpc("autotype_record_verified_round", args)

    def test_06_timeouts_rollback_partial_round_writes_and_retry(self):
        for statement in (False, True):
            player = self.user()
            args = self.metrics(player, self.challenge(player))
            before = self.snapshot(player)
            blocker, save = self.connection(), self.connection()
            blocker.query("begin")
            blocker.query("select 1 from player_stats where user_id=$1 for update", [player])
            save.query("set lock_timeout='0'; set statement_timeout='150ms'" if statement else "set lock_timeout='150ms'")
            result = self.transaction(save, "autotype_record_verified_round", args)
            self.assertIsInstance(result, DatabaseError)
            self.assertEqual(result.code, "57014" if statement else "55P03")
            blocker.query("rollback")
            self.assertEqual(self.snapshot(player), before)
            self.assertEqual(self.count("select count(*) from round_results where id=$1", [args[2]]), 0)
            self.assertEqual(self.db.query("select status from round_challenges where id=$1", [args[1]])[0]["status"], "issued")
            self.assertTrue(self.db.rpc("autotype_record_verified_round", args)["verified"])
            self.assertTrue(self.db.rpc("autotype_record_verified_round", args)["duplicate"])

    def order(self, attach=True):
        player = self.user()
        order = self.db.rpc("autotype_create_payment_order", [player, "coins_500"])
        session, intent = "cs_test_fixture_" + str(uuid.uuid4()), "pi_fixture_" + str(uuid.uuid4())
        if attach:
            self.db.rpc("autotype_attach_checkout_session", [order["order_id"], player, session])
        payload = {"order_id": order["order_id"], "user_id": player, "session": session, "pack_id": "coins_500",
                   "payment_intent": intent, "amount": order["amount_cents"], "currency": order["currency"]}
        return player, order, payload

    def event(self, kind, payload, event=None):
        return [event or "evt_fixture_" + str(uuid.uuid4()), "checkout.session.completed" if kind == "credit" else kind + ".updated",
                kind, payload, False]

    def test_07_fake_stripe_concurrent_ordering_idempotency(self):
        player, order, credit = self.order()
        before = self.count("select coins from wallets where user_id=$1", [player])
        refund = {"object_id": "re_fixture_" + str(uuid.uuid4()), "payment_intent": credit["payment_intent"],
                  "amount": order["amount_cents"], "status": "succeeded"}
        early = self.event("refund", refund)
        self.assertEqual(self.db.rpc("autotype_receive_stripe_event", early)["state"], "pending")
        credit_event = self.event("credit", credit)
        results = self.simultaneous("autotype_receive_stripe_event", [credit_event, credit_event, early, early,
                                                                    self.event("refund", refund), self.event("credit", credit)])
        self.assertFalse(any(isinstance(x, DatabaseError) for x in results), results)
        self.assertEqual(self.count("select coins from wallets where user_id=$1", [player]), before)
        self.assertEqual(self.count("select count(*) from economy_transactions where user_id=$1 and kind='stripe_coin_purchase'", [player]), 1)
        self.assertEqual(self.count("select count(*) from payment_adjustments where order_id=$1", [order["order_id"]]), 1)
        self.assertEqual(self.count("select count(*) from stripe_event_inbox where payment_intent=$1 and state<>'applied'", [credit["payment_intent"]]), 0)
        self.assertEqual(self.db.query("select status from payment_orders where id=$1", [order["order_id"]])[0]["status"], "refunded")

    def test_08_fake_stripe_wallet_timeout_retains_pending_without_partial_credit(self):
        player, order, credit = self.order()
        before = self.snapshot(player)
        blocker, ingress = self.connection(), self.connection()
        blocker.query("begin")
        blocker.query("select 1 from wallets where user_id=$1 for update", [player])
        ingress.query("set lock_timeout='150ms'")
        event = self.event("credit", credit)
        result = ingress.rpc("autotype_receive_stripe_event", event)
        self.assertEqual(result["state"], "pending")
        self.assertIn("lock timeout", result["error"])
        blocker.query("rollback")
        self.assertEqual(self.snapshot(player), before)
        self.assertEqual(self.db.query("select status from payment_orders where id=$1", [order["order_id"]])[0]["status"], "pending")
        self.assertEqual(self.db.rpc("autotype_receive_stripe_event", event)["state"], "applied")
        self.assertEqual(self.db.rpc("autotype_receive_stripe_event", event)["state"], "already_processed")
        self.assertEqual(self.count("select count(*) from economy_transactions where user_id=$1 and kind='stripe_coin_purchase'", [player]), 1)

    def test_09_shared_payment_intent_cannot_credit_two_orders(self):
        a, order_a, credit_a = self.order()
        b, order_b, credit_b = self.order()
        credit_b["payment_intent"] = credit_a["payment_intent"]
        results = self.simultaneous("autotype_receive_stripe_event", [self.event("credit", credit_a), self.event("credit", credit_b)])
        self.assertFalse(any(isinstance(x, DatabaseError) for x in results), results)
        self.assertEqual(sorted(x["state"] for x in results), ["applied", "pending"])
        self.assertEqual(self.count("select count(*) from payment_orders where provider_payment_intent_id=$1", [credit_a["payment_intent"]]), 1)
        self.assertEqual(self.count("select count(*) from economy_transactions where user_id in ($1,$2) and kind='stripe_coin_purchase'", [a, b]), 1)

    def test_10_browser_roles_cannot_mutate_or_read_private_inbox(self):
        connection = self.connection()
        player, order, credit = self.order()
        for role in ("anon", "authenticated"):
            connection.query("set role " + role)
            try:
                for table in ("stripe_event_inbox", "tournament_run_history"):
                    with self.assertRaisesRegex(DatabaseError, "permission denied"):
                        connection.query("select * from public." + table)
                with self.assertRaisesRegex(DatabaseError, "permission denied"):
                    connection.rpc("autotype_receive_stripe_event", self.event("credit", credit))
            finally:
                connection.query("reset role")

    def test_11_reproduce_late_pending_checkout_lock_inversion(self):
        fixed = self.db.query("select pg_get_functiondef('public.autotype_attach_checkout_session(uuid,uuid,text)'::regprocedure) as body")[0]["body"]
        self.db.query(original_function(STRIPE_BASELINE, "autotype_attach_checkout_session"))
        # A fixture trigger pauses the real attach function after it holds the
        # order, before its second inbox scan. No production code has test hooks.
        self.db.query("""create function public.fixture_pause_attach() returns trigger language plpgsql as $$begin
          if current_setting('application_name')='fixture_attach' then
            perform pg_advisory_xact_lock(910011::bigint);
          end if; return new; end$$;
          create trigger fixture_pause_attach before update on public.payment_orders
          for each row execute function public.fixture_pause_attach();""")
        gate, attach, credit_connection = self.connection(), self.connection("fixture_attach"), self.connection()
        try:
            player, order, payload = self.order(attach=False)
            gate.query("begin; select pg_advisory_xact_lock(910011::bigint)")
            attaching = self.pool.submit(self.transaction, attach, "autotype_attach_checkout_session",
                                         [order["order_id"], player, payload["session"]])
            self.blocked(attach, gate)
            # Older gateways only supplied the session. It is not yet committed
            # on the order, so this event is durably pending without locking it.
            legacy = dict(payload)
            legacy.pop("order_id")
            early = self.event("credit", legacy)
            self.assertEqual(self.db.rpc("autotype_receive_stripe_event", early)["state"], "pending")
            incoming = self.pool.submit(self.transaction, credit_connection, "autotype_receive_stripe_event",
                                        self.event("credit", payload))
            self.blocked(credit_connection, attach)
            gate.query("rollback")
            outcomes = [attaching.result(timeout=10), incoming.result(timeout=10)]
            deadlocks = [x for x in outcomes if (isinstance(x, DatabaseError) and x.code == "40P01") or
                        (isinstance(x, dict) and "deadlock detected" in str(x.get("error", "")))]
            self.assertEqual(len(deadlocks), 1, outcomes)
            print("CONFIRMED: late pending Checkout event inverts intent/order locks", flush=True)
            # Retry/reconcile after both transactions settle must credit once.
            self.db.rpc("autotype_attach_checkout_session", [order["order_id"], player, payload["session"]])
            self.db.rpc("autotype_reconcile_stripe_events", [payload["payment_intent"]])
            self.assertEqual(self.count("select count(*) from economy_transactions where user_id=$1 and kind='stripe_coin_purchase'", [player]), 1)
            self.assertEqual(self.count("select count(*) from stripe_event_inbox where payment_intent=$1 and state<>'applied'", [payload["payment_intent"]]), 0)
        finally:
            gate.query("rollback")
            self.db.query("drop trigger fixture_pause_attach on payment_orders; drop function fixture_pause_attach()")
            self.db.query(fixed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, help="Directory containing preinstalled native PostgreSQL binaries")
    args = parser.parse_args()
    CLUSTER = Cluster(args.pg_bin)
    try:
        CLUSTER.start()
        outcome = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(NativeConcurrency))
        raise SystemExit(0 if outcome.wasSuccessful() else 1)
    finally:
        CLUSTER.close()
