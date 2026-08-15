// 生成 assets/about-logo.svg：官方 DeepSeek 星标的独立矢量资源（白色）
// 用 Chromium 精确测量标记包围盒，生成带 padding 的 viewBox
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.setName('dsh-about-logo');
const renderProfile = path.join(__dirname, '..', 'build', '.render-profile');
app.setPath('userData', renderProfile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 400,
    height: 400,
    show: false,
    webPreferences: { offscreen: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'build', 'icon-render.html'));
  await new Promise((r) => setTimeout(r, 800));
  const bb = await win.webContents.executeJavaScript('window.__markBBox || null');
  const mark = await win.webContents.executeJavaScript(
    "document.querySelector('g path').getAttribute('d')"
  );
  if (!bb || !mark) {
    console.error('ERROR: bbox/mark not found');
    app.exit(1);
    return;
  }
  const pad = Math.max(bb.width, bb.height) * 0.06;
  const viewBox = [
    (bb.x - pad).toFixed(2),
    (bb.y - pad).toFixed(2),
    (bb.width + pad * 2).toFixed(2),
    (bb.height + pad * 2).toFixed(2),
  ].join(' ');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n` +
    `  <path d="${mark}" fill="#ffffff"/>\n` +
    `</svg>\n`;
  const outDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'about-logo.svg');
  fs.writeFileSync(out, svg);
  console.log('bbox:', JSON.stringify(bb));
  console.log('viewBox:', viewBox);
  console.log('written:', out);
  app.quit();
});
