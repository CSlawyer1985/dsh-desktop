const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'build.yml'),
  'utf8',
);

test('electron-builder only builds artifacts and never publishes implicitly', () => {
  const builderCommands = workflow.match(/npx electron-builder[^\n]+/g) || [];

  assert.equal(builderCommands.length, 5);
  for (const command of builderCommands) {
    assert.match(command, /--publish never(?:\s|$)/);
  }
});
