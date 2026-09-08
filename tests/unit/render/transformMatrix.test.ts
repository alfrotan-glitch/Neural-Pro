import assert from 'node:assert/strict';
import {
  DOMMatrix2D,
  getCanonicalClipTransform,
  getCanvasTransformOrigin,
  getCanvasTransformTranslation,
  getCanonicalTransformMatrix,
  getPreviewTransformCss,
} from '../../../src/domain/render/transform';

console.log('--- RUNNING TRANSFORM MATRIX UNIT TESTS ---');

// 1. Identity Matrix
const identity = new DOMMatrix2D();
assert.equal(identity.isIdentity, true);
assert.equal(identity.a, 1);
assert.equal(identity.b, 0);
assert.equal(identity.c, 0);
assert.equal(identity.d, 1);
assert.equal(identity.e, 0);
assert.equal(identity.f, 0);
const p0 = identity.transformPoint({ x: 10, y: 20 });
assert.equal(p0.x, 10);
assert.equal(p0.y, 20);
console.log('PASS: Identity matrix initialisation and point transform');

// 2. Translation
const translated = identity.translate(100, 200);
const p1 = translated.transformPoint({ x: 10, y: 20 });
assert.equal(p1.x, 110);
assert.equal(p1.y, 220);
console.log('PASS: 2D Translation');

// 3. Scaling
const scaled = identity.scale(2, 3);
const p2 = scaled.transformPoint({ x: 10, y: 20 });
assert.equal(p2.x, 20);
assert.equal(p2.y, 60);
console.log('PASS: 2D Scaling');

// 4. Rotation
const rotated = identity.rotate(90);
const p3 = rotated.transformPoint({ x: 1, y: 0 });
assert.ok(Math.abs(p3.x - 0) < 1e-6);
assert.ok(Math.abs(p3.y - 1) < 1e-6);
console.log('PASS: 2D Rotation');

// 5. Normalisation of non-finite values
const clamped = getCanonicalClipTransform({
  scale: NaN,
  scaleX: undefined,
  scaleY: -5,
  rotation: null,
  opacity: 150,
  x: 'invalid' as any,
  y: 50,
});
assert.equal(clamped.scale, 100);
assert.equal(clamped.scaleX, 100);
assert.equal(clamped.scaleY, 100);
assert.equal(clamped.rotation, 0);
assert.equal(clamped.opacity, 100);
assert.equal(clamped.x, 0);
assert.equal(clamped.y, 50);
console.log('PASS: getCanonicalClipTransform normalisation and clamping');

// 6. getPreviewTransformCss format
const css = getPreviewTransformCss({ x: 20, y: -30, scale: 100, scaleX: 150, scaleY: 80, rotation: 45, opacity: 100 });
assert.equal(css, 'translate3d(20px, -30px, 0) rotate(45deg) scale(1.5, 0.8)');
console.log('PASS: getPreviewTransformCss outputs canonical T·R·S CSS string');

console.log('\nTRANSFORM_MATRIX_UNIT_TESTS=PASS');
