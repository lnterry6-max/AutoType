#!/usr/bin/env python3
"""Run the existing 15 native scenarios against ONLY this run's real local stack.

The original native entry point remains incapable of accepting an external DSN.
This adapter requires GitHub Actions, fixed loopback ports and an exact CI marker.
"""
import json
import os
from pathlib import Path
import unittest
from urllib.parse import urlparse, unquote
import test_phase1_native as native

assert os.environ.get("GITHUB_ACTIONS") == "true"
directory = Path(os.environ["AUTOTYPE_STACK_DIR"]).resolve()
assert directory.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
assert directory.name.startswith("autotype-fullstack-")
status = json.loads((directory / "status.json").read_text())
url = urlparse(status["DB_URL"])
assert url.hostname in ("127.0.0.1", "localhost") and url.port == 54322
assert unquote(url.password) == "postgres", "Only the CLI's synthetic default password is accepted"
# Reuse its libpq loader. This allocates an empty temp directory but starts no server.
adapter = native.Cluster("/usr/lib/postgresql/16/bin")
adapter.dsn = "host=127.0.0.1 port=54322 dbname=postgres user=supabase_admin password=postgres connect_timeout=5"
native.CLUSTER = adapter

class FullStackConcurrency(native.NativeConcurrency):
    @classmethod
    def setUpClass(cls):
        cls.db = native.Connection(adapter)
        assert cls.db.query("select run_id from autotype_ci.marker")[0]["run_id"] == os.environ["AUTOTYPE_CI_RUN_ID"]
        version = int(cls.db.query("show server_version_num")[0]["server_version_num"])
        assert 170000 <= version < 180000
        cls.db.query("set search_path=public,extensions")
        print("REAL SUPABASE NATIVE:", cls.db.query("select version() as version")[0]["version"], flush=True)
        # Real Auth/Storage schemas and migrated application tables already exist.
        # Never load the stub-schema prelude or reset this database here.

if __name__ == "__main__":
    try:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(FullStackConcurrency))
    finally:
        adapter.close()
    raise SystemExit(0 if result.wasSuccessful() else 1)
