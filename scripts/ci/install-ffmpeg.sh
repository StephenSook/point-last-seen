#!/usr/bin/env bash
# Installs ffmpeg on a CI runner for the clip harnesses. First a pinned static build from a GitHub release (BtbN
# FFmpeg-Builds, the month-end autobuild of 2026-10-31, release 8.1), checked against its SHA-256 before use, since
# Ubuntu's apt mirrors stalled the old install three times; then, if that fails, one bounded apt install. Each
# network call has a time limit, so a stall fails this step with a reason instead of holding the job to its limit.
# Exits non-zero unless ffmpeg runs at the end.
set -u
URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n8.1.3-27-g8dca1586f4-linux64-gpl-8.1.tar.xz"
SHA256="41e9c565594c390622cf968d82fa4135d9e9a11d06c1515644288cbc844e3380"

from_release() {
  local dir
  dir="$(mktemp -d)"
  timeout 240 curl -fsSL --retry 3 --connect-timeout 20 --max-time 120 -o "$dir/ffmpeg.tar.xz" "$URL" || return 1
  echo "$SHA256  $dir/ffmpeg.tar.xz" | sha256sum -c --quiet - || { echo "install-ffmpeg: checksum mismatch"; return 1; }
  tar -xJf "$dir/ffmpeg.tar.xz" -C "$dir" || return 1
  sudo install -m 0755 "$dir"/ffmpeg-*/bin/ffmpeg "$dir"/ffmpeg-*/bin/ffprobe /usr/local/bin/
}

from_apt() {
  sudo timeout 60 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 update -qq \
    && sudo timeout 120 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 install -y -qq --no-install-recommends ffmpeg
}

if from_release; then
  echo "install-ffmpeg: installed the pinned static build"
else
  echo "install-ffmpeg: the pinned build did not install; trying apt once"
  from_apt || echo "install-ffmpeg: apt did not finish"
fi
command -v ffmpeg >/dev/null || { echo "install-ffmpeg: ffmpeg is not installed"; exit 1; }
ffmpeg -version | head -1
