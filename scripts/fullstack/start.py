#!/usr/bin/env python3
"""Start and warm a disposable stack before blocking test egress."""
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

assert os.environ.get("GITHUB_ACTIONS") == "true"
directory = Path(os.environ["AUTOTYPE_STACK_DIR"])
result = subprocess.run(["supabase", "start"], cwd=directory, capture_output=True, text=True)
if result.returncode:
    print(result.stdout)
    print(result.stderr)
    raise SystemExit(result.returncode)
status = json.loads(subprocess.check_output(["supabase", "status", "-o", "json"], cwd=directory))
for name in ("ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET", "DB_URL"):
    if status.get(name):
        print("::add-mask::" + status[name], flush=True)
file = directory / "status.json"
file.write_text(json.dumps(status))
file.chmod(0o600)
for name in ("game-api", "stripe-webhook", "create-checkout-session", "delete-account", "refund-payment"):
    req = urllib.request.Request("http://127.0.0.1:54321/functions/v1/" + name,
        data=b"{}", headers={"Authorization": "Bearer " + status["ANON_KEY"],
                             "apikey": status["ANON_KEY"], "Content-Type": "application/json"})
    try:
        response = urllib.request.urlopen(req, timeout=120)
        code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    if code not in (400, 401, 503):
        raise RuntimeError(f"Unexpected warm-up status for {name}: {code}")
    print(f"Warmed {name}: {code} (unauthenticated/unconfigured; no payment requests)")
subprocess.run(["docker", "ps", "--format", "{{.Names}} {{.Image}} {{.Status}}"], check=True)
