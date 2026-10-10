#!/usr/bin/env python3
"""Block outbound traffic from runner test processes and all stack containers."""
import json
import os
import subprocess
import urllib.request

assert os.environ.get("GITHUB_ACTIONS") == "true"
network = json.loads(subprocess.check_output(["docker", "network", "inspect", "supabase_network_autotype-phase1-ci"]))[0]
subnet = network["IPAM"]["Config"][0]["Subnet"]
uid = str(os.getuid())
def rule(*args):
    subprocess.run(["sudo", "iptables", *args], check=True)
# Apply only to the freshly created stack subnet; no host-wide Docker policy changes.
rule("-I", "DOCKER-USER", "1", "-s", subnet, "!", "-d", subnet, "-j", "REJECT")
# Host-to-container/loopback requests stay available; the test user cannot send elsewhere.
rule("-N", "AUTOTYPE_CI")
rule("-A", "AUTOTYPE_CI", "-d", "127.0.0.0/8", "-j", "RETURN")
rule("-A", "AUTOTYPE_CI", "-d", subnet, "-j", "RETURN")
rule("-A", "AUTOTYPE_CI", "-j", "REJECT")
rule("-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", uid, "-j", "AUTOTYPE_CI")
subprocess.run(["sudo", "ip6tables", "-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", uid, "!", "-d", "::1", "-j", "REJECT"], check=True)
try:
    urllib.request.urlopen("http://1.1.1.1", timeout=2)
except Exception:
    print("Runner outbound probe rejected; stack container egress rule installed")
else:
    raise RuntimeError("Outbound isolation did not reject the probe")
