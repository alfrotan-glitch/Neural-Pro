/**
 * Persistence suite runner (WP-05).
 *
 * Runs every `tests/persistence/*.test.mjs` through tsx so the tests import the
 * real TypeScript modules, and fails the build if any of them fails.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const dir = __dirname;

const suites = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort();

if (suites.length === 0) {
  console.error('PERSISTENCE_SUITE=FAIL (no test files found)');
  process.exit(1);
}

console.log('');
console.log('Persistence suite (WP-05)');
console.log('-------------------------');

let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(dir, suite)], {
    cwd: root,
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) {
    console.error(`[FAIL] ${suite}`);
    failed += 1;
  } else {
    console.log(`[PASS] ${suite}`);
  }
}

console.log('-------------------------');
if (failed === 0) {
  console.log(`PERSISTENCE_SUITE=PASS (${suites.length} files)`);
} else {
  console.log(`PERSISTENCE_SUITE=FAIL (${failed}/${suites.length} files)`);
  process.exitCode = 1;
}
