# DeepSeek Harness Desktop

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh web`）封装成跨平台桌面应用：双击图标即可打开，无需每次手动启动服务、再开浏览器输网址。

支持 **macOS / Windows / Linux**，官方 logo 图标（白色星标衬黑底）。

## 特性

- **一键启动**：自动拉起 `dsh web` 服务（默认端口 3080），就绪后加载 UI
- **智能复用**：如果服务已经在运行（比如你在终端里跑过 `dsh web`），直接复用，不重复启动
- **生命周期管理**：退出应用时自动关闭它自己拉起的服务进程；复用已有服务时不会误关别人的
- **独立窗口**：无地址栏、无标签页，固定到 Dock / 任务栏后和原生 App 体验一致
- **官方图标**：DeepSeek 官方 logo（白色星标衬黑底），矢量渲染
- **服务守护**：服务进程意外退出时弹窗提示，可一键重启
- **复用你的配置**：直接使用本机 `~/.dsh`（Windows 为 `C:\Users\<你>\.dsh`）下现有的 profile、插件、会话数据，与命令行体验完全一致

## 安装

从 Releases 下载对应系统的安装包：

| 平台 | 安装包 |
| --- | --- |
| macOS | `DeepSeek-Harness-*-mac-arm64.dmg`（Apple Silicon）或 `-mac-x64.dmg`（Intel） |
| Windows | `DeepSeek-Harness-Setup-*.exe`（安装器）或 `DeepSeek-Harness-Portable-*.exe`（免安装） |
| Linux | `DeepSeek-Harness-*.AppImage` |

> **前置条件**：桌面端是 DeepSeek Harness 的"壳"，需要本机装有 `dsh` CLI。
> 只要你在终端跑过一次 `npx @deepseek-ai/dsh web`（或在终端全局安装过 `dsh`），桌面端就能自动发现并复用；
> 找不到时也会提示你用 npx 在线启动（需要联网）。

> **未签名说明**：未配置签名密钥的构建产物没有代码签名，首次打开时系统可能拦截：
> - macOS：右键点击 App →「打开」（Gatekeeper 提示仅首次出现）；或终端执行 `xattr -dr com.apple.quarantine <路径>`
> - Windows：SmartScreen 提示时点「更多信息」→「仍要运行」
>
> 想要正式分发（无拦截、可公证）：参见 **[docs/SIGNING.md](docs/SIGNING.md)** —— 配置 Apple Developer ID 签名 + 公证、Windows 证书签名（OV / Azure Trusted Signing / SignPath），CI 已内置全部密钥注入。

## 工作原理

1. 启动时探测 `http://127.0.0.1:3080` 是否已有 DSH 服务（按首页的 `__DSH_BOOT__` 标记判断）
2. 没有则在本机查找 `dsh` CLI（查找顺序：`$DSH_CLI` → npm 全局安装 → npx 缓存，取最新），找不到则询问是否用 `npx` 在线启动
3. 用 Electron 自带的 Node 运行时（`ELECTRON_RUN_AS_NODE` + `--expose-internals`）启动 `dsh --profile web --port 3080`，不依赖用户 shell 的 PATH
4. 轮询等待服务就绪（最长 120 秒），然后加载 UI

各平台 CLI 查找位置：

- macOS / Linux：`~/.npm-global`、`/usr/local/lib/node_modules`、`/usr/lib/node_modules`、`~/.npm/_npx/*`
- Windows：`%APPDATA%\npm`、`%LOCALAPPDATA%\npm-cache\_npx\*`

## 作者

- **CSlawyer** · [chenshi.ai](https://chenshi.ai)

## 从源码构建

```bash
git clone <你的仓库地址>
cd dsh-desktop
npm ci
bash scripts/build.sh mac    # 或 win / linux / all
```

产物输出到 `dist/`：

- macOS：`.dmg`（安装镜像）+ `.zip`
- Windows：`Setup .exe`（NSIS 安装器）+ `Portable .exe`
- Linux：`.AppImage`

GitHub Actions 已配置好三平台构建（`.github/workflows/build.yml`），打 `v*` tag 即可自动产出全部安装包。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DSH_DESKTOP_PORT` | 覆盖端口（默认 `3080`） |
| `DSH_CLI` | 指定 dsh CLI 入口（`lib/bin.js` 的绝对路径） |
| `DSH_HOME` | 数据目录（默认 `~/.dsh`） |

调试运行（开发模式）：`DSH_DESKTOP_PORT=3081 npm start`

## 日志与排障

- 服务日志（`server.log`，在应用数据目录）：
  - macOS：`~/Library/Application Support/DeepSeek Harness/`
  - Windows：`%APPDATA%\DeepSeek Harness\`
  - Linux：`~/.config/DeepSeek Harness/`
- 端口 3080 被其他程序占用：服务启动会失败，弹窗里会显示错误日志；换端口用 `DSH_DESKTOP_PORT`，或先停掉占用进程
- 找不到 dsh：确保曾用 `npx @deepseek-ai/dsh web` 跑过，或设置 `DSH_CLI`
- 服务进程退出后残留：下次启动会检测到并直接复用

## 介绍页（site/）

`site/` 目录是项目的下载介绍页（风格参照 deepseek.com/harness），包含各平台下载入口与作者信息。

- 本地预览：`open site/index.html`
- 自动部署：推送 `main` 分支后由 `.github/workflows/pages.yml` 发布到 GitHub Pages
- 下载链接与版本号在 `site/main.js` 顶部的 `CONFIG` 中维护（开源后替换为你的仓库地址）

## 图标

应用图标来自 DeepSeek 官方品牌 logo（SVG 见 `build/deepseek-logo.svg`），渲染链路：

`scripts/make-icon-render.js`（提取官方星标）→ `scripts/render-icon.js`（Chromium 矢量渲染 PNG）→ `scripts/make-icns.sh`（macOS icns）

替换图标：替换 `build/deepseek-logo.svg` 或直接覆盖 `build/icon.png` 后重新构建。

## 开源与声明

- MIT License，可自由使用、修改、分发
- 本项目与 DeepSeek 官方无关，为非官方社区封装；"DeepSeek" 名称与 logo 为 DeepSeek 的商标，仅用于指代其产品
- 桌面端**不内置** dsh 运行时：它只负责发现并托管你本机已有的 dsh 安装，避免版本锁定与重复分发
