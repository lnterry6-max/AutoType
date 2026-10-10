#!/usr/bin/env python3
"""Start and warm a disposable stack before blocking test egress."""
import json
import os
from pathlib import Path
import subprocess
import re
import time
import urllib.error
import urllib.request

assert os.environ.get("GITHUB_ACTIONS") == "true"
directory = Path(os.environ["AUTOTYPE_STACK_DIR"])
def diagnostics():
    names = subprocess.check_output(["docker", "ps", "-a", "--format", "{{.Names}}"], text=True, timeout=15).splitlines()
    for name in names:
        if name.endswith("_autotype-phase1-ci"):
            print("FIXTURE DIAGNOSTIC", name, flush=True)
            logs = subprocess.run(["docker", "logs", "--tail", "50", name], capture_output=True, text=True, timeout=15)
            text = logs.stdout + logs.stderr
            text = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[local JWT redacted]", text)
            text = text.replace("super-secret-jwt-token-with-at-least-32-characters-long", "[local JWT secret redacted]")
            print(text, flush=True)

print("Starting fixture services with an eight-minute bound", flush=True)
started = time.monotonic()
try:
    result = subprocess.run(["supabase", "start"], cwd=directory, capture_output=True, text=True, timeout=480)
except subprocess.TimeoutExpired as error:
    print("Fixture startup timed out", flush=True)
    print((error.stderr or b"").decode()[-10000:] if isinstance(error.stderr, bytes) else (error.stderr or "")[-10000:])
    diagnostics()
    raise SystemExit(1)
if result.returncode:
    print(result.stdout)
    print(result.stderr)
    diagnostics()
    raise SystemExit(result.returncode)
print(f"CLI start completed in {time.monotonic()-started:.1f}s; reading local status with a 60s bound", flush=True)
status = json.loads(subprocess.check_output(["supabase", "status", "-o", "json"], cwd=directory, timeout=60))
print("Local status returned; warming local function imports", flush=True)
print("::add-mask::" + json.loads((directory / "stripe_fixture.json").read_text())["webhook_secret"], flush=True)
for name in ("ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET", "DB_URL"):
    if status.get(name):
        print("::add-mask::" + status[name], flush=True)
# Capture only this freshly created fixture issuer's keys for the expired-JWT test.
# Never inspect a hosted service or print the private key material.
local_env = json.loads(subprocess.check_output(["docker", "inspect", "--format", "{{json .Config.Env}}", "supabase_auth_autotype-phase1-ci"], timeout=15))
keys = next(value.split("=", 1)[1] for value in local_env if value.startswith("GOTRUE_JWT_KEYS="))
status["CI_AUTH_SIGNING_KEYS"] = json.loads(keys)
print("::add-mask::" + keys, flush=True)
file = directory / "status.json"
file.write_text(json.dumps(status))
file.chmod(0o600)
for name in ("game-api", "stripe-webhook", "create-checkout-session", "delete-account", "refund-payment"):
    print("Warming fixture function", name, flush=True)
    req = urllib.request.Request("http://127.0.0.1:54321/functions/v1/" + name,
        data=b"{}", headers={"Authorization": "Bearer " + status["ANON_KEY"],
                             "apikey": status["ANON_KEY"], "Content-Type": "application/json"})
    try:
        response = urllib.request.urlopen(req, timeout=30)
        code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    if code not in (400, 401, 503):
        raise RuntimeError(f"Unexpected warm-up status for {name}: {code}")
    print(f"Warmed {name}: {code} (unauthenticated/unconfigured; no payment requests)")
subprocess.run(["docker", "ps", "--format", "{{.Names}} {{.Image}} {{.Status}}"], check=True, timeout=15)
