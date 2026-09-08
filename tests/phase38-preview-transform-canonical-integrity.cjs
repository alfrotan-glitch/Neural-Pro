const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformDomController.ts'), 'utf8');
const model = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/clipTransformModel.ts'), 'utf8');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

assert((player.match(/getPreviewTransformCss\(/g) || []).length >= 4, 'Preview branches must use the canonical transform formatter');
assert((player.match(/transformOrigin:\s*'center center'/g) || []).length >= 4, 'Preview branches must declare the canonical center pivot');
assert(dom.includes("element.style.transformOrigin = 'center center';"), 'Imperative DOM transform must use center pivot');
assert(dom.includes("removeProperty('transform-origin')"), 'Transform-origin override must be cleaned up on release/cancel');
assert(model.includes('getPreviewTransformCss'), 'Canonical preview transform formatter must exist in the shared transform model');
assert(!/transform:\s*`translate\(/.test(player), 'VideoPlayer must not duplicate the preview transform CSS contract');
assert(!/return `translate3d\(/.test(dom), 'DOM controller must delegate transform construction to the shared model');
console.log('PHASE38_PREVIEW_TRANSFORM_CANONICAL=PASS');
