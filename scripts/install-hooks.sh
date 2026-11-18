#!/usr/bin/env bash
# Installs pre-commit and pre-merge-commit hooks that refuse every commit after
# the submission freeze boundary, 2026-11-30T22:00:00Z (epoch 1796076000).
# The hooks dir comes from git itself, so worktrees and gitfile layouts work.
# PLS_FREEZE_EPOCH overrides the boundary only to prove the hook in a throwaway repo.
set -euo pipefail
BOUNDARY_EPOCH="${PLS_FREEZE_EPOCH:-1796076000}"
hooks_dir="$(git rev-parse --git-path hooks)"
mkdir -p "$hooks_dir"
for name in pre-commit pre-merge-commit; do
  cat > "$hooks_dir/$name" <<HOOK
#!/usr/bin/env bash
# Installed by scripts/install-hooks.sh. Freeze boundary epoch ${BOUNDARY_EPOCH}.
now=\$(date -u +%s)
if [ "\$now" -ge ${BOUNDARY_EPOCH} ]; then
  echo "Freeze: commits are closed after the submission deadline (epoch ${BOUNDARY_EPOCH})." >&2
  exit 1
fi
exit 0
HOOK
  chmod +x "$hooks_dir/$name"
done
echo "installed pre-commit and pre-merge-commit in $hooks_dir (boundary epoch $BOUNDARY_EPOCH)"
