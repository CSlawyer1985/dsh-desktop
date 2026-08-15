# Download Installation Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在下载区为 macOS、Windows 和 Linux 用户提供不破坏主页风格的首次运行说明，并移除对客页面中的内部签名指南。

**Architecture:** 每个平台的安装说明放入对应标签面板，使用原生 `<details>` 保持默认紧凑和无障碍语义。现有页面脚本增加通用复制函数，复用到源码构建命令和 macOS 隔离标记命令；Node 内置测试负责锁定文案、结构和交互契约。

**Tech Stack:** 静态 HTML、CSS、原生 JavaScript、Node.js `node:test`、浏览器视觉检查

## Global Constraints

- 首页只展示面向下载用户的运行帮助，不展示内部证书或 CI 配置。
- 仅修改 `site/` 页面文件、页面测试和本实施计划，不修改应用本体、构建、Release 或 Cloudflare 配置。
- 保持现有深蓝黑、冷灰、蓝色强调和细描边风格。
- macOS 的放行命令必须精确为 `xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"`。
- 不建议或展示全局关闭 Gatekeeper 的命令。
- 360px 视口不得出现横向页面溢出。

---

### Task 1: 平台安装说明内容与结构

**Files:**
- Create: `tests/site-install-help.test.js`
- Modify: `site/index.html:183-305`

**Interfaces:**
- Consumes: 现有 `.tab-panel[data-panel]` 平台面板和 `.artifact-list` 下载卡片结构。
- Produces: 三个 `.install-help` 原生折叠组件，以及 `#macQuarantineCommand` 命令节点。

- [ ] **Step 1: 写入失败的页面内容契约测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');

test('每个平台都有首次运行说明，内部签名指南不出现在首页', () => {
  assert.equal((html.match(/<details class="install-help"/g) || []).length, 3);
  assert.match(html, /系统设置 → 隐私与安全性/);
  assert.match(html, /xattr -dr com\.apple\.quarantine &quot;\/Applications\/DeepSeek Harness\.app&quot;/);
  assert.match(html, /Windows 已保护你的电脑/);
  assert.match(html, /chmod \+x DeepSeek-Harness-\*\.AppImage/);
  assert.doesNotMatch(html, /docs\/SIGNING\.md|代码签名指南/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/site-install-help.test.js`

Expected: FAIL，提示找不到三个 `.install-help` 组件。

- [ ] **Step 3: 在三个平台面板中加入折叠说明**

在每个 `.artifact-list` 后加入 `<details class="install-help">`。摘要统一使用“下载后打不开？”和“查看安装方法”；展开内容包括平台专属步骤、未签名原因和只从本站或 GitHub Releases 下载的安全提醒。macOS 命令放在：

```html
<code id="macQuarantineCommand">xattr -dr com.apple.quarantine &quot;/Applications/DeepSeek Harness.app&quot;</code>
```

删除下载区原有“代码签名指南”链接，将普通备注收敛为 CLI 前置条件和历史版本链接。

- [ ] **Step 4: 运行内容契约测试并确认通过**

Run: `node --test tests/site-install-help.test.js`

Expected: PASS。

- [ ] **Step 5: 提交内容结构**

```bash
git add tests/site-install-help.test.js site/index.html
git commit -m "feat: 添加下载后的首次运行说明"
```

### Task 2: 样式与复制交互

**Files:**
- Modify: `tests/site-install-help.test.js`
- Modify: `site/style.css:534-536, 629-651`
- Modify: `site/main.js:104-135`

**Interfaces:**
- Consumes: `.install-help` 结构、`#macQuarantineCommand` 文本和现有 `#copyBtn`。
- Produces: `[data-copy-target]` 通用复制按钮行为；按钮成功态文本为“已复制”。

- [ ] **Step 1: 扩充失败的样式与交互契约测试**

```js
const css = fs.readFileSync(path.join(__dirname, '..', 'site', 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'site', 'main.js'), 'utf8');

test('安装说明具备样式和复制命令交互', () => {
  assert.match(css, /\.install-help\s*\{/);
  assert.match(css, /\.install-command\s*\{/);
  assert.match(html, /data-copy-target="macQuarantineCommand"/);
  assert.match(js, /querySelectorAll\('\[data-copy-target\]'\)/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/site-install-help.test.js`

Expected: 新增的样式与交互测试 FAIL。

- [ ] **Step 3: 实现与现有下载区一致的样式**

为摘要行、步骤列表、命令区、复制按钮、安全说明和展开箭头增加 CSS。使用现有 `--border`、`--radius-card`、`--font-mono`、`--brand` 和文字色变量；移动端降低容器内边距并让命令区纵向排列，不引入新依赖。

- [ ] **Step 4: 抽取并复用复制函数**

```js
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;
    await copyText(target.textContent.trim());
    button.textContent = '已复制';
    setTimeout(() => { button.textContent = '复制命令'; }, 2000);
  });
});
```

现有源码构建复制按钮改为调用同一个 `copyText`，保留原有 SVG、成功态和两秒恢复行为。

- [ ] **Step 5: 运行契约测试和语法检查**

Run: `node --test tests/site-install-help.test.js && node --check site/main.js`

Expected: 全部 PASS，JavaScript 无语法错误。

- [ ] **Step 6: 提交样式与交互**

```bash
git add tests/site-install-help.test.js site/style.css site/main.js
git commit -m "style: 完善安装帮助的交互与响应式布局"
```

### Task 3: 浏览器验收

**Files:**
- Verify: `site/index.html`
- Verify: `site/style.css`
- Verify: `site/main.js`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的完整静态页面。
- Produces: 桌面端和 360px 移动端的视觉与交互验收结果。

- [ ] **Step 1: 启动本地静态服务器**

Run: `python3 -m http.server 4173 --directory site`

Expected: `http://127.0.0.1:4173` 返回首页。

- [ ] **Step 2: 检查桌面端**

在 1440×1000 视口打开下载区，确认说明默认收起、下载按钮仍为视觉重点；依次展开 macOS、Windows、Linux 说明，确认文案和平台对应。

- [ ] **Step 3: 检查复制交互**

展开 macOS 说明并点击“复制命令”，确认按钮显示“已复制”，剪贴板文本严格等于：

```text
xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness.app"
```

- [ ] **Step 4: 检查移动端和无障碍**

在 360×800 视口确认无横向页面溢出、命令区可读、按钮可点击；使用键盘聚焦 `<summary>` 并按 Enter 展开，确认焦点轮廓可见。

- [ ] **Step 5: 运行最终检查**

Run: `node --test tests/site-install-help.test.js && node --check site/main.js && git diff --check`

Expected: 所有检查通过，`git diff --check` 无输出。

- [ ] **Step 6: 提交最终修正**

仅在浏览器验收产生修正时执行：

```bash
git add site/index.html site/style.css site/main.js tests/site-install-help.test.js
git commit -m "fix: 修正安装帮助的移动端显示"
```
