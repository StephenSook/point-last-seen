#!/usr/bin/env bash
# Every check to run before a hosting deploy, in one command, so whoever deploys runs the same set. Run it from a
# clean checkout of the commit to deploy (origin/main). It never deploys: it stops at the first failure, and when
# every check passes it prints the deploy command and what to check after it.
#
# Usage: bash scripts/predeploy.sh
#   PLS_PREDEPLOY_PROJECT   Firebase project (default buildhybridai-2026-yg3m)
#
# The checks, in order:
#   1. The tree is clean and HEAD is origin/main.
#   2. The repo root has .env.local (the build's web config; it is gitignored, so copy it from a working checkout).
#   3. The live site's commit (its /version.json) is an ancestor of HEAD, so the deploy cannot roll the site back.
#   4. npm ci when package-lock.json changed since the live commit or node_modules is missing.
#   5. The web build.
#   6. The built page links main's stylesheet before base.css: in the other order the map's own styles lose and the
#      live map is drawn 0 px tall.
#   7. mapCascade.spec.ts against that build: the map's computed styles in a real browser.
#   8. scripts/judge_seed_check.py: the drill every practice search is copied from still matches its baseline.
set -uo pipefail

PROJECT="${PLS_PREDEPLOY_PROJECT:-buildhybridai-2026-yg3m}"
SITE="https://$PROJECT.web.app"

say() { echo "predeploy: $*"; }
fail() {
  echo "predeploy: FAIL: $*"
  exit 1
}

ROOT="$(git rev-parse --show-toplevel)" || fail "not inside the repository"
cd "$ROOT" || fail "cannot enter $ROOT"

# 1. Clean tree at origin/main.
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "the working tree has changes: deploy from a clean checkout"
git fetch -q origin main || fail "could not fetch origin/main"
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
[ "$HEAD_SHA" = "$MAIN_SHA" ] || fail "HEAD $HEAD_SHA is not origin/main $MAIN_SHA"
say "1/8 clean tree at origin/main $HEAD_SHA"

# 2. The build's web config.
[ -f .env.local ] || fail "no .env.local at the repository root: copy it from a working checkout (it is gitignored)"
git check-ignore -q .env.local || fail ".env.local is not ignored by git"
say "2/8 .env.local present and ignored"

# 3. The live commit is an ancestor.
LIVE_SHA="$(python3 -I -c "
import json, sys, urllib.request
req = urllib.request.Request(sys.argv[1] + '/version.json', headers={'Cache-Control': 'no-cache'})
print(json.loads(urllib.request.urlopen(req, timeout=20).read())['commit'])
" "$SITE")" || fail "could not read $SITE/version.json"
git cat-file -e "$LIVE_SHA^{commit}" 2>/dev/null || fail "the live commit $LIVE_SHA is not in this clone: fetch it first"
git merge-base --is-ancestor "$LIVE_SHA" HEAD || fail "the live commit $LIVE_SHA is not an ancestor of HEAD: deploying would roll it back"
say "3/8 live $LIVE_SHA is an ancestor of HEAD"

# 4. Dependencies.
if [ ! -d node_modules ] || ! git diff --quiet "$LIVE_SHA" HEAD -- package-lock.json; then
  npm ci || fail "npm ci"
  say "4/8 npm ci done"
else
  say "4/8 package-lock.json unchanged since the live commit; node_modules present"
fi

# 5. Build.
npm run build -w web || fail "the web build"
say "5/8 web build done"

# 6. Stylesheet order in the built page.
python3 -I - web/dist/index.html <<'EOF' || fail "the built page links base.css before main's stylesheet (the live map would be 0 px tall)"
import re, sys
links = re.findall(r'<link rel="stylesheet"[^>]*href="/assets/([a-z]+)-[^"]+\.css"', open(sys.argv[1]).read())
print("predeploy: stylesheets in order:", links)
sys.exit(0 if "main" in links and "base" in links and links.index("main") < links.index("base") else 1)
EOF
say "6/8 main's stylesheet before base.css"

# 7. The map's styles in a real browser, against this build.
(cd web && PLS_PREVIEW_DIR="$ROOT/web/dist" CI=1 bash ../scripts/heavy.sh npx playwright test -c e2e/ci.config.ts mapCascade.spec.ts) || fail "mapCascade.spec.ts"
say "7/8 mapCascade passed"

# 8. The judge seed.
python3 -I scripts/judge_seed_check.py "$PROJECT" || fail "judge_seed_check.py: the judge seed drill changed"
say "8/8 judge seed matches its baseline"

say "every check passed for $HEAD_SHA."
say "deploy with:  firebase deploy --only hosting --project $PROJECT"
say "then check:   $SITE/version.json reports $HEAD_SHA, python3 -I scripts/served_version_check.py, and the live suite"
