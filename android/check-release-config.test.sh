#!/usr/bin/env bash
# Tests check-release-config.sh against a stub apkanalyzer that prints a release BuildConfig, so it runs with no
# SDK and no built APK. Each case is a want: the flag on passes, off or missing fails. Run it from anywhere:
#   bash android/check-release-config.test.sh
# Exit 0 when every case gives its wanted result, 1 otherwise.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'find "$tmp" -type f -delete; find "$tmp" -depth -type d -exec rmdir {} \;' EXIT
mkdir -p "$tmp/sdk/cmdline-tools/latest/bin"
printf 'not an apk, only non-empty\n' > "$tmp/app.apk"

# The class as apkanalyzer prints it for a release build (the shape the check reads).
dump() {
  cat <<EOF
.class public final Lapp/pointlastseen/family/BuildConfig;
.super Ljava/lang/Object;
.source "BuildConfig.java"


# static fields
.field public static final APPLICATION_ID:Ljava/lang/String; = "app.pointlastseen.family"

.field public static final BUILD_TYPE:Ljava/lang/String; = "release"

.field public static final DEBUG:Z = false
$1

.field public static final VERSION_CODE:I = 0x6b01f16c

.field public static final VERSION_NAME:Ljava/lang/String; = "0.1.0"


# direct methods
.method public constructor <init>()V
    .registers 1

    .line 6
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method
EOF
}

bad=0
want() { # $1 case name, $2 wanted exit code, $3 the SCRIPT_911 line the stub prints
  dump "$3" > "$tmp/out.txt"
  printf '#!/usr/bin/env bash\ncat "%s"\n' "$tmp/out.txt" > "$tmp/sdk/cmdline-tools/latest/bin/apkanalyzer"
  chmod +x "$tmp/sdk/cmdline-tools/latest/bin/apkanalyzer"
  local got
  for run in 1 2 3 4 5; do
    ANDROID_HOME="$tmp/sdk" bash "$here/check-release-config.sh" "$tmp/app.apk" > /dev/null 2>&1
    got=$?
    if [ "$got" -ne "$2" ]; then echo "check-release-config.test: $1: exit $got, want $2 (run $run)"; bad=1; return; fi
  done
  echo "check-release-config.test: $1: ok"
}
want "flag on" 0 '.field public static final SCRIPT_911:Z = true'
want "flag off" 1 '.field public static final SCRIPT_911:Z = false'
want "flag missing" 1 ''
exit "$bad"
