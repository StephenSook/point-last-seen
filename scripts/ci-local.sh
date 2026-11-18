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

echo "== gates: secret scan (full history)"
gitleaks git --redact --no-banner --log-opts="--all" .

echo "ci-local: all checks passed"
