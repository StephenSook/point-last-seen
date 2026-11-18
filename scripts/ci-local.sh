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

echo "== gates: schema parity and vector generator tests"
"$PY" -I -m pytest scripts/test_check_schema_parity.py tools/vectors/test_make_vectors.py tools/seed/test_seed_drill.py -q

echo "== gates: secret scan (full history)"
gitleaks git --redact --no-banner --log-opts="--all" .

echo "== ts: engine typecheck, lint and tests (uses the existing install; CI runs npm ci)"
npm run typecheck -w shared/engine-ts
npm run lint -w shared/engine-ts
npm test -w shared/engine-ts

echo "== vectors-parity: vectors are current, engine passes them"
python3 -I tools/vectors/make_vectors.py --check
npm test -w shared/engine-ts -- test/vectors.test.ts

echo "== rules: functions typecheck, rules and joinIncident tests in the emulators"
npm run typecheck -w functions
npm run test:rules -w functions

if [ -d ios/PLSCore ]; then
  echo "== swift-core: Swift core tests"
  swift test --package-path ios/PLSCore
else
  echo "== swift-core: skipped, ios/PLSCore not on this branch"
fi

if [ -x android/gradlew ]; then
  echo "== android: unit tests and debug build"
  (cd android && ./gradlew --no-daemon testDebugUnitTest assembleDebug)
else
  echo "== android: skipped, android/ not on this branch"
fi

echo "ci-local: all checks passed"
