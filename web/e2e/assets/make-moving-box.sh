#!/bin/sh
# Makes the synthetic test clip used by the clip tests: 6 seconds, 320x240, 10 fps, a grey frame
# with a red square moving left to right. No person, no real footage.
# Usage: make-moving-box.sh [output path] [square's y in pixels, 0 to 200] [square's colour, 0xRRGGBB]
# A different colour gives different bytes (a different SHA-256), so a live test can use a fresh clip. The y alone
# is not enough: neighbouring heights can encode to the same bytes.
set -eu
out="${1:-$(dirname "$0")/moving-box.mp4}"
y="${2:-100}"
colour="${3:-red}"
ffmpeg -loglevel error -y \
  -f lavfi -i color=c=gray:s=320x240:d=6:r=10 \
  -f lavfi -i color=c=$colour:s=40x40:d=6:r=10 \
  -filter_complex "[0][1]overlay=x='20+t*40':y=$y" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -fflags +bitexact "$out"
