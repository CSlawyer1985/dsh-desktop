const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function resolveDshCli({ override, resolvePackage = require.resolve, existsSync = fs.existsSync } = {}) {
  if (override) {
    if (!existsSync(override)) throw new Error(`DSH_CLI does not exist: ${override}`);
    return override;
  }

  const manifest = resolvePackage('@deepseek-ai/dsh/package.json');
  const virtualCli = path.join(path.dirname(manifest), 'lib', 'bin.js');
  const asarMarker = `${path.sep}app.asar${path.sep}`;
  const cli = virtualCli.includes(asarMarker)
    ? virtualCli.replace(asarMarker, `${path.sep}app.asar.unpacked${path.sep}`)
    : virtualCli;
  if (!existsSync(cli)) throw new Error(`Bundled DSH CLI is missing: ${cli}`);
  return cli;
}

function createDshLaunchSpec({ electronPath, cliPath, port, dshHome, inheritedEnv = process.env }) {
  const env = {
    ...inheritedEnv,
    DSH_HOME: dshHome,
    ELECTRON_RUN_AS_NODE: '1',
  };
  delete env.NODE_OPTIONS;

  return {
    command: electronPath,
    args: [
      '--expose-internals',
      cliPath,
      '--profile',
      'web',
      '--port',
      String(port),
    ],
    options: {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  };
}

function spawnDshServer({ spawnImpl = spawn, ...launchOptions }) {
  const spec = createDshLaunchSpec(launchOptions);
  return spawnImpl(spec.command, spec.args, spec.options);
}

module.exports = { createDshLaunchSpec, resolveDshCli, spawnDshServer };
