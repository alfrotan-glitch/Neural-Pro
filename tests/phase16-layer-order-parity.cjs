const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const layerOrder = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/compositor/layerOrder.ts'), 'utf8');
const exportRenderer = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');
const previewIndex = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/compositor/previewCompositorIndex.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/track\.type === 'effect' \|\| legacyOverlayId/.test(layerOrder), 'central overlay-role compatibility rule missing');
assert(/ROLE_BASE_Z[\s\S]*video:\s*100[\s\S]*overlay:\s*300[\s\S]*text:\s*400/.test(layerOrder), 'canonical role z-order changed');
assert(/selectActivePreviewCompositorPlan\(compositorIndex, time\)/.test(exportRenderer), 'export renderer must use canonical active-layer ordering');
assert(/activeOverlayLayers\.forEach/.test(exportRenderer), 'export renderer must render overlays explicitly');
assert(/activeTextLayers\.forEach/.test(exportRenderer), 'export renderer must render text explicitly');
assert(exportRenderer.indexOf('activeOverlayLayers.forEach') < exportRenderer.indexOf('activeTextLayers.forEach'), 'export must render overlays before text');
assert(/getImageToVideoAnimationState\(clip, time\)/.test(exportRenderer), 'export image animation must use the canonical animation state');
assert(previewIndex.includes('getPreviewLayerZIndex'), 'preview compositor must retain canonical layer ordering');
console.log('PHASE16_LAYER_ORDER_PARITY=PASS');
