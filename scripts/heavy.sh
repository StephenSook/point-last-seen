#!/usr/bin/env bash
# Runs one heavy command (a full test suite, a browser suite, a Gradle or Xcode test run) in one of this machine's
# two heavy-suite slots, so at most two run at once: more overload the machine and make timing-based tests flake.
#
# Usage: bash scripts/heavy.sh <command> [args...]
#   Takes /tmp/heavy-suite-1.lock, then -2.lock, without waiting. When both are busy it waits on slot 1, saying which
#   process holds it every 5 minutes, and gives up after 90 minutes (exit 75). The command's own exit code comes
#   back (a 75 of its own becomes 1, so 75 always means "no slot").
#   It runs the command directly, taking no slot, when the caller already holds one (PLS_HEAVY_LOCK is set), when it
#   was started by hand under lockf on a heavy-suite lock (waiting then would wait on itself forever), or when the
#   machine has no lockf (CI).
# PLS_HEAVY_LOCK_DIR, PLS_HEAVY_LOCK_STEP_S and PLS_HEAVY_LOCK_MAX_MIN move the slot files, the waiting line's
# interval and the cap (for this script's tests).
set -uo pipefail
if [ $# -eq 0 ]; then
  echo "usage: bash scripts/heavy.sh <command> [args...]"
  exit 64
fi
LOCK_DIR="${PLS_HEAVY_LOCK_DIR:-/tmp}"
STEP_S="${PLS_HEAVY_LOCK_STEP_S:-300}"
MAX_MIN="${PLS_HEAVY_LOCK_MAX_MIN:-90}"

parent_holds_a_slot() {
  [ "$(ps -o comm= -p "$PPID" 2>/dev/null | sed 's#.*/##')" = lockf ] && ps -o args= -p "$PPID" 2>/dev/null | grep -q 'heavy-suite'
}

if [ -n "${PLS_HEAVY_LOCK:-}" ] || ! command -v lockf >/dev/null 2>&1 || parent_holds_a_slot; then
  export PLS_HEAVY_LOCK=1
  exec "$@"
fi
export PLS_HEAVY_LOCK=1

under_slot() {
  lockf -t "$1" -k "$2" bash -c '"$@"; rc=$?; [ "$rc" -eq 75 ] && rc=1; exit "$rc"' heavy "${@:3}"
}

for slot in 1 2; do
  under_slot 0 "$LOCK_DIR/heavy-suite-$slot.lock" "$@"
  rc=$?
  if [ "$rc" -ne 75 ]; then exit "$rc"; fi
done
waited_s=0
while :; do
  holder="$("$(command -v lsof || echo /usr/sbin/lsof)" -t "$LOCK_DIR/heavy-suite-1.lock" 2>/dev/null | head -1)"
  echo "heavy: both heavy-suite slots are busy; waiting on $LOCK_DIR/heavy-suite-1.lock (held by PID ${holder:-unknown}) for $((waited_s / 60)) min"
  under_slot "$STEP_S" "$LOCK_DIR/heavy-suite-1.lock" "$@"
  rc=$?
  if [ "$rc" -ne 75 ]; then exit "$rc"; fi
  waited_s=$((waited_s + STEP_S))
  if [ "$waited_s" -ge $((MAX_MIN * 60)) ]; then
    echo "heavy: gave up after $MAX_MIN min waiting for a heavy-suite slot"
    exit 75
  fi
done
