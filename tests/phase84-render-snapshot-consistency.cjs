const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const snapshot = read('src/features/video-studio/playback/services/atomicRenderSnapshot.ts');
const preview = read('src/components/player/VideoPlayer.tsx');
const exportRenderer = read('src/core/engine/render/CanvasExportRenderer.ts');
const exportService = read('src/features/video-studio/export/services/exportService.ts');
assert(/createStandaloneRenderSnapshot/.test(snapshot), 'Standalone render snapshot path missing');
assert(/origin: 'scrub' \| 'seek' \| 'export'/.test(snapshot), 'Non-playback render origins missing');
assert(/selectActivePreviewCompositorPlan\([\s\S]*buildPreviewCompositorIndex\(input\.tracks\)[\s\S]*input\.time/.test(snapshot), 'Standalone snapshot must use canonical compositor selection');
assert(/evaluateClipAnimation\(input\.animations, layer\.clip, input\.commit\.time\)/.test(snapshot), 'Standalone snapshot must use canonical animation evaluation');
assert(/const activeVideoLayers = snapshot\?\.byRole\.video/.test(exportRenderer), 'Export renderer must consume snapshot video layers');
assert(/const activeOverlayLayers = snapshot\?\.byRole\.overlay/.test(exportRenderer), 'Export renderer must consume snapshot overlay layers');
assert(/const activeTextLayers = snapshot\?\.byRole\.text/.test(exportRenderer), 'Export renderer must consume snapshot text layers');
assert(/context\.renderSnapshot\?\.transformByClipId\[clip\.id\]/.test(exportRenderer), 'Export renderer transform must consume snapshot');
assert(/createStandaloneRenderSnapshot\(\{/.test(exportService), 'Export service must create canonical render snapshot');
assert(/origin: 'export'/.test(exportService), 'Export snapshot must declare export origin');
assert(/renderSnapshot,/.test(exportService), 'Export render call must receive render snapshot');
assert(/createAtomicRenderSnapshot/.test(preview), 'Preview must continue to consume atomic render snapshot');
console.log('PHASE84_RENDER_SNAPSHOT_CONSISTENCY = PASS');
