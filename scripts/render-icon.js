// 用 Electron（Chromium）离屏渲染 build/icon-render.html，
// 从 toBitmap() 取原始像素（BGRA 预乘），自行编码 PNG（toPNG 在离屏下不可靠），
// 输出 1024x1024 的 build/icon.png —— 官方 logo 矢量精确光栅化
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');

// ---------- PNG 编码（RGBA 直通） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = rowStart + 1 + x * 4;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      raw[d + 3] = rgba[s + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 主流程 ----------
app.setName('dsh-icon-render');
const renderProfile = path.join(__dirname, '..', 'build', '.render-profile');
fs.rmSync(renderProfile, { recursive: true, force: true });
app.setPath('userData', renderProfile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('default-background-color', '00000000'); // 画布透明，保留圆角外透明区
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'build', 'icon-render.html'));
  await new Promise((r) => setTimeout(r, 1200));

  let saved = false;
  for (let i = 0; i < 12 && !saved; i++) {
    win.webContents.invalidate();
    await new Promise((r) => setTimeout(r, 500));
    const img = await win.webContents.capturePage();
    const size = img.getSize();
    const bmp = img.toBitmap(); // BGRA, 预乘 alpha
    const W = size.width;
    const H = size.height;

    // 统计校验
    let opaque = 0;
    let white = 0;
    const total = W * H;
    for (let p = 0; p < bmp.length; p += 4) {
      if (bmp[p + 3] > 0) {
        opaque++;
        if (bmp[p] > 200 && bmp[p + 1] > 200 && bmp[p + 2] > 200) white++;
      }
    }
    const opaqueRatio = opaque / total;
    const whiteRatio = white / total;
    console.log(
      `attempt ${i + 1}: opaque ${(opaqueRatio * 100).toFixed(1)}%, white ${(whiteRatio * 100).toFixed(1)}%`
    );
    if (!(opaqueRatio > 0.5 && whiteRatio > 0.05)) continue;

    // BGRA 预乘 → RGBA 直通（反预乘）
    const rgba = Buffer.alloc(W * H * 4);
    for (let p = 0; p < bmp.length; p += 4) {
      const a = bmp[p + 3];
      let r = bmp[p + 2];
      let g = bmp[p + 1];
      let b = bmp[p];
      if (a > 0 && a < 255) {
        r = Math.min(255, Math.round((r * 255) / a));
        g = Math.min(255, Math.round((g * 255) / a));
        b = Math.min(255, Math.round((b * 255) / a));
      }
      rgba[p] = r;
      rgba[p + 1] = g;
      rgba[p + 2] = b;
      rgba[p + 3] = a;
    }
    fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), encodePNG(W, H, rgba));
    console.log(`icon.png written (${W}x${H})`);
    saved = true;
  }
  if (!saved) {
    console.error('ERROR: capture never reached a valid state');
    app.exit(1);
    return;
  }
  app.quit();
});
