#!/usr/bin/env python3
"""Prepare ONLY a fresh runner-local stack; never link or accept hosted config."""
import os
import json
import secrets
from pathlib import Path
import shutil
import tempfile

root = Path(__file__).resolve().parents[2]
assert os.environ.get("GITHUB_ACTIONS") == "true", "Runner-only entry point"
run = os.environ["AUTOTYPE_CI_RUN_ID"]
assert run.replace("-", "").isdigit()
target = Path(tempfile.mkdtemp(prefix="autotype-fullstack-", dir=os.environ["RUNNER_TEMP"]))
supa = target / "supabase"
(supa / "migrations").mkdir(parents=True)
config = (root / "scripts/fullstack/config.toml").read_text() + "\n" + (root / "supabase/config.toml").read_text()
# A fake key is not a Stripe credential. Only signed synthetic Checkout events
# are exercised by the actual Edge worker; outbound service traffic is blocked.
webhook = "whsec_ci_" + secrets.token_hex(32)
config += '\n[edge_runtime.secrets]\nSTRIPE_SECRET_KEY="sk_test_fixture"\nSTRIPE_WEBHOOK_SECRET="' + webhook + '"\n'
(supa / "config.toml").write_text(config)
fixture = target / "stripe_fixture.json"
fixture.write_text(json.dumps({"webhook_secret": webhook}))
fixture.chmod(0o600)
shutil.copytree(root / "supabase/functions", supa / "functions")
shutil.copy(root / "supabase/bootstrap/001_backend_foundation.sql", supa / "migrations/00000000000000_foundation.sql")
files = sorted((root / "supabase/migrations").glob("*.sql"))
for file in files:
    if "_phase1_" not in file.name:
        shutil.copy(file, supa / "migrations" / file.name)
# The marker is synthetic, unique to this workflow run and not a release migration.
(supa / "migrations/99999999999999_ci_marker.sql").write_text(
    "create schema autotype_ci; revoke all on schema autotype_ci from public,anon,authenticated;\n"
    "create table autotype_ci.marker(run_id text primary key);\n"
    f"insert into autotype_ci.marker values ('{run}');\n"
    # The app currently polls REST; this CI-only publication exercises real
    # Realtime RLS without silently enabling subscriptions in production.
    "alter publication supabase_realtime add table public.race_rooms,public.race_players;\n")
with open(os.environ["GITHUB_ENV"], "a") as output:
    output.write(f"AUTOTYPE_STACK_DIR={target}\n")
print(f"Prepared legacy baseline; {len(files)} total release migrations will be tested through upgrade and fresh reset")
