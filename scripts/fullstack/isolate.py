#!/usr/bin/env python3
"""Block outbound traffic from runner test processes and all stack containers."""
import json
import os
import subprocess
import urllib.request

assert os.environ.get("GITHUB_ACTIONS") == "true"
network = json.loads(subprocess.check_output(["docker", "network", "inspect", "supabase_network_autotype-phase1-ci"]))[0]
subnet = network["IPAM"]["Config"][0]["Subnet"]
# Never firewall the runner UID: the Actions agent shares it and must report logs.
# Give test processes a distinct UID, retaining read-only access to fixture files.
subprocess.run(["sudo", "useradd", "--system", "--no-create-home", "--gid", str(os.getgid()), "autotype_ci"], check=True)
subprocess.run(["chmod", "-R", "g+rX", os.environ["AUTOTYPE_STACK_DIR"]], check=True)
uid = subprocess.check_output(["id", "-u", "autotype_ci"], text=True).strip()
def rule(*args):
    subprocess.run(["sudo", "iptables", *args], check=True)
# Apply only to the freshly created stack subnet; no host-wide Docker policy changes.
rule("-I", "DOCKER-USER", "1", "-s", subnet, "!", "-d", subnet, "-m", "conntrack", "--ctstate", "NEW", "-j", "REJECT")
# Only the dedicated test UID is restricted. The Actions agent remains reachable.
rule("-N", "AUTOTYPE_CI")
rule("-A", "AUTOTYPE_CI", "-d", "127.0.0.0/8", "-j", "RETURN")
rule("-A", "AUTOTYPE_CI", "-d", subnet, "-j", "RETURN")
rule("-A", "AUTOTYPE_CI", "-j", "REJECT")
rule("-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", uid, "-j", "AUTOTYPE_CI")
subprocess.run(["sudo", "ip6tables", "-I", "OUTPUT", "1", "-m", "owner", "--uid-owner", uid, "!", "-d", "::1", "-j", "REJECT"], check=True)
probe = """import urllib.request,sys
try: urllib.request.urlopen('http://1.1.1.1',timeout=2)
except Exception: print('Dedicated test UID outbound probe rejected')
else: sys.exit('Outbound isolation did not reject the probe')
"""
subprocess.run(["sudo", "-u", "autotype_ci", "--", "python3", "-c", probe], check=True, timeout=10)
print("Container new outbound connections rejected; Actions agent networking preserved")
