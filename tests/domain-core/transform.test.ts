import { check, close, deepEqual, equal, suite, throws } from './harness';
import {
  IDENTITY_TRANSFORM,
  OPACITY_MAX,
  OPACITY_MIN,
  assertTransform,
  canonicalTransform,
  transformMatrix,
  transformOpacityFraction,
  transformScaleFactors,
  transformToCss,
} from '../../src/domain/core/transform';
import { transformOrigin } from '../../src/domain/core/geometry';

const size = { width: 1920, height: 1080 };

export default suite('transform — one normaliser, one composition order', () => {
  // ---- normalisation -----------------------------------------------------
  equal(canonicalTransform(null).scale, 100, 'a missing transform normalises to identity scale');
  equal(canonicalTransform(undefined).opacity, 100, 'a missing transform normalises to opaque');
  equal(canonicalTransform({ scale: 0 }).scale, 100, 'a zero scale falls back to 100, never to 0');
  equal(canonicalTransform({ scale: -5 }).scale, 100, 'a negative scale falls back to 100');
  equal(canonicalTransform({ scaleX: 0 }).scaleX, 100, 'a zero scaleX falls back to 100');
  equal(canonicalTransform({ scaleY: Number.NaN }).scaleY, 100, 'a NaN scaleY falls back to 100');
  equal(canonicalTransform({ opacity: 150 }).opacity, 100, 'opacity above 100 clamps to 100');
  equal(canonicalTransform({ opacity: -20 }).opacity, 0, 'opacity below 0 clamps to 0');
  equal(canonicalTransform({ x: Number.NaN }).x, 0, 'a NaN offset falls back to 0');
  equal(canonicalTransform({ rotation: Number.NaN }).rotation, 0, 'a NaN rotation falls back to 0');
  equal(canonicalTransform({ x: 10, y: -20, scale: 50 }).opacity, 100, 'unspecified fields keep their defaults');

  // ---- scale composition -------------------------------------------------
  const factors = transformScaleFactors(canonicalTransform({ scale: 200, scaleX: 50, scaleY: 100 }));
  equal(factors.sx, 1, 'scale 200% × scaleX 50% is a 1.0 factor');
  equal(factors.sy, 2, 'scale 200% × scaleY 100% is a 2.0 factor');

  equal(transformOpacityFraction(canonicalTransform({ opacity: 50 })), 0.5, 'opacity 50 is a 0.5 alpha');
  equal(transformOpacityFraction(canonicalTransform({ opacity: 200 })), 1, 'a clamped opacity yields alpha 1');

  // ---- canonical matrix: T · R · S ---------------------------------------
  const origin = transformOrigin(size);
  equal(origin.x, 960, 'the transform origin is the horizontal centre');
  equal(origin.y, 540, 'the transform origin is the vertical centre');

  const identity = transformMatrix(canonicalTransform(null), size);
  close(identity.a, 1, 'identity a (m11) is 1');
  close(identity.b, 0, 'identity b (m12) is 0');
  close(identity.c, 0, 'identity c (m21) is 0');
  close(identity.d, 1, 'identity d (m22) is 1');
  equal(identity.e, 960, 'identity translation is the composition centre x');
  equal(identity.f, 540, 'identity translation is the composition centre y');

  const offset = transformMatrix(canonicalTransform({ x: 10, y: -20 }), size);
  equal(offset.e, 970, 'x translates the origin horizontally');
  equal(offset.f, 520, 'y translates the origin vertically');

  // A quarter turn on a uniform scale.
  const quarter = transformMatrix(canonicalTransform({ rotation: 90 }), size);
  close(quarter.a, 0, 'R(90) a is cos 90 = 0');
  close(quarter.b, 1, 'R(90) b is sin 90 = 1');
  close(quarter.c, -1, 'R(90) c is -sin 90 = -1');
  close(quarter.d, 0, 'R(90) d is cos 90 = 0');

  // The canonical order is T · R · S, NOT T · S · R.
  // For a uniform scale they coincide; they diverge when scaleX ≠ scaleY and rotation ≠ 0,
  // which is exactly the D-004 case. Both orders are computed here so the difference is
  // pinned by a test instead of discovered in a render.
  const nonUniform = canonicalTransform({ rotation: 30, scaleX: 200, scaleY: 50 });
  const radians = (30 * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const { sx, sy } = transformScaleFactors(nonUniform);
  const canonical = transformMatrix(nonUniform, size);
  close(canonical.a, cos * sx, 'T·R·S a is cos·sx');
  close(canonical.c, -sin * sy, 'T·R·S c is -sin·sy (shear comes from sy in the canonical order)');
  const reversedC = -sin * sx; // what T·S·R would produce for c
  check(
    Math.abs(canonical.c - reversedC) > 1e-9,
    'F-2 pinned: T·R·S and T·S·R differ for a non-uniform scale (the preview emitter is being reconciled by WP-03)',
  );

  // ---- CSS emission ------------------------------------------------------
  const css = transformToCss(canonicalTransform({ x: 5, y: 6, rotation: 7, scale: 200, scaleX: 50, scaleY: 100 }));
  check(css.indexOf('rotate(') < css.indexOf('scale('), 'the canonical CSS emits rotate before scale (T·R·S)');
  check(css.startsWith('translate3d(5px, 6px, 0)'), 'the canonical CSS starts with the translation');

  // ---- strict validation -------------------------------------------------
  // `assertTransform` is a *boundary* check: it judges a transform as given.
  // `canonicalTransform` repairs one; the two are complementary, not redundant.
  equal(
    assertTransform(canonicalTransform({ opacity: 101 })).opacity,
    100,
    'a repaired transform passes the boundary check',
  );
  throws(
    () => assertTransform({ ...IDENTITY_TRANSFORM, opacity: 101 }),
    'an unrepaired opacity above 100 is rejected at the boundary',
  );
  throws(
    () => assertTransform({ ...IDENTITY_TRANSFORM, scale: 0 }),
    'a non-positive scale is rejected',
  );
  throws(
    () => assertTransform({ ...IDENTITY_TRANSFORM, rotation: Number.NaN }),
    'a non-finite rotation is rejected',
  );
  deepEqual(assertTransform(canonicalTransform(null)), IDENTITY_TRANSFORM, 'the identity transform is valid');
});
