# Bundled DSH CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish DeepSeek Harness Desktop 0.3.0 with the official DSH CLI embedded so an installed app starts offline without Node.js, npm, npx, or terminal preparation.

**Architecture:** Put CLI path resolution and child-process launch configuration in a testable CommonJS module, then let the Electron main process use that module for lifecycle management. Pin the official CLI as a production dependency and package its native/executable assets for each target architecture. Release only after local runtime/package checks and all GitHub Actions platform builds pass.

**Tech Stack:** Electron 43, Node.js CommonJS, Node test runner, electron-builder 26, GitHub Actions, GitHub Releases, Cloudflare Pages/Wrangler.

## Global Constraints

- Desktop release version is exactly `0.3.0`.
- Bundled CLI version is exactly `@deepseek-ai/dsh@0.1.0-rc.6`.
- Normal startup performs no network download and invokes no system `node`, `npm`, `npx`, or login shell.
- `DSH_CLI` remains an explicit developer override only; the bundled CLI is the default.
- Child `NODE_OPTIONS` is removed and `--expose-internals` is passed as a process argument.
- Existing `~/.dsh` data, port reuse, service readiness, and process cleanup behavior stay intact.
- Public pages retain unsigned-installer opening instructions but contain no customer-facing code-signing guide.
- Preserve unrelated untracked files `HANDOFF.md` and `README 2.md`.

## File Structure

- Create `lib/dsh-runtime.js`: resolve the bundled CLI and construct a sanitized Electron-as-Node spawn specification.
- Create `tests/dsh-runtime.test.js`: behavior tests for bundled resolution, override validation, arguments, and environment sanitation.
- Create `tests/fixtures/report-dsh-launch.js`: lightweight real child process used to observe arguments and environment without mocking process creation.
- Modify `main.js`: remove system discovery/npx fallback and consume `lib/dsh-runtime.js`.
- Modify `package.json` and `package-lock.json`: version 0.3.0, exact production dependency, test scripts, packaged runtime assets.
- Create `scripts/verify-packaged-runtime.js`: inspect an unpacked electron-builder output for the CLI entry and native/executable assets.
- Create `tests/packaged-runtime.test.js`: fixture-based tests for missing and complete packaged runtime layouts.
- Modify `.github/workflows/build.yml`: run tests, build per platform, verify packaged runtime before uploading artifacts.
- Modify `site/index.html`, `site/main.js`, and `tests/site-install-help.test.js`: publish 0.3.0 links and no-prerequisite copy.
- Modify `README.md`: document the bundled/offline architecture and updated troubleshooting.

---

### Task 1: Testable bundled runtime contract

**Files:**
- Create: `tests/dsh-runtime.test.js`
- Create: `lib/dsh-runtime.js`

**Interfaces:**
- Produces: `resolveDshCli({ override, resolvePackage, existsSync }): string`
- Produces: `createDshLaunchSpec({ electronPath, cliPath, port, dshHome, inheritedEnv }): { command, args, options }`
- Produces: `spawnDshServer({ spawnImpl, electronPath, cliPath, port, dshHome, inheritedEnv }): ChildProcess`

- [ ] **Step 1: Write failing resolution tests**

```js
test('resolves the CLI beside the bundled package manifest', () => {
  const result = resolveDshCli({
    resolvePackage: () => '/app/node_modules/@deepseek-ai/dsh/package.json',
    existsSync: (file) => file.endsWith('/lib/bin.js'),
  });
  assert.equal(result, '/app/node_modules/@deepseek-ai/dsh/lib/bin.js');
});

test('accepts only an existing explicit DSH_CLI override', () => {
  assert.equal(resolveDshCli({ override: '/custom/bin.js', existsSync: () => true }), '/custom/bin.js');
  assert.throws(
    () => resolveDshCli({ override: '/missing/bin.js', existsSync: () => false }),
    /DSH_CLI.*does not exist/,
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/dsh-runtime.test.js`

Expected: FAIL because `lib/dsh-runtime.js` does not exist.

- [ ] **Step 3: Implement minimal CLI resolution**

```js
function resolveDshCli({ override, resolvePackage = require.resolve, existsSync = fs.existsSync } = {}) {
  if (override) {
    if (!existsSync(override)) throw new Error(`DSH_CLI does not exist: ${override}`);
    return override;
  }
  const manifest = resolvePackage('@deepseek-ai/dsh/package.json');
  const cli = path.join(path.dirname(manifest), 'lib', 'bin.js');
  if (!existsSync(cli)) throw new Error(`Bundled DSH CLI is missing: ${cli}`);
  return cli;
}
```

- [ ] **Step 4: Run the resolution tests and verify GREEN**

Run: `node --test tests/dsh-runtime.test.js`

Expected: all resolution tests PASS.

- [ ] **Step 5: Write failing launch-spec tests**

```js
test('launches bundled DSH through Electron Node mode without NODE_OPTIONS', () => {
  const spec = createDshLaunchSpec({
    electronPath: '/Applications/DeepSeek Harness',
    cliPath: '/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
    port: 3080,
    dshHome: '/Users/test/.dsh',
    inheritedEnv: { PATH: '/usr/bin', NODE_OPTIONS: '--expose-internals' },
  });
  assert.equal(spec.command, '/Applications/DeepSeek Harness');
  assert.deepEqual(spec.args, [
    '--expose-internals',
    '/app/node_modules/@deepseek-ai/dsh/lib/bin.js',
    '--profile', 'web', '--port', '3080',
  ]);
  assert.equal(spec.options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(spec.options.env.DSH_HOME, '/Users/test/.dsh');
  assert.equal('NODE_OPTIONS' in spec.options.env, false);
});
```

- [ ] **Step 6: Run the launch-spec test and verify RED**

Run: `node --test tests/dsh-runtime.test.js`

Expected: FAIL because `createDshLaunchSpec` is not implemented.

- [ ] **Step 7: Implement the minimal launch specification**

```js
function createDshLaunchSpec({ electronPath, cliPath, port, dshHome, inheritedEnv = process.env }) {
  const env = { ...inheritedEnv, DSH_HOME: dshHome, ELECTRON_RUN_AS_NODE: '1' };
  delete env.NODE_OPTIONS;
  return {
    command: electronPath,
    args: ['--expose-internals', cliPath, '--profile', 'web', '--port', String(port)],
    options: { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  };
}
```

- [ ] **Step 8: Run the full runtime test file and commit**

Add a real-process test using `tests/fixtures/report-dsh-launch.js`. The fixture prints `process.argv.slice(2)` plus `DSH_HOME`, `ELECTRON_RUN_AS_NODE`, and whether `NODE_OPTIONS` exists. Call `spawnDshServer` with `process.execPath` and the fixture path, collect stdout, and assert the observed values. The production change that makes this test fail is replacing Electron's runtime with `npx`/a shell or leaking `NODE_OPTIONS` into the child.

```js
test('spawns a real offline child with the sanitized launch contract', async () => {
  const child = spawnDshServer({
    electronPath: process.execPath,
    cliPath: fixturePath,
    port: 31888,
    dshHome: '/tmp/dsh-test-home',
    inheritedEnv: { PATH: process.env.PATH, NODE_OPTIONS: '--expose-internals' },
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  const observed = JSON.parse(output);
  assert.deepEqual(observed.argv, ['--profile', 'web', '--port', '31888']);
  assert.equal(observed.dshHome, '/tmp/dsh-test-home');
  assert.equal(observed.electronRunAsNode, '1');
  assert.equal(observed.hasNodeOptions, false);
});
```

Implement `spawnDshServer` by passing the real specification directly to `spawnImpl`.

Run: `node --test tests/dsh-runtime.test.js`

Expected: all tests PASS.

Commit: `feat: 添加内置 DSH 运行时解析器`

### Task 2: Electron startup uses only the bundled runtime

**Files:**
- Modify: `main.js`

**Interfaces:**
- Consumes: `resolveDshCli(...)` and `createDshLaunchSpec(...)` from Task 1.
- Produces: normal boot/restart behavior with no npx or system CLI discovery branch.

- [ ] **Step 1: Replace discovery and fallback in `main.js`**

Import `resolveDshCli` and `spawnDshServer`, resolve the CLI synchronously before spawning, and retain stdout/stderr/exit lifecycle listeners on the returned real child process. Delete `cliCandidateRoots`, `findDshCli`, and `spawnNpxFallback`. On resolution failure, show:

```js
{
  type: 'error',
  title: '安装不完整',
  message: 'DeepSeek Harness 缺少内置运行组件。',
  detail: '请从官方发布页重新下载安装包并覆盖安装。\n\n' + error.message,
  buttons: ['退出'],
}
```

- [ ] **Step 2: Run runtime tests and syntax checks**

Run: `node --test tests/dsh-runtime.test.js && node --check main.js && node --check lib/dsh-runtime.js`

Expected: PASS with no warnings.

- [ ] **Step 3: Perform a real Electron startup smoke test**

Start `electron .` with a fresh temporary `DSH_HOME` and unused `DSH_DESKTOP_PORT`, wait for the HTTP marker, then terminate the app. This exercises the actual `main.js` wiring and bundled package resolution; the previous implementation would instead enter system discovery or the npx prompt on a clean home.

Expected: HTTP body contains `__DSH_BOOT__`; server log says it spawned the CLI resolved under this project's `node_modules` and contains no `npx` launch line.

- [ ] **Step 4: Commit**

Commit: `fix: 默认启动内置 DSH CLI`

### Task 3: Package the official CLI and verify application contents

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/verify-packaged-runtime.js`
- Create: `tests/packaged-runtime.test.js`
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `@deepseek-ai/dsh@0.1.0-rc.6` and electron-builder output directories.
- Produces: `node scripts/verify-packaged-runtime.js <app-dir>` with exit 0 only when required runtime files exist.

- [ ] **Step 1: Install the exact production dependency and bump the app**

Run: `npm install --save-exact @deepseek-ai/dsh@0.1.0-rc.6 && npm version 0.3.0 --no-git-tag-version`

Expected: package and lock files contain app version `0.3.0` and exact DSH dependency `0.1.0-rc.6`.

- [ ] **Step 2: Add test scripts and ASAR unpack rules**

Add `test`, `test:runtime`, and `test:site` scripts. Configure `asarUnpack` for `**/*.node` and `node_modules/@vscode/ripgrep-*/bin/*`. Keep production dependencies out of the explicit source `files` list and rely on electron-builder's dependency collector.

- [ ] **Step 3: Write failing packaged-runtime behavior tests**

Create temporary fixture directories with `resources/app/` and `resources/app.asar.unpacked/`. The empty fixture must throw a missing-CLI error. The complete fixture must contain the two DSH files below, one `native.node`, and one platform ripgrep executable, then return their counts and paths.

```js
test('rejects a packaged app without the bundled CLI', () => {
  const appDir = makeFixture();
  assert.throws(() => inspectPackagedRuntime(appDir), /bundled DSH CLI/i);
});

test('accepts a packaged app with CLI, native addon, and ripgrep', () => {
  const appDir = makeFixture({
    appFiles: [
      'node_modules/@deepseek-ai/dsh/package.json',
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
    ],
    unpackedFiles: [
      'node_modules/native/native.node',
      'node_modules/@vscode/ripgrep-darwin-arm64/bin/rg',
    ],
  });
  const result = inspectPackagedRuntime(appDir);
  assert.equal(result.nativeAddonCount, 1);
  assert.match(result.ripgrepPath, /ripgrep-darwin-arm64\/bin\/rg$/);
});
```

- [ ] **Step 4: Run verifier tests and verify RED**

Run: `node --test tests/packaged-runtime.test.js`

Expected: FAIL because `scripts/verify-packaged-runtime.js` does not exist.

- [ ] **Step 5: Implement the packaged-runtime inspector**

Export `inspectPackagedRuntime(appDir)` and expose a CLI wrapper when the file is executed directly. Read application entries from either `resources/app/` or `resources/app.asar` via `@electron/asar.listPackage`. Recursively list `resources/app.asar.unpacked/` and require:

```js
const required = [
  'node_modules/@deepseek-ai/dsh/package.json',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
];
```

Throw distinct errors for a missing DSH entry, zero native addons, or missing ripgrep executable. On success, print the resolved CLI entry, native addon count, and ripgrep path.

- [ ] **Step 6: Run verifier tests and verify GREEN**

Run: `node --test tests/packaged-runtime.test.js`

Expected: both fixture behaviors PASS.

- [ ] **Step 7: Build a macOS unpacked application**

Run: `npx electron-builder --mac --dir --arm64`

Expected: exit 0 and a `.app` under `dist/mac-arm64/`.

- [ ] **Step 8: Run the packaged-runtime verifier against the real build**

Run: `node scripts/verify-packaged-runtime.js dist/mac-arm64/DeepSeek\ Harness.app`

Expected: exit 0, reporting the CLI entry, native addon count, and ripgrep executable.

- [ ] **Step 9: Add CI tests and package verification**

Run `npm test` before building. Build an unpacked directory for verification on each runner before or alongside distributable targets, then call the verifier against the platform-specific unpacked app path. Keep artifact upload limited to installers.

- [ ] **Step 10: Commit**

Commit: `build: 将官方 DSH CLI 打入安装包`

### Task 4: Update customer-facing version and no-prerequisite messaging

**Files:**
- Modify: `tests/site-install-help.test.js`
- Modify: `site/index.html`
- Modify: `site/main.js`
- Modify: `README.md`

**Interfaces:**
- Produces: download links for `v0.3.0` artifacts and consistent copy that the CLI is bundled.

- [ ] **Step 1: Add failing website behavior assertions**

```js
test('download page advertises bundled offline runtime and version 0.3.0', () => {
  assert.match(html, /已内置所需运行组件/);
  assert.match(html, /无需.*Node\.js.*npm.*npx/);
  assert.doesNotMatch(html, /需要本机已有 dsh CLI|npx 在线启动/);
  assert.match(js, /version: '0\.3\.0'/);
  assert.doesNotMatch(js, /检测到本机 dsh CLI/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/site-install-help.test.js`

Expected: FAIL against the 0.2.0 prerequisite copy.

- [ ] **Step 3: Update HTML, animation, filenames, and README**

Use “安装包已内置所需运行组件，安装后无需 Node.js、npm、npx 或终端准备即可启动” beside the download section. Replace “发现 CLI” with “启动内置服务”. Update every artifact filename and version badge to 0.3.0, remove stale size estimates until release artifact sizes are known, and rewrite README sections to match the chosen architecture.

- [ ] **Step 4: Run website tests and syntax check**

Run: `node --test tests/site-install-help.test.js && node --check site/main.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `docs: 更新 0.3.0 下载与内置运行说明`

### Task 5: Local end-to-end verification

**Files:**
- Modify only if a failing verification reveals a defect in files already listed.

**Interfaces:**
- Consumes: full desktop app and packaged macOS output.
- Produces: fresh test/build/runtime evidence for publication.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test && node --check main.js && node --check lib/dsh-runtime.js && node --check site/main.js && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Start the source app's bundled CLI on an isolated port**

Run the Electron-as-Node command with a temporary `DSH_HOME` and port, then request the local page.

Expected: HTTP body contains `__DSH_BOOT__` and `<title>DeepSeek Harness` without running `npm` or `npx` at startup.

- [ ] **Step 3: Launch the packaged macOS app with an isolated port**

Start the packaged app binary with `DSH_DESKTOP_PORT` and temporary `DSH_HOME`, wait for readiness, and request the local page.

Expected: the packaged app serves the same marker and title and its log contains the bundled CLI path under application resources.

- [ ] **Step 4: Inspect final diff and dependency scope**

Run: `git status --short && git diff --stat origin/main...HEAD && npm ls @deepseek-ai/dsh --depth=0`

Expected: only intended repository files plus preserved untracked user files; exact CLI version shown.

### Task 6: Publish, build, and release v0.3.0

**Files:**
- No new source files expected.

**Interfaces:**
- Produces: merged `main`, tag `v0.3.0`, successful CI artifacts, and GitHub Release `v0.3.0`.

- [ ] **Step 1: Confirm GitHub prerequisites and branch state**

Run: `gh --version && gh auth status && git status -sb && gh repo view --json nameWithOwner,defaultBranchRef`

Expected: authenticated repository `CSlawyer1985/dsh-desktop`, intended branch only.

- [ ] **Step 2: Push the feature branch and open a ready PR**

Push with tracking, create a PR to `main`, and include the root cause, embedded-runtime behavior, tests, package impact, and unsigned-build limitation.

- [ ] **Step 3: Wait for PR checks and merge through protection**

Run: `gh pr checks <number> --watch`

Expected: every required check succeeds. Merge without bypassing branch protection.

- [ ] **Step 4: Tag the merged commit**

Update local `main`, verify `package.json` is 0.3.0, create annotated tag `v0.3.0`, and push it.

- [ ] **Step 5: Wait for the tag workflow and inspect failed logs if necessary**

Run: `gh run list --workflow build --limit 5` followed by `gh run watch <id> --exit-status`.

Expected: macOS, Windows, and Linux jobs all succeed.

- [ ] **Step 6: Download artifacts and verify names**

Download the run artifacts into an isolated temporary directory and reconcile every expected filename before release upload.

- [ ] **Step 7: Create GitHub Release**

Create release `v0.3.0` from the tag with concise customer notes and all generated installers. Verify every release asset returns HTTP success.

### Task 7: Deploy and verify the Cloudflare Pages website

**Files:**
- No new source files expected unless final artifact names require a website correction.

**Interfaces:**
- Produces: current `site/` deployed to project `dsh-desktop` on branch `main`.

- [ ] **Step 1: Verify Wrangler and Cloudflare authentication**

Run: `wrangler --version && wrangler whoami`

Expected: Wrangler 4.x or newer and the intended Cloudflare account.

- [ ] **Step 2: Deploy the static directory**

Run: `wrangler pages deploy ./site --project-name dsh-desktop --branch main`

Expected: a successful production deployment URL.

- [ ] **Step 3: Verify project and custom-domain pages**

Request `https://dsh-desktop.pages.dev` and `https://dsh.chenshi.ai`.

Expected: HTTP 200, version `v0.3.0`, bundled-runtime copy, and no CLI prerequisite text.

- [ ] **Step 4: Verify live download URLs**

Resolve every `data-download` URL from the live configuration and request it without downloading the full file.

Expected: all GitHub Release asset URLs return successful redirect/download responses.
