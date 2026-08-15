# DSH Desktop README Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把仓库 README 改造成面向普通下载用户的产品主页，加入两张真实官网截图、完整安装指引和“律师 × AI Builder”作者介绍。

**Architecture:** README 作为单一入口，前半部分承担产品介绍、下载和首次启动引导，后半部分保留开发、构建、签名与部署信息。两张截图从正式站点 `https://dsh.chenshi.ai` 真实渲染并保存在 `docs/images/`，README 只使用仓库内相对路径，确保 GitHub 长期可展示。

**Tech Stack:** GitHub Flavored Markdown、HTML alignment blocks、Shields.io badges、Playwright/Chromium 截图、Git/GitHub Releases

## Global Constraints

- 当前桌面版版本必须保持 `0.3.0`，内置 DSH 版本必须保持 `@deepseek-ai/dsh@0.1.0-rc.6`。
- 支持平台必须写为 macOS、Windows 与 Linux；不得承诺尚未发布的平台或安装格式。
- 首页面向普通用户，代码签名配置只链接 `docs/SIGNING.md`，不在顶部展开内部证书配置。
- 作者定位使用“陈石（CSlawyer）· 执业律师、AI Builder 与法律科技实践者”，不得增加未经确认的履历、机构或奖项。
- 不修改应用代码、官网正文、Release 文件、`HANDOFF.md` 或 `README 2.md`。
- 顶部徽章限制为版本、平台、Electron、许可证和 Release 五项，不制作徽章墙。

---

## File Map

- Create: `docs/images/dsh-desktop-home.png` — 官网首页主视觉截图。
- Create: `docs/images/dsh-desktop-download.png` — 下载区和 macOS 首次打开说明截图。
- Modify: `README.md` — 产品介绍、下载、使用、开发和作者信息的统一入口。

### Task 1: Capture and verify website screenshots

**Files:**
- Create: `docs/images/dsh-desktop-home.png`
- Create: `docs/images/dsh-desktop-download.png`

**Interfaces:**
- Consumes: 正式站点 `https://dsh.chenshi.ai` 及其现有 `#download` 下载区和 macOS 安装帮助交互。
- Produces: README 可直接引用的两张 1440 像素宽 PNG 截图。

- [ ] **Step 1: Confirm the production page is reachable**

Run:

```bash
curl -sSIL --max-time 20 https://dsh.chenshi.ai | sed -n '1,8p'
```

Expected: final response contains `HTTP/2 200` or `HTTP/1.1 200`.

- [ ] **Step 2: Capture the hero screenshot**

Open `https://dsh.chenshi.ai` with a 1440 × 960 Chromium viewport, emulate `prefers-reduced-motion: reduce`, wait for `document.fonts.ready`, and save a viewport screenshot to:

```text
docs/images/dsh-desktop-home.png
```

The screenshot must include the navigation, main headline, product description, primary actions and the desktop-window demonstration without cookie prompts or browser chrome.

- [ ] **Step 3: Capture the download and installation-help screenshot**

In the same viewport, navigate to `#download`, select the macOS tab, expand the macOS first-launch instructions, scroll the download section into the upper part of the viewport, and save:

```text
docs/images/dsh-desktop-download.png
```

The screenshot must show the platform tabs, macOS download cards and the unsigned-app opening instructions; no section heading or control may be cut off.

- [ ] **Step 4: Verify dimensions and visual quality**

Run:

```bash
sips -g pixelWidth -g pixelHeight docs/images/dsh-desktop-home.png docs/images/dsh-desktop-download.png
```

Expected: both images report `pixelWidth: 1440`; inspect both images and confirm text is crisp, animations are complete, and no overlays obscure content.

- [ ] **Step 5: Commit the screenshot assets**

```bash
git add docs/images/dsh-desktop-home.png docs/images/dsh-desktop-download.png
git commit -m "docs: 添加官网产品截图"
```

### Task 2: Rewrite README as a product landing page

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 screenshots, `package.json` version/build metadata, v0.3.0 Release filenames and `docs/SIGNING.md`.
- Produces: GitHub 可渲染、普通用户能完成下载和首次启动、开发者能找到构建入口的项目主页。

- [ ] **Step 1: Replace the opening block**

Use a centered HTML block containing `build/icon.png` at 112 px, `DeepSeek Harness Desktop`, the description “把 DeepSeek Harness 装进桌面应用：下载、双击、直接使用。” and these five badges:

```text
version v0.3.0
platform macOS | Windows | Linux
Electron 43
license MIT
release v0.3.0
```

Add three text links immediately below: `访问官网` → `https://dsh.chenshi.ai`、`下载最新版` → `https://github.com/CSlawyer1985/dsh-desktop/releases/latest`、`首次打开说明` → `https://dsh.chenshi.ai/#download`.

- [ ] **Step 2: Add the product overview and hero screenshot**

Explain in two short paragraphs that this is a non-official desktop wrapper for DeepSeek Harness `dsh web`, that it bundles `@deepseek-ai/dsh@0.1.0-rc.6`, and that users do not need Node.js, npm, npx, a separately installed CLI or a terminal. Embed:

```markdown
![DeepSeek Harness Desktop 官网首页](docs/images/dsh-desktop-home.png)
```

- [ ] **Step 3: Add a compact core-capabilities section**

Use a two-column table with exactly these seven topics and concrete outcomes: 双击即用、运行组件内置、智能复用、生命周期管理、独立窗口、异常恢复、配置兼容。State that user data remains in `~/.dsh` or `C:\Users\<用户名>\.dsh`.

- [ ] **Step 4: Add platform downloads and first-launch instructions**

Link the platform rows to these verified v0.3.0 assets or the latest Release page:

```text
DeepSeek-Harness-0.3.0-mac-arm64.dmg
DeepSeek-Harness-0.3.0-mac-x64.dmg
DeepSeek-Harness-Setup-0.3.0-x64.exe
DeepSeek-Harness-Portable-0.3.0-x64.exe
DeepSeek-Harness-Setup-0.3.0-arm64.exe
DeepSeek-Harness-Portable-0.3.0-arm64.exe
DeepSeek-Harness-0.3.0-linux-x86_64.AppImage
```

Add a visible note that current packages are unsigned. Give customer-facing steps: macOS Control-click the app and choose “打开”, or remove quarantine with `xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"`; Windows choose “更多信息” then “仍要运行”; Linux run `chmod +x` before opening the AppImage. Link detailed illustrated guidance to `https://dsh.chenshi.ai/#download` and developer signing guidance to `docs/SIGNING.md`.

Embed below the instructions:

```markdown
![各平台下载与 macOS 首次打开说明](docs/images/dsh-desktop-download.png)
```

- [ ] **Step 5: Preserve and tighten technical documentation**

Keep the working sequence as four numbered steps: probe port 3080, load bundled DSH, start with Electron's runtime, poll and display UI. Retain source build commands, output formats, environment variables, logs, troubleshooting, Cloudflare Pages deployment and icon provenance. Replace the placeholder clone URL with:

```bash
git clone https://github.com/CSlawyer1985/dsh-desktop.git
```

- [ ] **Step 6: Add the approved author section**

Use this factual introduction as the body, allowing only punctuation-level editing:

```text
陈石（CSlawyer）是一名执业律师、AI Builder 与法律科技实践者。他关注如何把法律实务中的风险分级、验证纪律和结构化方法，沉淀为可复用的 Agent Skill 与开源工具，让 AI 更可靠地参与真实工作。
```

Add links to `https://chenshi.ai/`、`https://github.com/CSlawyer1985` and `https://legalagi.cn/`, and mention the representative repositories `claude-for-legal-ZH`、`contract-review-pro` and `china-lawyer-analyst` without adding star counts that may become stale.

- [ ] **Step 7: Preserve license and non-official status**

Keep the MIT license statement, make clear that the project is not affiliated with DeepSeek, and acknowledge DeepSeek Harness and Electron. Do not imply that DeepSeek endorses the desktop client.

- [ ] **Step 8: Review the complete README**

Read the rendered order from top to bottom and remove duplicate claims. Keep paragraphs under five lines where practical, use emoji only in section headings, and ensure ordinary users encounter download and first-launch instructions before build details.

- [ ] **Step 9: Commit the README rewrite**

```bash
git add README.md
git commit -m "docs: 重构项目 README"
```

### Task 3: Validate Markdown, links and repository scope

**Files:**
- Verify: `README.md`
- Verify: `docs/images/dsh-desktop-home.png`
- Verify: `docs/images/dsh-desktop-download.png`

**Interfaces:**
- Consumes: completed README and screenshots.
- Produces: an evidence-backed handoff with no unrelated files staged.

- [ ] **Step 1: Verify local references and required copy**

Run:

```bash
test -f docs/images/dsh-desktop-home.png
test -f docs/images/dsh-desktop-download.png
test -f docs/SIGNING.md
rg -n "0\.3\.0|0\.1\.0-rc\.6|dsh\.chenshi\.ai|陈石（CSlawyer）|legalagi\.cn" README.md
```

Expected: all `test` commands exit 0 and every required fact has at least one match.

- [ ] **Step 2: Verify external entry points**

Run:

```bash
for url in \
  https://dsh.chenshi.ai \
  https://github.com/CSlawyer1985/dsh-desktop/releases/latest \
  https://chenshi.ai/ \
  https://legalagi.cn/; do
  curl -sSIL --max-time 20 "$url" | sed -n '1p'
done
```

Expected: each URL returns an HTTP response and none fails DNS or TLS negotiation.

- [ ] **Step 3: Run Markdown and repository hygiene checks**

Run:

```bash
git diff --check HEAD~2..HEAD
git status --short
```

Expected: `git diff --check` has no output; `HANDOFF.md` and `README 2.md` remain untracked and are not part of either commit.

- [ ] **Step 4: Inspect the final commits**

Run:

```bash
git log -4 --oneline --decorate
git show --stat --oneline HEAD~1..HEAD
```

Expected: screenshot and README commits contain only the files named in this plan, with no application or website source changes.

