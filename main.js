// DeepSeek Harness 桌面端 —— Electron 主进程
//
// 职责：
//  1. 启动时检测 127.0.0.1:PORT 上是否已有 dsh web 服务（通过 __DSH_BOOT__ 标记判断）；
//  2. 没有则自动拉起 dsh CLI（优先复用 npx 缓存里已安装的 @deepseek-ai/dsh，
//     用 Electron 自身的 Node 运行时执行，即 ELECTRON_RUN_AS_NODE）；
//  3. 就绪后在独立窗口加载 UI；退出时若服务是本应用拉起的则一并关闭。
//
// 环境变量：
//  DSH_DESKTOP_PORT  覆盖端口（默认 3080）
//  DSH_CLI           指定 dsh CLI 入口（lib/bin.js 的绝对路径）
//  DSH_HOME          指定数据目录（默认 ~/.dsh，与命令行使用一致）

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

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

// 各平台 dsh CLI 的常见安装位置（npm 全局安装 / npx 缓存）
function cliCandidateRoots() {
  const roots = [];
  const isWin = process.platform === 'win32';
  if (isWin) {
    // Windows：npm 全局前缀 %APPDATA%\npm，npx 缓存在 npm cache 的 _npx 下
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    if (appData) roots.push(path.join(appData, 'npm', 'node_modules'));
    if (localAppData) roots.push(path.join(localAppData, 'npm-cache', '_npx'));
  } else {
    // macOS / Linux
    roots.push(path.join(os.homedir(), '.npm-global', 'lib', 'node_modules'));
    roots.push('/usr/local/lib/node_modules');
    roots.push('/usr/lib/node_modules');
    roots.push(path.join(os.homedir(), '.npm', '_npx'));
  }
  return roots;
}

// 查找本机已有的 dsh CLI 入口，按修改时间取最新的
async function findDshCli() {
  const found = [];
  if (process.env.DSH_CLI && fs.existsSync(process.env.DSH_CLI)) found.push(process.env.DSH_CLI);
  for (const root of cliCandidateRoots()) {
    try {
      if (path.basename(root) === '_npx') {
        // npx 缓存：_npx/<hash>/node_modules/@deepseek-ai/dsh/lib/bin.js
        for (const d of await fsp.readdir(root)) {
          const p = path.join(root, d, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
          if (fs.existsSync(p)) found.push(p);
        }
      } else {
        const p = path.join(root, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
        if (fs.existsSync(p)) found.push(p);
      }
    } catch {}
  }
  if (!found.length) return null;
  const withTime = await Promise.all(
    found.map(async (p) => [p, (await fsp.stat(p)).mtimeMs])
  );
  withTime.sort((a, b) => b[1] - a[1]);
  return withTime[0][0];
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

// 各平台的"登录 shell 兜底"：用于 npx 在线启动（继承用户 shell 的 PATH）
function spawnNpxFallback(env) {
  const npmCmd = `npx -y @deepseek-ai/dsh --profile web --port ${PORT}`;
  const extraEnv = {
    ...env,
    PATH: env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
    NODE_OPTIONS: '--expose-internals', // HMR 插件必需
  };
  if (process.platform === 'win32') {
    appendLog(`spawning via cmd: ${npmCmd}`);
    return spawn('cmd.exe', ['/d', '/s', '/c', npmCmd], {
      env: extraEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: true,
    });
  }
  // macOS 用 zsh（用户交互 shell，PATH 最完整）；Linux 用 bash
  const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  const flag = shell.endsWith('zsh') ? '-lc' : '-lc';
  appendLog(`spawning via login shell (${shell}): ${npmCmd}`);
  return spawn(shell, [flag, `exec ${npmCmd}`], {
    env: extraEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

function startServer(cli) {
  const env = { ...process.env, DSH_HOME };
  if (cli) {
    appendLog(`spawning: ELECTRON_RUN_AS_NODE=1 ${process.execPath} --expose-internals ${cli} --profile web --port ${PORT}`);
    // --expose-internals 是 web profile 的 HMR 插件所必需的
    serverProc = spawn(
      process.execPath,
      ['--expose-internals', cli, '--profile', 'web', '--port', String(PORT)],
      {
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      }
    );
  } else {
    serverProc = spawnNpxFallback(env);
  }
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

  let cli = await findDshCli();
  if (!cli) {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: '未找到 dsh 命令',
      message: '本机没有找到已安装的 dsh CLI。',
      detail:
        '查找顺序：$DSH_CLI → 本机 npm 全局安装 / npx 缓存中的 @deepseek-ai/dsh（取最新）。\n' +
        '也可以选择用 npx 在线启动（首次需要联网下载）。',
      buttons: ['用 npx 在线启动', '退出'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice !== 0) {
      app.quit();
      return;
    }
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
  const cli = await findDshCli();
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
