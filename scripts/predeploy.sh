#!/usr/bin/env bash
# Every check to run before a hosting deploy, in one command, so whoever deploys runs the same set. Run it from a
# clean checkout of the commit to deploy (origin/main). It never deploys: it stops at the first failure, and when
# every check passes it prints the deploy command and what to check after it. Its one write is the last step, after
# every check has passed: it uploads the build's source maps to Crashlytics and deletes them from web/dist.
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
#   6. No built file names a source map: the build writes its maps only for the upload in step 10, so no served file
#      points a browser at one.
#   7. The built page links main's stylesheet before base.css: in the other order the map's own styles lose and the
#      live map is drawn 0 px tall.
#   8. mapCascade.spec.ts against that build: the map's computed styles in a real browser.
#   9. scripts/judge_seed_check.py: the drill every practice search is copied from still matches its baseline.
#  10. The source maps go to Crashlytics under the commit the bundle reports (so its stack traces are readable), then
#      are deleted (--clean); none may remain. firebase.json also ignores **/*.map, so a map left behind is never
#      deployed. It needs `firebase crashlytics:setup` run once for the project.
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
say "1/10 clean tree at origin/main $HEAD_SHA"

# 2. The build's web config.
[ -f .env.local ] || fail "no .env.local at the repository root: copy it from a working checkout (it is gitignored)"
git check-ignore -q .env.local || fail ".env.local is not ignored by git"
say "2/10 .env.local present and ignored"

# 3. The live commit is an ancestor.
LIVE_SHA="$(python3 -I -c "
import json, sys, urllib.request
req = urllib.request.Request(sys.argv[1] + '/version.json', headers={'Cache-Control': 'no-cache'})
print(json.loads(urllib.request.urlopen(req, timeout=20).read())['commit'])
" "$SITE")" || fail "could not read $SITE/version.json"
git cat-file -e "$LIVE_SHA^{commit}" 2>/dev/null || fail "the live commit $LIVE_SHA is not in this clone: fetch it first"
git merge-base --is-ancestor "$LIVE_SHA" HEAD || fail "the live commit $LIVE_SHA is not an ancestor of HEAD: deploying would roll it back"
say "3/10 live $LIVE_SHA is an ancestor of HEAD"

# 4. Dependencies.
if [ ! -d node_modules ] || ! git diff --quiet "$LIVE_SHA" HEAD -- package-lock.json; then
  npm ci || fail "npm ci"
  say "4/10 npm ci done"
else
  say "4/10 package-lock.json unchanged since the live commit; node_modules present"
fi

# 5. Build.
npm run build -w web || fail "the web build"
say "5/10 web build done"

# 6. No built file names a source map. A search of nothing must fail, not pass: macOS grep with --include skips a
#    missing directory and exits 1, so a built script must exist first; and grep exits 2 when it cannot search.
[ -n "$(find web/dist/assets -name '*.js' -print -quit)" ] || fail "no built script in web/dist/assets to search"
grep -rl --include='*.js' --include='*.mjs' --include='*.css' sourceMappingURL web/dist >/dev/null
case $? in
  0) fail "a built file names a source map: the web build must write its maps as hidden" ;;
  1) ;;
  *) fail "could not search web/dist for source map comments" ;;
esac
say "6/10 no built file names a source map"

# 7. Stylesheet order in the built page.
python3 -I - web/dist/index.html <<'EOF' || fail "the built page links base.css before main's stylesheet (the live map would be 0 px tall)"
import re, sys
links = re.findall(r'<link rel="stylesheet"[^>]*href="/assets/([a-z]+)-[^"]+\.css"', open(sys.argv[1]).read())
print("predeploy: stylesheets in order:", links)
sys.exit(0 if "main" in links and "base" in links and links.index("main") < links.index("base") else 1)
EOF
say "7/10 main's stylesheet before base.css"

# 8. The map's styles in a real browser, against this build.
(cd web && PLS_PREVIEW_DIR="$ROOT/web/dist" CI=1 bash ../scripts/heavy.sh npx playwright test -c e2e/ci.config.ts mapCascade.spec.ts) || fail "mapCascade.spec.ts"
say "8/10 mapCascade passed"

# 9. The judge seed.
python3 -I scripts/judge_seed_check.py "$PROJECT" || fail "judge_seed_check.py: the judge seed drill changed"
say "9/10 judge seed matches its baseline"

# 10. Source maps to Crashlytics, then out of web/dist. The only write, after every check has passed.
APP_ID="$(python3 -I - .env.local <<'EOF'
import re, sys
for line in open(sys.argv[1]):
    m = re.match(r'\s*VITE_FIREBASE_APP_ID\s*=\s*"?([^"\s]+)', line)
    if m:
        print(m.group(1))
        break
EOF
)"
[ -n "$APP_ID" ] || fail "no VITE_FIREBASE_APP_ID in .env.local"
BUNDLE_SHA="$(python3 -I -c "import json, sys; print(json.load(open(sys.argv[1]))['commit'])" web/dist/version.json)" || fail "could not read web/dist/version.json"
[ "$BUNDLE_SHA" = "$HEAD_SHA" ] || fail "the bundle reports $BUNDLE_SHA, not HEAD $HEAD_SHA"
# The CLI exits 0 when it finds no map, and also when some uploads fail (it deletes only the maps it uploaded), so
# the count before and the leftover check after are the verdict, not its exit code.
MAPS="$(find web/dist -name '*.js.map' | wc -l | tr -d ' ')" || fail "could not count the source maps in web/dist"
[ "$MAPS" -gt 0 ] || fail "no .js.map in web/dist to upload: the web build must write its maps"
firebase crashlytics:sourcemap:upload --project "$PROJECT" --app "$APP_ID" --app-version "$BUNDLE_SHA" --clean web/dist || fail "the source map upload (run firebase crashlytics:setup once if Crashlytics is not set up)"
LEFT="$(find web/dist -name '*.map' -print -quit)" || fail "could not search web/dist for .map files"
[ -z "$LEFT" ] || fail "a .map file is still in web/dist after the upload (a failed upload leaves its map): $LEFT"
say "10/10 $MAPS source maps uploaded to Crashlytics under $BUNDLE_SHA and removed from web/dist"

say "every check passed for $HEAD_SHA."
say "deploy with:  firebase deploy --only hosting --project $PROJECT"
say "then check:   $SITE/version.json reports $HEAD_SHA, python3 -I scripts/served_version_check.py, a /assets/*.js.map path answers 404, and the live suite"
