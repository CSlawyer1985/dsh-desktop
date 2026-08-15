#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const REQUIRED_APP_FILES = [
  'node_modules/@deepseek-ai/dsh/package.json',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
];

function normalizeEntry(entry) {
  return entry.replaceAll('\\', '/').replace(/^\/+/, '');
}

function listDirectoryFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(normalizeEntry(path.relative(root, absolute)));
    }
  };
  visit(root);
  return files;
}

function findResourcesDirectory(appDir) {
  const candidates = [
    path.join(appDir, 'Contents', 'Resources'),
    path.join(appDir, 'resources'),
    appDir,
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, 'app')) || fs.existsSync(path.join(candidate, 'app.asar'))
  ));
}

function listApplicationFiles(resourcesDir) {
  const unpackedApp = path.join(resourcesDir, 'app');
  if (fs.existsSync(unpackedApp)) return listDirectoryFiles(unpackedApp);

  const archive = path.join(resourcesDir, 'app.asar');
  if (fs.existsSync(archive)) return asar.listPackage(archive).map(normalizeEntry);
  return [];
}

function requiredTargetPrefixes(platform, arch) {
  const nodeAddonSuffix = platform === 'win32'
    ? `${platform}-${arch}-msvc`
    : platform === 'linux'
      ? `${platform}-${arch}-gnu`
      : `${platform}-${arch}`;
  const prefixes = [
    `node_modules/@vscode/ripgrep-${platform}-${arch}/`,
    `node_modules/@koromix/koffi-${platform}-${arch}/`,
    `node_modules/node-addon-require-builtin-${nodeAddonSuffix}/`,
    `node_modules/@img/sharp-${platform}-${arch}/`,
  ];
  if (platform !== 'win32') {
    prefixes.push(`node_modules/@img/sharp-libvips-${platform}-${arch}/`);
  }
  return prefixes;
}

function inspectPackagedRuntime(appDir, { platform, arch } = {}) {
  const resourcesDir = findResourcesDirectory(appDir);
  const appFiles = resourcesDir ? listApplicationFiles(resourcesDir) : [];
  const missing = REQUIRED_APP_FILES.filter((file) => !appFiles.includes(file));
  if (missing.length) {
    throw new Error(`Packaged app is missing bundled DSH CLI files: ${missing.join(', ')}`);
  }

  const unpackedRoot = path.join(resourcesDir, 'app.asar.unpacked');
  const unpackedFiles = listDirectoryFiles(unpackedRoot);
  const physicalFiles = fs.existsSync(path.join(resourcesDir, 'app'))
    ? [...new Set([...appFiles, ...unpackedFiles])]
    : unpackedFiles;
  const missingPhysical = REQUIRED_APP_FILES.filter((file) => !physicalFiles.includes(file));
  if (missingPhysical.length) {
    throw new Error(`Packaged app is missing physical bundled DSH CLI files: ${missingPhysical.join(', ')}`);
  }

  const nativeAddons = physicalFiles.filter((file) => file.endsWith('.node'));
  if (!nativeAddons.length) {
    throw new Error('Packaged app has no unpacked native addons');
  }

  if ((platform && !arch) || (!platform && arch)) {
    throw new Error('Both platform and arch are required for target verification');
  }
  if (platform && arch) {
    const missingTargetPrefixes = requiredTargetPrefixes(platform, arch).filter((prefix) => (
      !physicalFiles.some((file) => file.startsWith(prefix))
    ));
    if (missingTargetPrefixes.length) {
      throw new Error(
        `Packaged app is missing native assets for ${platform}-${arch}: ` +
        missingTargetPrefixes.join(', '),
      );
    }
  }

  const ripgrepPrefix = platform && arch
    ? `node_modules/@vscode/ripgrep-${platform}-${arch}/bin/`
    : 'node_modules/@vscode/ripgrep-';
  const ripgrepPath = physicalFiles.find((file) => (
    file.startsWith(ripgrepPrefix) && /\/rg(?:\.exe)?$/.test(file)
  ));
  if (!ripgrepPath) {
    throw new Error('Packaged app has no unpacked ripgrep executable');
  }

  return {
    cliPath: REQUIRED_APP_FILES[1],
    nativeAddonCount: nativeAddons.length,
    ripgrepPath,
  };
}

if (require.main === module) {
  try {
    const appDir = process.argv[2];
    if (!appDir) throw new Error('Usage: verify-packaged-runtime <packaged-app-directory>');
    const platformIndex = process.argv.indexOf('--platform');
    const archIndex = process.argv.indexOf('--arch');
    const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : undefined;
    const arch = archIndex >= 0 ? process.argv[archIndex + 1] : undefined;
    const result = inspectPackagedRuntime(path.resolve(appDir), { platform, arch });
    process.stdout.write(
      `Bundled DSH CLI: ${result.cliPath}\n` +
      `Unpacked native addons: ${result.nativeAddonCount}\n` +
      `Unpacked ripgrep: ${result.ripgrepPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { inspectPackagedRuntime };
