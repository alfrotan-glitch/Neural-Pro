const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const geometry = fs.readFileSync(
  path.join(root, 'src/features/video-studio/playback/services/mediaFrameGeometry.ts'),
  'utf8',
);
const preview = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/MEDIA_FRAME_SIZE_PERCENT\s*=\s*85/.test(geometry), 'canonical media frame must remain 85%');
assert(/export function getMediaFrameGeometry\(canvasWidth:\s*number,\s*canvasHeight:\s*number\)/.test(geometry), 'canonical geometry helper missing');
assert(/MEDIA_FRAME_SIZE_PERCENT/.test(preview), 'Preview must use canonical media frame size');
assert(/getMediaFrameGeometry\(width, height\)/.test(exporter), 'Export must use canonical media frame geometry');
assert(/const boxWidth = mediaFrame\.width/.test(exporter), 'Export media width must come from shared geometry');
assert(/const boxHeight = mediaFrame\.height/.test(exporter), 'Export media height must come from shared geometry');
assert(/getCanvasTransformTranslation\(\{ \.\.\.canonicalTransform, x: imageToVideoState\.x, y: imageToVideoState\.y, scale: imageToVideoState\.scale \}, width, height\)/.test(exporter), 'Export transform coordinate contract must use canonical state');
assert(/const scaleFactor = imageToVideoState\.scale \/ 100;/.test(exporter), 'Export scale transform must use canonical state');
console.log('PHASE_P1_MEDIA_FRAME_GEOMETRY=PASS');
