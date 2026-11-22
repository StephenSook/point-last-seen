#!/usr/bin/env bash
# Tests run-drill-e2e.sh's incident guard against stub security and adb, so it reads no Keychain item, touches no
# device and starts no Gradle build. The stub security records its arguments and then fails, which stops the script
# right after the guard. Run it from anywhere:
#   bash android/run-drill-e2e.test.sh
# Exit 0 when every case gives its wanted result, 1 otherwise.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'find "$tmp" -type f -delete; find "$tmp" -depth -type d -exec rmdir {} \;' EXIT
mkdir -p "$tmp/bin" "$tmp/sdk/platform-tools"
cat > "$tmp/bin/security" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/security.calls"
exit 1
EOF
cat > "$tmp/sdk/platform-tools/adb" <<'EOF'
#!/usr/bin/env bash
# Only the code pipe sends input; any other call (the cleanup's unlink) reads none.
case "$*" in *"cat >"*) cat > /dev/null ;; esac
exit 0
EOF
chmod +x "$tmp/bin/security" "$tmp/sdk/platform-tools/adb"

# The judge seed's id, read as the script reads it, so this test never spells it out.
seed="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["incidentId"])' "$here/../shared/constants/judge-seed.json")"
[ -n "$seed" ] || { echo "FAIL: no judge seed id in shared/constants/judge-seed.json"; exit 1; }

fails=0
# run <name> <incident or empty>: runs the script with the stubs; prints its exit code.
run() {
  find "$tmp" -maxdepth 1 -name security.calls -type f -delete
  if [ -n "$2" ]; then
    PATH="$tmp/bin:$PATH" ANDROID_HOME="$tmp/sdk" ANDROID_SERIAL=stub PLS_DRILL_INCIDENT="$2" \
      bash "$here/run-drill-e2e.sh" > "$tmp/out" 2>&1 < /dev/null
  else
    PATH="$tmp/bin:$PATH" ANDROID_HOME="$tmp/sdk" ANDROID_SERIAL=stub \
      bash "$here/run-drill-e2e.sh" > "$tmp/out" 2>&1 < /dev/null
  fi
  echo $?
}
calls() { cat "$tmp/security.calls" 2>/dev/null || true; }

# The judge seed incident is refused before any Keychain read, with a message that names it.
rc="$(run judge-seed "$seed")"
if [ "$rc" -ne 0 ] && [ -z "$(calls)" ] && grep -qF "'$seed'" "$tmp/out"; then
  echo "ok: the judge seed incident is refused before the Keychain is read"
else
  echo "FAIL: the judge seed incident (exit $rc, Keychain calls: $(calls))"; fails=$((fails + 1))
fi

# Control: the default incident passes the guard and reaches the Keychain read for drill-test-1.
rc="$(run default '')"
if calls | grep -q -- '-a drill-test-1'; then
  echo "ok: the default incident drill-test-1 reaches the Keychain read"
else
  echo "FAIL: default (exit $rc, Keychain calls: $(calls))"; fails=$((fails + 1))
fi

[ "$fails" -eq 0 ]
