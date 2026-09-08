const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformDomController.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  player.includes('getPreviewTransformCss({ ...canonicalTransform, x: imageToVideoState.x, y: imageToVideoState.y, scale: imageToVideoState.scale })'),
  'Video/Image preview must consume canonical x/y as pixels, not percentages.'
);
assert(
  player.includes('scale: imageToVideoState.scale'),
  'Video/Image preview must consume canonical scale after release.'
);
assert(
  service.includes('calculateScale(') && service.includes('MIN_SCALE') && service.includes('MAX_SCALE'),
  'Preview resize service must keep a bounded canonical scale.'
);
assert(
  dom.includes('getCanonicalClipTransform(transform as ClipNode[\'transform\'])'),
  'DOM preview drag must use the same canonical transform model as React render.'
);

console.log('PHASE31_PREVIEW_POSITION_RESIZE_INTEGRITY=PASS');
