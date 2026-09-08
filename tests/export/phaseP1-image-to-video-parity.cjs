const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const animation = fs.readFileSync(
  path.join(root, 'src/features/video-studio/playback/services/imageToVideoAnimation.ts'),
  'utf8',
);
const preview = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/export function getImageToVideoAnimationState\(/.test(animation), 'canonical image-to-video animation service missing');
assert(/getEffectiveClipTimelineDuration\(clip\)/.test(animation), 'image-to-video must use canonical effective duration');
assert(/const eased = localProgress \* localProgress \* \(3 - 2 \* localProgress\);/.test(animation), 'canonical image-to-video easing missing');
assert(/x: baseX \+ \(endX - startX\) \* eased/.test(animation), 'canonical image-to-video X interpolation missing');
assert(/y: baseY \+ \(endY - startY\) \* eased/.test(animation), 'canonical image-to-video Y interpolation missing');
assert(/scale: baseScale \* relativeScale/.test(animation), 'canonical image-to-video scale interpolation missing');
assert(/getImageToVideoAnimationState\(clip, coherentPresentationTime\)/.test(preview), 'Preview must use canonical image-to-video state at the coherent presentation time');
assert(preview.includes('getPreviewTransformCss({ ...canonicalTransform, x: imageToVideoState.x, y: imageToVideoState.y, scale: imageToVideoState.scale })'), 'Preview must render animated transform through canonical formatter');
assert(preview.includes('scale: imageToVideoState.scale'), 'Preview must pass animated scale through canonical formatter');
assert(/getImageToVideoAnimationState\(clip, time\)/.test(exporter), 'Export must use canonical image-to-video state');
assert(/getCanvasTransformTranslation\(\{ \.\.\.canonicalTransform, x: imageToVideoState\.x, y: imageToVideoState\.y, scale: imageToVideoState\.scale \}, width, height\)/.test(exporter), 'Export must render canonical animated X position');
assert(/const scaleFactor = imageToVideoState\.scale \/ 100;/.test(exporter), 'Export must render canonical animated scale');
console.log('PHASE_P1_IMAGE_TO_VIDEO_PARITY=PASS');
