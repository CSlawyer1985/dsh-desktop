const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');

const {
  createDshLaunchSpec,
  resolveDshCli,
  spawnDshServer,
} = require('../lib/dsh-runtime');

test('resolves the CLI beside the bundled package manifest', () => {
  const packageRoot = path.join(path.sep, 'app', 'node_modules', '@deepseek-ai', 'dsh');
  const expectedCli = path.join(packageRoot, 'lib', 'bin.js');
  const result = resolveDshCli({
    resolvePackage: () => path.join(packageRoot, 'package.json'),
    existsSync: (file) => file === expectedCli,
  });

  assert.equal(result, expectedCli);
});

test('uses the physical unpacked CLI path in an ASAR application', () => {
  const resources = path.join(path.sep, 'app', 'resources');
  const packageRoot = path.join(resources, 'app.asar', 'node_modules', '@deepseek-ai', 'dsh');
  const expectedCli = path.join(
    resources,
    'app.asar.unpacked',
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'lib',
    'bin.js',
  );
  const result = resolveDshCli({
    resolvePackage: () => path.join(packageRoot, 'package.json'),
    existsSync: (file) => file === expectedCli,
  });

  assert.equal(result, expectedCli);
});

test('accepts only an existing explicit DSH_CLI override', () => {
  assert.equal(
    resolveDshCli({ override: '/custom/bin.js', existsSync: () => true }),
    '/custom/bin.js',
  );
  assert.throws(
    () => resolveDshCli({ override: '/missing/bin.js', existsSync: () => false }),
    /DSH_CLI.*does not exist/,
  );
});

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
    '--profile',
    'web',
    '--no-open',
    '--port',
    '3080',
  ]);
  assert.equal(spec.options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(spec.options.env.DSH_HOME, '/Users/test/.dsh');
  assert.equal('NODE_OPTIONS' in spec.options.env, false);
  assert.equal(spec.options.env.PATH, '/usr/bin');
});

test('spawns a real offline child with the sanitized launch contract', async () => {
  const child = spawnDshServer({
    electronPath: process.execPath,
    cliPath: path.join(__dirname, 'fixtures', 'report-dsh-launch.js'),
    port: 31888,
    dshHome: '/tmp/dsh-test-home',
    inheritedEnv: { PATH: process.env.PATH, NODE_OPTIONS: '--expose-internals' },
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });

  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  const observed = JSON.parse(output);
  assert.deepEqual(observed.argv, ['--profile', 'web', '--no-open', '--port', '31888']);
  assert.equal(observed.dshHome, '/tmp/dsh-test-home');
  assert.equal(observed.electronRunAsNode, '1');
  assert.equal(observed.hasNodeOptions, false);
});
