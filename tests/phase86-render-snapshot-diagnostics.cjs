const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/renderSnapshotDiff.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/index.ts'), 'utf8');
const diagnostics = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/renderSnapshotDiagnostics.ts'), 'utf8');
const hash = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/renderSnapshotHash.ts'), 'utf8');

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

must(service.includes('export function diffRenderSnapshots'), 'Snapshot diff function missing');
must(service.includes("'layer-membership'"), 'Layer membership category missing');
must(service.includes("'clip-source'"), 'Clip source category missing');
must(service.includes("'clip-properties'"), 'Clip properties category missing');
must(service.includes("'layer-order'"), 'Layer order category missing');
must(service.includes("'transform'"), 'Transform category missing');
must(service.includes("'animation'"), 'Animation category missing');
must(index.includes("export * from './renderSnapshotDiff';"), 'Playback service index export missing');
must(index.includes("export * from './renderSnapshotDiagnostics';"), 'Playback diagnostics export missing');
must(diagnostics.includes('diagnoseRenderSnapshotPair'), 'Snapshot diagnostic integration missing');
must(diagnostics.includes('formatRenderSnapshotDiagnostic'), 'Snapshot diagnostic formatter missing');
must(hash.includes('computeRenderSnapshotHash'), 'Canonical hash service missing');
must(!service.includes('sessionId'), 'Runtime session identity must not be used as a diff cause');
console.log('PHASE86_RENDER_SNAPSHOT_DIAGNOSTICS = PASS');
