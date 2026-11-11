#!/bin/sh
# shots-diff.sh <before-dir> <after-dir> [out-dir]
# Compares two sets of screenshots taken by theme-check.mjs --shots and lists the screens that changed,
# most changed first. The clock and battery in the top right corner are blanked out so they don't count.
# With an out-dir, writes a side-by-side image (before | after | difference) for each changed screen.
# Needs ImageMagick.
before=$1; after=$2; out=$3
[ -d "$before" ] && [ -d "$after" ] || { echo "usage: $0 <before-dir> <after-dir> [out-dir]" >&2; exit 2; }
[ -n "$out" ] && mkdir -p "$out"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mask='-fill black -draw "rectangle %[fx:w*0.6],0 %[fx:w],%[fx:h*0.08]"'
for a in "$before"/*.png; do
  name=$(basename "$a"); b="$after/$name"
  [ -f "$b" ] || { echo "missing  $name"; continue; }
  eval magick "\"$a\"" $mask "\"$tmp/a.png\""
  eval magick "\"$b\"" $mask "\"$tmp/b.png\""
  n=$(magick compare -metric AE -fuzz 4% "$tmp/a.png" "$tmp/b.png" "$tmp/d.png" 2>&1 | cut -d' ' -f1)
  case "$n" in ''|*[!0-9.e+]*) n=999999;; esac
  n=${n%%.*}
  if [ "$n" -gt 150 ]; then
    echo "$n $name"
    [ -n "$out" ] && magick "$tmp/a.png" "$tmp/b.png" "$tmp/d.png" +append "$out/$name"
  fi
done | sort -rn
