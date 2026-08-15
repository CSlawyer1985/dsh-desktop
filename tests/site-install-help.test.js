const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');

test('每个平台都有首次运行说明，内部签名指南不出现在首页', () => {
  assert.equal((html.match(/<details class="install-help"/g) || []).length, 3);
  assert.match(html, /系统设置 → 隐私与安全性/);
  assert.match(
    html,
    /xattr -dr com\.apple\.quarantine &quot;\/Applications\/DeepSeek Harness\.app&quot;/,
  );
  assert.match(html, /Windows 已保护你的电脑/);
  assert.match(html, /chmod \+x DeepSeek-Harness-\*\.AppImage/);
  assert.doesNotMatch(html, /docs\/SIGNING\.md|代码签名指南/);
});
