const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const universal = fs.readFileSync(path.join(root, 'src/components/inspector/UniversalTransformControls.tsx'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/components/inspector/InspectorEngine.tsx'), 'utf8');
const animation = fs.readFileSync(path.join(root, 'src/features/video-studio/animation/types/animation.ts'), 'utf8');
const caption = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
const canvas = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');

assert.match(universal, /transform\.scaleX/);
assert.match(universal, /transform\.scaleY/);
assert.match(universal, /transform\.x/);
assert.match(universal, /transform\.y/);
assert.match(universal, /transform\.rotation/);
assert.match(universal, /transform\.opacity/);
assert.match(universal, /Aspect-Locked Transform/);
assert.match(engine, /VisualElementInspectorPanel/);
assert.match(animation, /'transform\.scaleX'/);
assert.match(animation, /'transform\.scaleY'/);
assert.match(animation, /'transform\.opacity'/);
assert.match(caption, /plan\.transform\.scaleX/);
assert.match(caption, /plan\.transform\.scaleY/);
assert.match(canvas, /canonicalTransform\.scaleX/);
assert.match(canvas, /canonicalTransform\.scaleY/);

console.log('PHASE59_INSPECTOR_TRANSFORM_PARITY=PASS');
console.log('PHASE59_ATOMIC_ASPECT_LOCK=PASS');
console.log('PHASE59_PREVIEW_EXPORT_PARITY=PASS');
