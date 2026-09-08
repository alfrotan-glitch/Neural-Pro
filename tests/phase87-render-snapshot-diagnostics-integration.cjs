const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const diagnostics = read('src/features/video-studio/playback/services/renderSnapshotDiagnostics.ts');
const index = read('src/features/video-studio/playback/services/index.ts');
const player = read('src/components/player/VideoPlayer.tsx');
const exporter = read('src/features/video-studio/export/services/exportService.ts');

must(/export interface RenderSnapshotDiagnostic/.test(diagnostics), 'Diagnostic result contract missing');
must(/diagnoseRenderSnapshotPair/.test(diagnostics), 'Pair diagnostic function missing');
must(/formatRenderSnapshotDiagnostic/.test(diagnostics), 'Human-readable diagnostic formatter missing');
must(/previousHash/.test(diagnostics) && /nextHash/.test(diagnostics), 'Hash evidence missing');
must(/categories/.test(diagnostics) && /entries/.test(diagnostics), 'Structured diff evidence missing');
must(/export \* from '\.\/renderSnapshotDiagnostics';/.test(index), 'Diagnostic service must be exported');
// Preview and export must both retain canonical render snapshots as the diagnostic source.
must(/createAtomicRenderSnapshot/.test(player) && /renderSnapshot/.test(player), 'Preview snapshot path missing');
must(/createStandaloneRenderSnapshot/.test(exporter) && /renderSnapshot/.test(exporter), 'Export snapshot path missing');
must(/diagnoseRenderSnapshotPair/.test(exporter) && /'export'/.test(exporter), 'Export diagnostics callback must consume snapshot diff');
must(/onRenderSnapshotDiagnostics/.test(player) && /'preview'/.test(player), 'Preview diagnostics callback must consume snapshot diff');
console.log('PHASE87_RENDER_SNAPSHOT_DIAGNOSTICS_INTEGRATION = PASS');
