const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'site', 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'site', 'main.js'), 'utf8');
const tabletStyles = css.slice(
  css.indexOf('@media (max-width: 980px)'),
  css.indexOf('@media (max-width: 640px)'),
);

test('每个平台都有首次运行说明，内部签名指南不出现在首页', () => {
  assert.equal((html.match(/<details class="install-help"/g) || []).length, 3);
  assert.match(html, /系统设置 → 隐私与安全性/);
  assert.match(html, /如果下载的是 ZIP/);
  assert.match(
    html,
    /xattr -dr com\.apple\.quarantine &quot;\/Applications\/DeepSeek Harness\.app&quot;/,
  );
  assert.match(html, /Windows 已保护你的电脑/);
  assert.match(html, /chmod \+x DeepSeek-Harness-\*\.AppImage/);
  assert.doesNotMatch(html, /docs\/SIGNING\.md|代码签名指南/);
});

test('安装说明具备样式和复制命令交互', () => {
  assert.match(css, /\.install-help\s*\{/);
  assert.match(css, /\.install-command\s*\{/);
  assert.match(html, /data-copy-target="macQuarantineCommand"/);
  assert.match(js, /querySelectorAll\('\[data-copy-target\]'\)/);
  assert.match(js, /copyDefaultMarkup/);
  assert.match(tabletStyles, /\.nav-links \{ display: none; \}/);
});
