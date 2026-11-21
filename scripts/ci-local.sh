#!/usr/bin/env bash
# Runs every check the CI workflows run, each on a bare exit path (no pipes), so a local run can stand in for CI.
# Mirror .github/workflows/*.yml: when a job gains a step, add it here (scripts/test_ci_local.py fails until you do).
#
# Usage: bash scripts/ci-local.sh [--gates] [--ts] [--rules] [--web] [--ios] [--android]
#   With no flag, every section runs. With flags, only those sections run.
#   Exit 0: every check ran and passed. Exit 1: a check failed (the run stops there).
#   Exit 2: every check that ran passed, but a tool was missing, so some checks did NOT run (listed at the end).
# CI_LOCAL_HIDE="tool ..." makes the named tools count as missing (for this script's own tests).
# PLS_HEAVY_LOCK=1 skips taking a heavy-suite slot (scripts/heavy.sh sets it once the run holds one).
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(git rev-parse --show-toplevel)"

usage() {
  cat <<'EOF'
Usage: bash scripts/ci-local.sh [--gates] [--ts] [--rules] [--web] [--ios] [--android]
  --gates    rules gate, schema parity, rules validators, RC keys, hygiene, Python tests, secret scan (gitleaks)
  --ts       engine typecheck, lint and tests; grid builder and exporter; test vectors
  --rules    functions typecheck; rules and functions tests in the Firebase emulators (Firebase CLI, Java)
  --web      web typecheck, unit tests, placeholder build, no-backend browser checks
  --ios      Swift core tests (swift)
  --android  Android unit tests, debug build and the test count (Java)
No flag runs every section. Exit 0 all passed, 1 a check failed, 2 some checks could not run (a tool is missing).
EOF
}

SECTIONS=""
for arg in "$@"; do
  case "$arg" in
    --gates|--ts|--rules|--web|--ios|--android) SECTIONS="$SECTIONS ${arg#--}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ci-local: unknown option $arg"; usage; exit 64 ;;
  esac
done
if [ -z "$SECTIONS" ]; then SECTIONS=" gates ts rules web ios android"; fi

# At most two heavy suites at once on this machine: run this script in a heavy-suite slot (scripts/heavy.sh takes a
# free slot, or waits saying who holds one, and never waits on itself). Inside the slot PLS_HEAVY_LOCK is set.
if [ -z "${PLS_HEAVY_LOCK:-}" ]; then
  exec bash "$(dirname "$SELF")/heavy.sh" bash "$SELF" "$@"
fi

want() { case " $SECTIONS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
have() {
  case " ${CI_LOCAL_HIDE:-} " in *" $1 "*) return 1 ;; esac
  command -v "$1" >/dev/null 2>&1
}
NOT_RUN=""
not_run() { echo "== $1: NOT RUN, $2 is not installed"; NOT_RUN="$NOT_RUN $1 ($2)"; }

PY=python3
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; fi

if want gates; then
  echo "== gates: rules gate"
  python3 -I scripts/rules_gate.py .

  echo "== gates: rules gate tests"
  "$PY" -I -m pytest scripts/test_rules_gate.py -q

  echo "== gates: schema parity"
  python3 -I scripts/check_schema_parity.py .

  echo "== gates: rules validators match the schemas"
  python3 -I tools/rules/gen_rules_validators.py --check
  python3 -I scripts/check_rc_keys.py .
  python3 -I scripts/hygiene_guard.py .

  echo "== gates: schema parity and vector generator tests"
  "$PY" -I -m pytest scripts/test_check_schema_parity.py scripts/test_firebase_config.py scripts/test_workflow_paths.py scripts/test_ci_local.py tools/vectors/test_make_vectors.py tools/seed/test_seed_drill.py tools/seed/test_seed_segments.py tools/seed/test_segment_contract.py tools/rules/test_gen_rules_validators.py scripts/test_emulator_config.py scripts/test_rc_publish.py scripts/test_models_probe.py scripts/test_check_rc_keys.py scripts/test_hygiene_guard.py scripts/test_templates.py scripts/test_appcheck_control.py scripts/test_media_probe.py scripts/test_judging_window.py tools/extras/test_build_elevation.py tools/extras/test_publish_scam.py tools/extras/test_publish_drill_run.py scripts/test_judge_seed_check.py tools/practice/test_judge_drill.py scripts/test_test_matrix.py scripts/test_ai_spend.py scripts/test_phone_vectors.py scripts/test_grounding_vectors.py tools/practice/test_export_practice_pack.py scripts/test_check_privacy_label.py scripts/test_readme_run_label.py -q

  if have gitleaks; then
    echo "== gates: secret scan (full history)"
    gitleaks git --redact --no-banner --log-opts="--all" .
  else
    not_run "gates secret scan" gitleaks
  fi
fi

if want ts; then
  if have npm; then
    echo "== ts: engine typecheck, lint and tests (uses the existing install; CI runs npm ci)"
    npm run typecheck -w shared/engine-ts
    npm run lint -w shared/engine-ts
    npm test -w shared/engine-ts
    npm run typecheck -w tools/grid-builder
    npm test -w tools/grid-builder
    npm run typecheck -w tools/export-run
    npm test -w tools/export-run

    echo "== vectors-parity: vectors are current, engine passes them"
    python3 -I tools/vectors/make_vectors.py --check
    npm test -w shared/engine-ts -- test/vectors.test.ts test/priorVectors.test.ts test/urgency.test.ts
  else
    not_run ts npm
  fi
fi

if want rules; then
  if ! have npm; then
    not_run rules npm
  elif ! have firebase; then
    not_run rules firebase
  elif ! have java; then
    not_run rules java
  else
    echo "== rules: functions typecheck, rules and joinIncident tests in the emulators"
    # Local only (a CI runner starts clean): a socket left from the previous run on this worktree's port block
    # made the Firestore emulator fail to bind, so wait (at most 180 s) until the block is free.
    python3 -I scripts/emulator_config.py . --wait-ports 180
    npm run typecheck -w functions
    if ! npm run test:rules -w functions; then
      # A one-off WebChannel bind failure was seen right after "ports free"; record who held the ports.
      python3 -I scripts/emulator_config.py . --who-holds
      exit 1
    fi
  fi
fi

if want web; then
  if [ ! -e web/package.json ]; then
    echo "== web: skipped, web/ not on this branch"
  elif ! have npm; then
    not_run web npm
  else
    echo "== web: typecheck, unit tests and build (CI's placeholder config, built into a temp folder)"
    npm run typecheck -w web
    npm test -w web
    # Same placeholder config as web.yml: the build proves the app compiles and is never deployed. Variables
    # already in the environment beat .env files in Vite, so the output goes to a temp folder and a worktree's
    # real web/dist (built from its .env.local and deployed from there) is never overwritten.
    WEB_OUT="$(mktemp -d)"
    VITE_FIREBASE_API_KEY=ci-build-check VITE_FIREBASE_AUTH_DOMAIN=ci-build-check.firebaseapp.com \
    VITE_FIREBASE_PROJECT_ID=ci-build-check VITE_FIREBASE_STORAGE_BUCKET=ci-build-check.firebasestorage.app \
    VITE_FIREBASE_MESSAGING_SENDER_ID=0 VITE_FIREBASE_APP_ID=1:0:web:0 VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=ci-build-check \
      npm run build -w web -- --outDir "$WEB_OUT" --emptyOutDir
    # web.yml's browser checks preview the placeholder build; they run here once the config can preview $WEB_OUT.
    if grep -q "PLS_PREVIEW_DIR" web/e2e/ci.config.ts 2>/dev/null; then
      echo "== web: browser checks with no backend"
      (cd web && PLS_PREVIEW_DIR="$WEB_OUT" npx playwright test -c e2e/ci.config.ts)
      # CI=1 makes both configs use Playwright's Chromium, as on the runner; they start Vite dev servers, no backend.
      echo "== web: harness and extras browser checks"
      (cd web && CI=1 npx playwright test -c e2e/harness.config.ts --grep-invert "built-in model")
      (cd web && CI=1 npx playwright test -c e2e/extras.config.ts)
    else
      echo "== web browser checks: NOT RUN, web/e2e/ci.config.ts cannot preview a temp build (PLS_PREVIEW_DIR)"
      NOT_RUN="$NOT_RUN web-browser-checks (PLS_PREVIEW_DIR)"
    fi
  fi
fi

if want ios; then
  if [ ! -d ios/PLSCore ]; then
    echo "== swift-core: skipped, ios/PLSCore not on this branch"
  elif ! have swift; then
    not_run ios swift
  else
    echo "== swift-core: Swift core tests"
    swift test --package-path ios/PLSCore
  fi
fi

if want android; then
  if [ ! -x android/gradlew ]; then
    echo "== android: skipped, android/ not on this branch"
  elif ! have java; then
    not_run android java
  else
    echo "== android: unit tests and debug build"
    (cd android && ./gradlew --no-daemon testDebugUnitTest assembleDebug compileDebugAndroidTestKotlin)
    python3 -I android/count-tests.py android/app/build/test-results/testDebugUnitTest --min 304
  fi
fi

if [ -n "$NOT_RUN" ]; then
  echo "ci-local: every check that ran passed, but these did NOT run:$NOT_RUN"
  exit 2
fi
echo "ci-local: all checks passed (sections:$SECTIONS)"
