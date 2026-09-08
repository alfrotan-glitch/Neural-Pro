const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const exporter = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');
const compositor = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/compositor/previewCompositorIndex.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/WeakMap<readonly Track\[\], PreviewCompositorIndex>/.test(exporter), 'Export must cache compositor indexes per tracks snapshot');
assert(/this\.getCompositorIndex\(state\.tracks\)/.test(exporter), 'Export must retrieve a cached compositor index');
assert(/selectActivePreviewCompositorPlan\(compositorIndex, time\)/.test(exporter), 'Export must select active layers through indexed compositor');
assert(/prefixMaxEnd/.test(compositor), 'Indexed compositor must retain prefix end optimization');
assert(!/buildOrderedActiveClips\(state\.tracks, time\)/.test(exporter), 'Export must not rescan every clip through the old per-frame builder');
console.log('PHASE_P2_EXPORT_COMPOSITOR_CACHE=PASS');
