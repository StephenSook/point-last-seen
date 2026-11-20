#!/usr/bin/env bash
# Installs ffmpeg on a CI runner for the clip harnesses, bounded: an apt mirror that stalls fails this attempt
# after a set time (instead of holding the job until its 15-minute limit), and the install is tried twice.
# Exits non-zero unless ffmpeg is on PATH at the end.
set -u
for attempt in 1 2; do
  if sudo timeout 60 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 update -qq \
    && sudo timeout 120 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 install -y -qq --no-install-recommends ffmpeg; then
    break
  fi
  echo "install-ffmpeg: attempt $attempt did not finish; trying again"
  sleep 5
done
command -v ffmpeg >/dev/null || { echo "install-ffmpeg: ffmpeg is not installed after 2 attempts"; exit 1; }
ffmpeg -version | head -1
