#!/bin/bash
# 由 icon.png 生成 macOS 的 .icns（sips 缩放 + iconutil 打包）
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" build/icon.png --out "build/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z "$((s * 2))" "$((s * 2))" build/icon.png --out "build/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
echo "icon.icns created"
