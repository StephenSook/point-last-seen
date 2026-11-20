#!/usr/bin/env bash
# Renders the iPhone app icon from the web app's mark (web/public/favicon.svg): 1024 x 1024 pixels,
# no alpha channel (App Store Connect refuses an icon with one). Needs rsvg-convert and ImageMagick.
# Run from anywhere: bash ios/scripts/make_app_icon.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
out=ios/PLS/Assets.xcassets/AppIcon.appiconset/icon-1024.png
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
rsvg-convert -w 1024 -h 1024 web/public/favicon.svg -o "$tmp/icon.png"
magick "$tmp/icon.png" -background "#110F0D" -alpha remove -alpha off -strip "PNG24:$out"
echo "make_app_icon: wrote $out ($(magick identify -format '%wx%h %[channels]' "$out"))"
