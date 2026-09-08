/**
 * Canonical core test runner.
 *
 *   npx tsx tests/domain-core/run.ts
 *
 * Exit code 0 only when every suite passes. Deterministic: suites run in
 * declaration order and no suite depends on time, randomness or the network.
 */
import { runSuites, type Suite } from './harness';
import fps from './fps.test';
import time from './time.test';
import duration from './duration.test';
import transform from './transform.test';
import geometry from './geometry.test';
import project from './project.test';
import parity from './parity.test';
import purity from './purity.test';

const SUITES: readonly Suite[] = [fps, time, duration, transform, geometry, project, parity, purity];

const results = runSuites(SUITES);
let failed = 0;

for (const result of results) {
  if (result.ok) {
    console.log(`[PASS] ${result.suite}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${result.suite}: ${result.error ?? 'unknown error'}`);
  }
}

console.log('-------------------------------------------');
console.log(`CANONICAL_CORE_SUITES=${results.length} PASSED=${results.length - failed} FAILED=${failed}`);

if (failed > 0) {
  console.log('CANONICAL_CORE=FAIL');
  process.exit(1);
}

console.log('CANONICAL_CORE=PASS');
