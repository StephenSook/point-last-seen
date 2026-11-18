#!/usr/bin/env bash
# Runs every check the CI workflow runs, each on a bare exit path (no pipes).
# Mirror .github/workflows/ci.yml: when a job gains a step, add it here.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PY=python3
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; fi

echo "== gates: rules gate"
python3 -I scripts/rules_gate.py .

echo "== gates: rules gate tests"
"$PY" -I -m pytest scripts/test_rules_gate.py -q

echo "== gates: schema parity"
python3 -I scripts/check_schema_parity.py .

echo "== gates: rules validators match the schemas"
python3 -I tools/rules/gen_rules_validators.py --check

echo "== gates: schema parity and vector generator tests"
"$PY" -I -m pytest scripts/test_check_schema_parity.py tools/vectors/test_make_vectors.py tools/seed/test_seed_drill.py tools/seed/test_seed_segments.py tools/rules/test_gen_rules_validators.py scripts/test_emulator_config.py scripts/test_appcheck_control.py scripts/test_media_probe.py scripts/test_judging_window.py -q

echo "== gates: secret scan (full history)"
gitleaks git --redact --no-banner --log-opts="--all" .

echo "== ts: engine typecheck, lint and tests (uses the existing install; CI runs npm ci)"
npm run typecheck -w shared/engine-ts
npm run lint -w shared/engine-ts
npm test -w shared/engine-ts
npm run typecheck -w tools/grid-builder
npm test -w tools/grid-builder

echo "== vectors-parity: vectors are current, engine passes them"
python3 -I tools/vectors/make_vectors.py --check
npm test -w shared/engine-ts -- test/vectors.test.ts test/priorVectors.test.ts test/urgency.test.ts

echo "== rules: functions typecheck, rules and joinIncident tests in the emulators"
# Local only (a CI runner starts clean): a socket left from the previous run on this worktree's port block
# made the Firestore emulator fail to bind, so wait (at most 180 s) until the block is free.
python3 -I scripts/emulator_config.py . --wait-ports 180
npm run typecheck -w functions
if ! npm run test:rules -w functions; then
  # Lane B saw a one-off WebChannel bind failure right after "ports free"; record who held the ports.
  python3 -I scripts/emulator_config.py . --who-holds
  exit 1
fi

if [ -e web/package.json ]; then
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
else
  echo "== web: skipped, web/ not on this branch"
fi

if [ -d ios/PLSCore ]; then
  echo "== swift-core: Swift core tests"
  swift test --package-path ios/PLSCore
else
  echo "== swift-core: skipped, ios/PLSCore not on this branch"
fi

if [ -x android/gradlew ]; then
  echo "== android: unit tests and debug build"
  (cd android && ./gradlew --no-daemon testDebugUnitTest assembleDebug compileDebugAndroidTestKotlin)
  python3 -I android/count-tests.py android/app/build/test-results/testDebugUnitTest --min 150
else
  echo "== android: skipped, android/ not on this branch"
fi

echo "ci-local: all checks passed"
