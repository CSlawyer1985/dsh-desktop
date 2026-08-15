// 从官方 DeepSeek logo SVG 中提取图形标记（第一个 path，即 spark 星标），
// 生成 build/icon-render.html —— 黑底圆角方块 + 白色官方标记的渲染页面
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'build', 'deepseek-logo.svg');
const svg = fs.readFileSync(src, 'utf8');

const m = svg.match(/<path class="st0" d="([^"]+)"/);
if (!m) throw new Error('mark path not found in ' + src);
const MARK_D = m[1];

// 注意：d 字符串中的引号/特殊字符需转义，以便安全嵌入 <script> 字符串
const escaped = MARK_D
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/</g, '\\x3c')
  .replace(/>/g, '\\x3e')
  .replace(/\n/g, '\\n');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>html,body{margin:0;padding:0;background:transparent}</style>
</head>
<body>
<script>
const MARK_D = '${escaped}';
const S = 1024;
const TARGET = S * 0.60; // 标记占图标宽高的 60%

function build() {
  // 1) 测量标记的真实包围盒
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  probe.setAttribute('d', MARK_D);
  tmp.appendChild(probe);
  document.body.appendChild(tmp);
  const bb = probe.getBBox();
  tmp.remove();

  // 2) 布局：等比缩放到 TARGET 内，居中
  const scale = TARGET / Math.max(bb.width, bb.height);
  const w = bb.width * scale;
  const h = bb.height * scale;
  const tx = (S - w) / 2 - bb.x * scale;
  const ty = (S - h) / 2 - bb.y * scale;

  // 3) 最终图标：黑底圆角方块 + 白色标记
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', S);
  svg.setAttribute('height', S);
  svg.setAttribute('viewBox', '0 0 ' + S + ' ' + S);
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', 0);
  rect.setAttribute('y', 0);
  rect.setAttribute('width', S);
  rect.setAttribute('height', S);
  rect.setAttribute('rx', 185);
  rect.setAttribute('fill', '#0b0e14'); // 近黑底（与 DSH UI 背景一致）
  svg.appendChild(rect);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + scale + ')');
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  mark.setAttribute('d', MARK_D);
  mark.setAttribute('fill', '#ffffff');
  g.appendChild(mark);
  svg.appendChild(g);
  document.body.appendChild(svg);
  window.__iconReady = true;
  window.__markBBox = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
}
build();
</script>
</body>
</html>`;

const out = path.join(__dirname, '..', 'build', 'icon-render.html');
fs.writeFileSync(out, html);
console.log('icon-render.html written, mark path', MARK_D.length, 'chars');
