#!/usr/bin/env bash
# Scans one APK for App Check debug secrets before it is published. Checks the raw
# bytes of every entry (UTF-8 and UTF-16), the decoded resource table (aapt2), and
# the dex for the debug provider. Token values come from the macOS Keychain and are
# never printed. Exit 0 clean, 1 on any hit, 2 when the scan itself cannot run.
set -euo pipefail
apk="${1:?usage: scan-apk.sh <apk>}"
[ -s "$apk" ] || { echo "scan-apk: no such APK: $apk" >&2; exit 2; }
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
aapt2="$sdk/build-tools/37.0.0/aapt2"
[ -x "$aapt2" ] || { echo "scan-apk: aapt2 not found at $aapt2" >&2; exit 2; }
resources="$(mktemp)"
trap 'python3 -I -c "import os,sys; os.remove(sys.argv[1])" "$resources"' EXIT
"$aapt2" dump resources "$apk" > "$resources"
# The tokens are read from the Keychain inside the Python step, so no token is ever a
# command-line argument (other processes can read argv).
python3 -I - "$apk" "$resources" pls-appcheck-debug-android-emulator pls-appcheck-debug-android-a16 <<'PY'
import sys, zipfile, re, subprocess
apk, res, services = sys.argv[1], sys.argv[2], sys.argv[3:]
toks = []
for service in services:
    r = subprocess.run(["security", "find-generic-password", "-w", "-s", service], capture_output=True, text=True)
    t = r.stdout.strip()
    if r.returncode == 0 and t:
        toks.append(t.encode())
if not toks:
    print("scan-apk: no debug token in the Keychain to scan for", file=sys.stderr)
    sys.exit(2)
hits = []
z = zipfile.ZipFile(apk)
entries = z.namelist()
for n in entries:
    b = z.read(n)
    for i, t in enumerate(toks):
        if t in b or t.decode().encode("utf-16-le") in b:
            hits.append(f"token #{i + 1} in {n}")
    if n.endswith(".dex") and b"DebugAppCheckProvider" in b:
        hits.append(f"debug App Check provider in {n}")
    if b"FIREBASE_APPCHECK_DEBUG_TOKEN" in b:
        hits.append(f"FIREBASE_APPCHECK_DEBUG_TOKEN in {n}")
text = open(res, encoding="utf-8", errors="replace").read()
for i, t in enumerate(toks):
    if t.decode() in text:
        hits.append(f"token #{i + 1} in the decoded resource table")
m = re.search(r"string/firebase_app_check_debug_token[^\n]*\n((?:\s+\(.*\n)+)", text)
if m and re.search(r'"[^"]+"', m.group(1)):
    hits.append("firebase_app_check_debug_token resource has a value")
print(f"scan-apk: {len(entries)} entries, {len(toks)} token(s) checked, {len(hits)} hit(s)")
for h in hits:
    print("  HIT:", h)
sys.exit(1 if hits else 0)
PY
