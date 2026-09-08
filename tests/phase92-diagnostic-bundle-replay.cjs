const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const replay = read('src/features/video-studio/playback/services/renderDiagnosticReplay.ts');
const bundle = read('src/features/video-studio/playback/services/renderDiagnosticBundle.ts');
const capture = read('src/features/video-studio/playback/services/renderDiagnosticBundleCapture.ts');
const index = read('src/features/video-studio/playback/services/index.ts');

must(replay.includes('createRenderDiagnosticReplayPayload'), 'Replay payload factory missing');
must(replay.includes('replayRenderDiagnosticPayload'), 'Replay verifier missing');
must(replay.includes('computeRenderSnapshotHash'), 'Replay must recompute canonical snapshot hash');
must(replay.includes('hashesMatchStored'), 'Stored hash verification missing');
must(replay.includes('diagnoseRenderSnapshotPair'), 'Replay must rerun canonical diagnostics');
must(bundle.includes('readonly replay?: RenderDiagnosticReplayPayload'), 'Bundle replay payload field missing');
must(bundle.includes('SUPPORTED_RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSIONS'), 'Bundle schema compatibility missing');
must(capture.includes('createRenderDiagnosticReplayPayload'), 'Automatic capture must persist replay payload');
must(index.includes("export * from './renderDiagnosticReplay';"), 'Replay service export missing');
console.log('PHASE92_DIAGNOSTIC_BUNDLE_REPLAY = PASS');
