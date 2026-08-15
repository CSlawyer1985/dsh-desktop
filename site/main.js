/* ============================================================
   DeepSeek Harness Desktop — 页面交互
   ============================================================ */

/* ---------- 发布配置 ----------
   开源后替换为你实际的 GitHub 仓库地址。
   安装包命名与 scripts/build.sh / package.json 的 artifactName 保持一致。 */
const CONFIG = {
  repo: 'CSlawyer1985/dsh-desktop',                 // TODO: 你的仓库
  version: '0.2.0',
  releasesBase: 'https://github.com/CSlawyer1985/dsh-desktop/releases', // TODO
  files: {
    'mac-arm64.dmg': 'DeepSeek-Harness-0.2.0-mac-arm64.dmg',
    'mac-x64.dmg': 'DeepSeek-Harness-0.2.0-mac-x64.dmg',
    'mac-arm64.zip': 'DeepSeek-Harness-0.2.0-mac-arm64.zip',
    'Setup-x64.exe': 'DeepSeek-Harness-Setup-0.2.0-x64.exe',
    'Portable-x64.exe': 'DeepSeek-Harness-Portable-0.2.0-x64.exe',
    'Setup-arm64.exe': 'DeepSeek-Harness-Setup-0.2.0-arm64.exe',
    'linux.AppImage': 'DeepSeek-Harness-0.2.0-linux-x86_64.AppImage',
  },
};
const downloadBase = `${CONFIG.releasesBase}/download/v${CONFIG.version}`;

/* ---------- 下载链接注入 ---------- */
document.querySelectorAll('[data-download]').forEach((el) => {
  const key = el.dataset.download;
  const file = CONFIG.files[key];
  el.href = file ? `${downloadBase}/${encodeURIComponent(file)}` : CONFIG.releasesBase;
  el.setAttribute('download', file || '');
});

/* ---------- 平台标签页 ---------- */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
    });
  });
});

/* ---------- 导航：滚动玻璃 + 移动端菜单 ---------- */
const nav = document.getElementById('nav');
const navLinks = document.getElementById('navLinks');
const navToggle = document.getElementById('navToggle');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 24);
}, { passive: true });

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
navLinks.addEventListener('click', (e) => {
  if (e.target.closest('a')) navLinks.classList.remove('open');
});

/* ---------- 滚动显现 ---------- */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

/* ---------- Hero 窗口：启动日志打字动画 ---------- */
// 每行由带颜色的片段组成，按字符逐个打出，保持 span 着色
const bootLines = [
  [{ t: '$', c: 'dim' }, { t: ' dsh web ' }, { t: '--port 3080', c: 'dim' }],
  [{ t: '› profile ', c: 'dim' }, { t: 'web', c: 'ok' }, { t: ' 已加载 · 插件 bundle 就绪', c: 'dim' }],
  [{ t: '› 检测到本机 dsh CLI（npx 缓存）', c: 'dim' }],
  [{ t: '✓ 服务已就绪 → ', c: 'ok' }, { t: 'http://127.0.0.1:3080', c: 'url' }],
  [{ t: '✓ UI 已在独立窗口打开', c: 'ok' }],
];

(function bootTyping() {
  const log = document.getElementById('bootLog');
  const status = document.getElementById('bootStatus');
  if (!log) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 展开为字符序列（含每个字符所属片段）
  const flat = [];
  bootLines.forEach((segments) => {
    segments.forEach((seg) => {
      [...seg.t].forEach((ch) => flat.push({ ch, c: seg.c || null }));
    });
    flat.push({ ch: '\n', c: null });
  });

  const render = (count) => {
    const buffer = [];
    let newlinePending = false;
    flat.slice(0, count).forEach((f) => {
      if (f.ch === '\n') {
        buffer.push('</div><div class="boot-line">');
        newlinePending = true;
      } else {
        buffer.push(f.c ? `<span class="${f.c}">${f.ch}</span>` : f.ch);
        newlinePending = false;
      }
    });
    if (newlinePending) buffer.pop();
    log.innerHTML = '<div class="boot-line">' + buffer.join('') + '<span class="boot-cursor"></span></div>';
  };

  if (reduced) {
    render(flat.length);
    status.innerHTML = '<span style="color:#4ade80">运行中</span> · 127.0.0.1:3080';
    return;
  }

  let i = 0;
  const speed = 24; // 每字符毫秒数
  const tick = () => {
    i += 1;
    render(i);
    if (i < flat.length) {
      setTimeout(tick, speed);
    } else {
      status.innerHTML = '<span style="color:#4ade80">运行中</span> · 127.0.0.1:3080';
    }
  };
  setTimeout(tick, 400);
})();

/* ---------- 复制命令 ---------- */
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

function showCopiedState(button) {
  const defaultMarkup = button.innerHTML;
  clearTimeout(button.copyResetTimer);
  button.classList.add('copied');
  button.textContent = '已复制';
  button.copyResetTimer = setTimeout(() => {
    button.classList.remove('copied');
    button.innerHTML = defaultMarkup;
  }, 2000);
}

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;
    await copyText(target.textContent.trim());
    showCopiedState(button);
  });
});

const copyBtn = document.getElementById('copyBtn');
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    const text = [
      'git clone https://github.com/CSlawyer1985/dsh-desktop',
      'cd dsh-desktop && npm ci',
      'bash scripts/build.sh mac   # win / linux / all',
    ].join('\n');
    await copyText(text);
    showCopiedState(copyBtn);
  });
}
