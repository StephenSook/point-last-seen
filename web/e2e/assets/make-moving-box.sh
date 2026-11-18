#!/bin/sh
# Makes the synthetic test clip used by the clip intake tests: 6 seconds, 320x240, 10 fps,
# a grey frame with a red square moving left to right. No person, no real footage.
set -eu
out="$(dirname "$0")/moving-box.mp4"
ffmpeg -loglevel error -y \
  -f lavfi -i color=c=gray:s=320x240:d=6:r=10 \
  -f lavfi -i color=c=red:s=40x40:d=6:r=10 \
  -filter_complex "[0][1]overlay=x='20+t*40':y=100" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -fflags +bitexact "$out"
