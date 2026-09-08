const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const gate = read('src/features/video-studio/playback/services/renderSnapshotRegressionGate.ts');
const index = read('src/features/video-studio/playback/services/index.ts');
const exporter = read('src/features/video-studio/export/services/exportService.ts');
const diagnostics = read('src/features/video-studio/playback/services/renderSnapshotDiagnostics.ts');
const hash = read('src/features/video-studio/playback/services/renderSnapshotHash.ts');

must(gate.includes('evaluateRenderSnapshotRegressionGate'), 'Regression gate evaluator missing');
must(gate.includes('assertRenderSnapshotParity'), 'Regression gate assertion missing');
must(gate.includes("diagnoseRenderSnapshotPair(expected, actual, 'regression')"), 'Gate must use canonical diagnostics');
must(gate.includes('formatRenderSnapshotDiagnostic'), 'Gate must expose deterministic failure details');
must(index.includes("export * from './renderSnapshotRegressionGate';"), 'Regression gate export missing');
must(exporter.includes('referenceRenderSnapshot'), 'Export reference snapshot input missing');
must(exporter.includes('enforceRenderSnapshotParity'), 'Export parity enforcement option missing');
must(exporter.includes('assertRenderSnapshotParity'), 'Export must invoke parity gate');
must(diagnostics.includes("'regression'"), 'Regression diagnostic origin missing');
must(hash.includes('computeRenderSnapshotHash'), 'Canonical hash must remain the gate basis');

console.log('PHASE88_AUTOMATED_RENDER_SNAPSHOT_REGRESSION_GATE = PASS');
