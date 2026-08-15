const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const asar = require('@electron/asar');

const { inspectPackagedRuntime } = require('../scripts/verify-packaged-runtime');

const fixtureRoots = [];

function writeFixtureFile(root, relativePath) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'fixture');
}

function makeFixture({ appFiles = [], unpackedFiles = [] } = {}) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-packaged-runtime-'));
  fixtureRoots.push(appDir);
  for (const file of appFiles) writeFixtureFile(path.join(appDir, 'resources', 'app'), file);
  for (const file of unpackedFiles) {
    writeFixtureFile(path.join(appDir, 'resources', 'app.asar.unpacked'), file);
  }
  return appDir;
}

async function makeAsarFixture({ appFiles = [], unpackedFiles = [] } = {}) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-packaged-runtime-'));
  fixtureRoots.push(appDir);
  const sourceDir = path.join(appDir, 'asar-source');
  for (const file of appFiles) writeFixtureFile(sourceDir, file);
  const resourcesDir = path.join(appDir, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  await asar.createPackage(sourceDir, path.join(resourcesDir, 'app.asar'));
  for (const file of unpackedFiles) {
    writeFixtureFile(path.join(resourcesDir, 'app.asar.unpacked'), file);
  }
  return appDir;
}

test.afterEach(() => {
  while (fixtureRoots.length) fs.rmSync(fixtureRoots.pop(), { recursive: true, force: true });
});

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
      'node_modules/@deepseek-ai/dsh/package.json',
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
      'node_modules/@vscode/ripgrep-darwin-arm64/bin/rg',
      'node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node',
      'node_modules/node-addon-require-builtin-darwin-arm64/prebuilt/addon.node',
      'node_modules/@img/sharp-darwin-arm64/lib/sharp.node',
      'node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib',
    ],
  });

  const result = inspectPackagedRuntime(appDir, { platform: 'darwin', arch: 'arm64' });
  assert.equal(result.nativeAddonCount, 3);
  assert.match(result.ripgrepPath, /ripgrep-darwin-arm64\/bin\/rg$/);
});

test('rejects packaged native assets for the wrong architecture', () => {
  const appDir = makeFixture({
    appFiles: [
      'node_modules/@deepseek-ai/dsh/package.json',
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
    ],
    unpackedFiles: [
      'node_modules/@deepseek-ai/dsh/package.json',
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
      'node_modules/@vscode/ripgrep-darwin-arm64/bin/rg',
      'node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node',
      'node_modules/node-addon-require-builtin-darwin-arm64/prebuilt/addon.node',
      'node_modules/@img/sharp-darwin-arm64/lib/sharp.node',
      'node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib',
    ],
  });

  assert.throws(
    () => inspectPackagedRuntime(appDir, { platform: 'darwin', arch: 'x64' }),
    /darwin-x64/,
  );
});

test('rejects a CLI that exists only inside ASAR', async () => {
  const appDir = await makeAsarFixture({
    appFiles: [
      'node_modules/@deepseek-ai/dsh/package.json',
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
    ],
    unpackedFiles: [
      'node_modules/native/native.node',
      'node_modules/@vscode/ripgrep-darwin-arm64/bin/rg',
    ],
  });

  assert.throws(() => inspectPackagedRuntime(appDir), /physical bundled DSH CLI/i);
});
