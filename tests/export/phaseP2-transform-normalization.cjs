const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const model = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/clipTransformModel.ts'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformDomController.ts'), 'utf8');
function assert(c,m){ if(!c) throw new Error(`FAIL: ${m}`); console.log(`PASS: ${m}`); }
assert(model.includes('function finiteOr'), 'transform normalization helper exists');
assert(model.includes('scale: scale > 0 ? scale : 100'), 'scale normalizes non-positive values while preserving valid values');
assert(model.includes('opacity: Math.max(0, Math.min(100, opacity))'), 'opacity preserves valid zero while clamping to 0..100');
assert(exporter.includes('getCanonicalClipTransform'), 'export consumes canonical transform');
assert(exporter.includes('getCanvasTransformTranslation'), 'export consumes canonical translation');
assert(!exporter.includes('(clip.transform?.scale || 100)'), 'export no longer coerces scale=0 to 100');
assert(preview.includes('getCanonicalClipTransform'), 'preview consumes canonical transform');
assert(dom.includes('getCanonicalClipTransform'), 'interactive DOM transform consumes canonical transform');
console.log('PHASE_P2_TRANSFORM_NORMALIZATION=PASS');
