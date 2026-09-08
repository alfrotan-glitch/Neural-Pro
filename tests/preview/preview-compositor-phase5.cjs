const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const videoPlayer = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const compositor = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/compositor/layerOrder.ts'), 'utf8');
const exportRenderer = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');
function assert(c,m){if(!c) throw new Error(m)}
assert(compositor.includes('isClipActiveAtTime'), 'shared active interval missing');
assert(compositor.includes("return time >= clip.startAt && time < end"), 'half-open interval missing');
assert(compositor.includes('getPreviewLayerZIndex'), 'preview z order helper missing');
assert(videoPlayer.includes('selectActivePreviewCompositorPlan'), 'preview must use the shared compositor plan');
assert(videoPlayer.includes('buildPreviewCompositorIndex'), 'preview must build the shared compositor index');
assert(!videoPlayer.includes("zIndex: isSelected ? 999 : 990"), 'selection must not alter z-order');
assert(!videoPlayer.includes("zIndex: isSelected ? 40 : 25"), 'selection must not alter effect z-order');
assert(exportRenderer.includes('buildPreviewCompositorIndex'), 'export must use the shared compositor index');
assert(exportRenderer.includes('selectActivePreviewCompositorPlan'), 'export must use the shared compositor plan');
console.log('PREVIEW_COMPOSITOR_PHASE5=PASS');
