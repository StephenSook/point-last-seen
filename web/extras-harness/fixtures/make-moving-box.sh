#!/bin/sh
# Makes the clip time machine's test clip. The box moves right by 60 pixels each second.
set -eu
out="${1:-$(dirname "$0")/moving-box.mp4}"
tmp=$(mktemp "${out}.XXXXXX")
trap 'if [ -f "$tmp" ]; then rm -f "$tmp"; fi' EXIT

ffmpeg -loglevel error -y \
  -f lavfi -i color=c=0x202020:s=640x360:d=9:r=30 \
  -f lavfi -i color=c=0xE8E8E8:s=80x160:d=9:r=30 \
  -filter_complex "[0][1]overlay=x='40+t*60':y=100" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -fflags +bitexact -f mp4 "$tmp"
mv "$tmp" "$out"
