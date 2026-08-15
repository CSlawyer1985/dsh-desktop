// DeepSeek Harness 桌面端 —— Electron 主进程
//
// 职责：
//  1. 启动时检测 127.0.0.1:PORT 上是否已有 dsh web 服务（通过 __DSH_BOOT__ 标记判断）；
//  2. 没有则用 Electron 自身的 Node 运行时拉起安装包内置的 dsh CLI；
//  3. 就绪后在独立窗口加载 UI；退出时若服务是本应用拉起的则一并关闭。
//
// 环境变量：
//  DSH_DESKTOP_PORT  覆盖端口（默认 3080）
//  DSH_CLI           指定 dsh CLI 入口（lib/bin.js 的绝对路径）
//  DSH_HOME          指定数据目录（默认 ~/.dsh，与命令行使用一致）

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { resolveDshCli, spawnDshServer } = require('./lib/dsh-runtime');

const PORT = Number(process.env.DSH_DESKTOP_PORT || 3080);
const APP_URL = `http://127.0.0.1:${PORT}`;
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const LOG_TAIL = 200;
const READY_TIMEOUT = 120000; // 等待服务就绪的最长时间

// 作者信息（可自行修改）
const AUTHOR = 'CSlawyer';
const HOMEPAGE = 'https://chenshi.ai';

let mainWindow = null;
let aboutWindow = null;
let serverProc = null; // 本应用拉起的服务进程（可能为 null = 复用了已在运行的服务）
let quitting = false;
let starting = false;
const logLines = [];

function appendLog(line) {
  const ts = new Date().toISOString();
  const clean = String(line).trim();
  if (!clean) return;
  logLines.push(`[${ts}] ${clean}`);
  if (logLines.length > LOG_TAIL) logLines.shift();
  try {
    const logPath = path.join(app.getPath('userData'), 'server.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${ts}] ${clean}\n`);
  } catch {}
}

function lastLogLines(n = 30) {
  return logLines.slice(-n).join('\n');
}

// 检测目标端口上是否已经跑着 DSH 服务（首页带有 __DSH_BOOT__ 标记）
function isDshUp() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, { timeout: 1500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        body += c;
        if (body.length > 4000) req.destroy();
      });
      res.on('end', () => resolve(body.includes('__DSH_BOOT__')));
      res.on('error', () => resolve(false));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function killServer() {
  if (!serverProc) return;
  const pid = serverProc.pid;
  serverProc = null;
  if (!pid) return;
  if (process.platform === 'win32') {
    // Windows 没有进程组信号：用 taskkill 按 PID 连同子进程树一起结束
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {}
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM'); // 进程组整体终止
  } catch {}
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
  }, 3000).unref();
}

function startServer(cli) {
  appendLog(`spawning bundled CLI: ELECTRON_RUN_AS_NODE=1 ${process.execPath} --expose-internals ${cli} --profile web --port ${PORT}`);
  serverProc = spawnDshServer({
    electronPath: process.execPath,
    cliPath: cli,
    port: PORT,
    dshHome: DSH_HOME,
  });
  serverProc.stdout.on('data', (d) => appendLog(d.toString()));
  serverProc.stderr.on('data', (d) => appendLog(d.toString()));
  serverProc.on('exit', (code, sig) => {
    appendLog(`server process exited code=${code} signal=${sig}`);
    serverProc = null;
    if (quitting || starting) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'error',
        title: 'DeepSeek Harness 服务已退出',
        message: 'dsh web 服务进程意外退出，你可以重新启动。',
        detail: lastLogLines(20),
        buttons: ['重新启动', '退出应用'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice === 0) restart();
      else app.quit();
    }
  });
}

function showRuntimeMissing(win, error) {
  dialog.showMessageBoxSync(win, {
    type: 'error',
    title: '安装不完整',
    message: 'DeepSeek Harness 缺少内置运行组件。',
    detail: `请从项目发布页重新下载安装包并覆盖安装。\n\n${error.message}`,
    buttons: ['退出'],
  });
}

async function waitForServer(timeoutMs = READY_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isDshUp()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'DeepSeek Harness',
    backgroundColor: '#0b0e14',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  return mainWindow;
}

async function boot() {
  const win = createWindow();

  if (await isDshUp()) {
    appendLog(`existing DSH server detected at ${APP_URL}, reusing it`);
    win.loadURL(APP_URL);
    return;
  }

  let cli;
  try {
    cli = resolveDshCli({ override: process.env.DSH_CLI });
  } catch (error) {
    showRuntimeMissing(win, error);
    app.quit();
    return;
  }

  starting = true;
  startServer(cli);
  const ok = await waitForServer();
  starting = false;

  if (!ok) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBoxSync(mainWindow, {
        type: 'error',
        title: '启动失败',
        message: 'DeepSeek Harness 服务未能启动。',
        detail: lastLogLines(30),
        buttons: ['退出'],
      });
    }
    app.quit();
    return;
  }

  appendLog('server ready, loading UI');
  win.loadURL(APP_URL);
}

async function restart() {
  if (!mainWindow) return;
  starting = true;
  killServer();
  let cli;
  try {
    cli = resolveDshCli({ override: process.env.DSH_CLI });
  } catch (error) {
    starting = false;
    showRuntimeMissing(mainWindow, error);
    app.quit();
    return;
  }
  startServer(cli);
  const ok = await waitForServer();
  starting = false;
  if (ok && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(APP_URL);
  }
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${app.name}` },
        { type: 'separator' },
        {
          label: '在浏览器中打开',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => shell.openExternal(APP_URL),
        },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.name}` },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: `关于 ${app.name}`, click: () => showAbout() },
        { type: 'separator' },
        {
          label: `作者主页：${AUTHOR}`,
          click: () => shell.openExternal(HOMEPAGE),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

// 关于窗口：macOS / Linux 用系统原生面板（setAboutPanelOptions），
// Windows 无原生面板，用内置的 about.html 小窗口
function showAbout() {
  if (process.platform !== 'win32') {
    app.showAboutPanel();
    return;
  }
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }
  aboutWindow = new BrowserWindow({
    width: 400,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: `关于 ${app.name}`,
    backgroundColor: '#0b0e14',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  aboutWindow.setMenuBarVisibility(false);
  aboutWindow.loadFile(path.join(__dirname, 'about.html'), {
    query: { version: app.getVersion() },
  });
  aboutWindow.once('ready-to-show', () => aboutWindow.show());
  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName('DeepSeek Harness');

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'DeepSeek Harness',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: `© 2026 ${AUTHOR} · 非官方社区封装`,
      website: HOMEPAGE,
    });
    Menu.setApplicationMenu(buildMenu());
    boot();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) boot();
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    quitting = true;
    if (serverProc) killServer();
  });
}
