const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function must(cond, msg) { if (!cond) throw new Error(msg); }

const svc = read('src/features/video-studio/playback/services/renderSnapshotPairCapture.ts');
const idx = read('src/features/video-studio/playback/services/index.ts');
const exp = read('src/features/video-studio/export/services/exportService.ts');

must(svc.includes('capturePreviewExportSnapshotPair'), 'pair capture API missing');
must(svc.includes('evaluateRenderSnapshotRegressionGate'), 'pair capture must use canonical gate');
must(svc.includes('previewHash') && svc.includes('exportHash'), 'diagnostic bundle hashes missing');
must(svc.includes('formatRenderSnapshotDiagnostic'), 'diagnostic bundle formatter missing');
must(!svc.includes('media.currentTime') && !svc.includes('play()'), 'pair capture must not mutate Media');
must(idx.includes("./renderSnapshotPairCapture"), 'service export missing');
must(exp.includes('createStandaloneRenderSnapshot'), 'export must remain on canonical snapshot path');

console.log('PHASE89_PREVIEW_EXPORT_PAIR_CAPTURE = PASS');
