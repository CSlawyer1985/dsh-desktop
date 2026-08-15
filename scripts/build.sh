#!/bin/bash
# 一键构建桌面端安装包：生成图标 → electron-builder 产出安装程序
# 用法: bash scripts/build.sh [mac|win|linux|all]   默认 = 当前平台
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"

echo "==> 生成图标（官方 DeepSeek logo，白色衬黑底）"
node scripts/make-icon-render.js
npx electron scripts/render-icon.js
if command -v iconutil >/dev/null 2>&1; then
  bash scripts/make-icns.sh
else
  echo "    未找到 iconutil（非 macOS），mac 图标将由 electron-builder 从 PNG 自动生成"
fi

# 下载缓存放项目内（避免系统缓存目录权限问题）
export electron_config_cache="$PWD/.electron-cache"
export ELECTRON_BUILDER_CACHE="$PWD/.electron-builder-cache"

case "$TARGET" in
  mac)   npx electron-builder --mac --arm64 --x64 ;;
  win)   npx electron-builder --win --x64 --arm64 ;;
  linux) npx electron-builder --linux ;;
  all)   npx electron-builder -mwl --arm64 --x64 ;;
  *)     npx electron-builder --mac --arm64 --x64 ;;
esac

echo "==> 完成，产物在 dist/"
