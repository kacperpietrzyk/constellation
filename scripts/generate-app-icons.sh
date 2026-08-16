#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
source_svg="$root/assets/app-icon.svg"
output_png="$root/assets/app-icon.png"
output_icns="$root/assets/app-icon.icns"
output_ico="$root/assets/app-icon.ico"
work=$(mktemp -d "${TMPDIR:-/tmp}/constellation-icons.XXXXXX")
trap 'rm -rf "$work"' EXIT

command -v rsvg-convert >/dev/null
command -v sips >/dev/null
command -v iconutil >/dev/null

rsvg-convert --width 1024 --height 1024 "$source_svg" > "$output_png"
iconset="$work/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$output_png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  doubled=$((size * 2))
  sips -z "$doubled" "$doubled" "$output_png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$output_icns"

ICON_PNG="$output_png" ICON_ICO="$output_ico" python3 - <<'PY'
import os
from PIL import Image

image = Image.open(os.environ["ICON_PNG"]).convert("RGBA")
image.save(
    os.environ["ICON_ICO"],
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
PY
