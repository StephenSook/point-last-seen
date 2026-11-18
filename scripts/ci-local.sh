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
"$PY" -I -m pytest scripts/test_check_schema_parity.py tools/vectors/test_make_vectors.py -q

echo "== gates: secret scan (full history)"
gitleaks git --redact --no-banner --log-opts="--all" .

if [ -d ios/PLSCore ]; then
  echo "== swift-core: Swift core tests"
  swift test --package-path ios/PLSCore
else
  echo "== swift-core: skipped, ios/PLSCore not on this branch"
fi

echo "ci-local: all checks passed"
