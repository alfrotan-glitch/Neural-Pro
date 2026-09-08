const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const bundle = read('src/features/video-studio/playback/services/renderDiagnosticBundle.ts');
const pair = read('src/features/video-studio/playback/services/renderSnapshotPairCapture.ts');
const index = read('src/features/video-studio/playback/services/index.ts');

must(bundle.includes('RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSION = 2'), 'Current bundle schema version missing');
must(bundle.includes('SUPPORTED_RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSIONS = [1, 2]'), 'Legacy schema compatibility missing');
must(bundle.includes('createRenderDiagnosticBundle'), 'Bundle factory missing');
must(bundle.includes('serializeRenderDiagnosticBundle'), 'Stable serializer missing');
must(bundle.includes('parseRenderDiagnosticBundle'), 'Bundle parser missing');
must(bundle.includes('RenderDiagnosticBundleStore'), 'Persistence adapter contract missing');
must(bundle.includes('saveRenderDiagnosticBundle') && bundle.includes('loadRenderDiagnosticBundle'), 'Persistence helpers missing');
must(!bundle.includes('Date.now()') && !bundle.includes('new Date('), 'Bundle must not inject non-deterministic timestamps');
must(!bundle.includes('localStorage') && !bundle.includes('indexedDB'), 'Core bundle must not hardcode storage backend');
must(pair.includes('createRenderDiagnosticBundle'), 'Pair capture must create the canonical persisted bundle');
must(index.includes("export * from './renderDiagnosticBundle';"), 'Diagnostic bundle service export missing');

console.log('PHASE90_DIAGNOSTIC_BUNDLE_PERSISTENCE = PASS');
