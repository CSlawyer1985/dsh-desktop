#!/bin/bash
# 一键构建桌面端安装包：生成图标 → electron-builder 产出安装程序
# 用法: bash scripts/build.sh [mac|win|linux]   默认 = 当前平台
# 官方 CLI 含原生依赖，本地只构建当前系统/芯片；全平台产物由 GitHub Actions 生成。
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
ARCH="$(node -p 'process.arch')"

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
  mac)   npx electron-builder --mac "--$ARCH" ;;
  win)   npx electron-builder --win "--$ARCH" ;;
  linux) npx electron-builder --linux "--$ARCH" ;;
  all)
    echo "    内置 CLI 含平台原生依赖；请通过 GitHub Actions 构建全平台安装包。"
    exit 2
    ;;
  *)
    case "$(node -p 'process.platform')" in
      darwin) npx electron-builder --mac "--$ARCH" ;;
      win32)  npx electron-builder --win "--$ARCH" ;;
      linux)  npx electron-builder --linux "--$ARCH" ;;
      *)      echo "    不支持的构建平台"; exit 2 ;;
    esac
    ;;
esac

echo "==> 完成，产物在 dist/"
