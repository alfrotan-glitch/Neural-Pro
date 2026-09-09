/**
 * Phase P2 — persistence schema safety.
 *
 * This used to transpile `projectPersistenceService.ts` in a bare VM with stubbed
 * imports and grep the source for two strings (defect D-011: a test that asserts
 * formatting, not behaviour). The guarantees it cared about are now executed for
 * real, against the actual modules, by the persistence suite:
 *
 *   tests/persistence/03-crash-and-corruption.test.mjs
 *     - unknown schemaVersion is refused with PERSISTENCE_UNSUPPORTED_VERSION (R4)
 *     - corrupt / tampered / partially written documents are detected and never
 *       partially hydrated
 *   tests/persistence/04-migration.test.mjs
 *     - legacy (pre-schema) and V1 documents are still readable, and migration
 *       never silently drops media
 *
 * This file runs those suites and fails with them.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const suites = [
  'tests/persistence/03-crash-and-corruption.test.mjs',
  'tests/persistence/04-migration.test.mjs',
];

let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', suite], {
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

if (failed > 0) {
  console.error(`PHASE_P2_PERSISTENCE_SCHEMA_SAFETY=FAIL (${failed} suite(s))`);
  process.exitCode = 1;
} else {
  console.log('PHASE_P2_PERSISTENCE_SCHEMA_SAFETY=PASS');
}
