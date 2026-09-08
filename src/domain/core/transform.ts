import { DomainInvariantError } from './errors';
import type { Size } from './geometry';
import { transformOrigin } from './geometry';

/**
 * Canonical transform kernel.
 *
 * Port of the executing authority
 * `features/video-studio/playback/services/clipTransformModel.ts`, minus its
 * CSS-string helper, plus the **canonical composition order** demanded by
 * `docs/contracts/project-state.md` §4:
 *
 *      T(origin + x, origin + y) · R(rotation) · S(scale·scaleX, scale·scaleY)
 *
 * FINDING F-2 (recorded, not silently fixed): the executing preview helper
 * `getPreviewTransformCss` emits `translate3d(x, y, 0) scale(sx, sy) rotate(r)`,
 * which is **T · S · R**. For a uniform scale the two orders are identical;
 * they diverge exactly when `scaleX ≠ scaleY` **and** `rotation ≠ 0`, which is
 * the D-004 case (measured drift: 662.019 px). This kernel defines the
 * canonical order only — reconciling the preview emitter belongs to WP-03 and
 * requires a parity run, not an edit here.
 */

/**
 * Normalised clip transform.
 *
 * Units: `x`/`y` are **pixels** offset from the composition centre;
 * `scale`/`scaleX`/`scaleY` are **percent** (`100` = 1:1, must be `> 0`);
 * `rotation` is **degrees**; `opacity` is `0..100`.
 */
export interface CanonicalTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
  readonly opacity: number;
}

/** Loosely-typed input accepted from persisted documents. */
export interface TransformInput {
  readonly x?: unknown;
  readonly y?: unknown;
  readonly scale?: unknown;
  readonly scaleX?: unknown;
  readonly scaleY?: unknown;
  readonly rotation?: unknown;
  readonly opacity?: unknown;
}

export const IDENTITY_TRANSFORM: CanonicalTransform = Object.freeze({
  x: 0,
  y: 0,
  scale: 100,
  scaleX: 100,
  scaleY: 100,
  rotation: 0,
  opacity: 100,
});

export const OPACITY_MIN = 0;
export const OPACITY_MAX = 100;

function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveScaleOr(value: unknown, fallback: number): number {
  const numeric = finiteOr(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

/**
 * The single transform normaliser.
 *
 * Missing or non-finite values receive safe defaults; non-positive scales fall
 * back to `100`; opacity is clamped into `0..100`.
 */
export function canonicalTransform(input: TransformInput | null | undefined): CanonicalTransform {
  if (!input) return { ...IDENTITY_TRANSFORM };
  const opacity = finiteOr(input.opacity, IDENTITY_TRANSFORM.opacity);
  return {
    x: finiteOr(input.x, 0),
    y: finiteOr(input.y, 0),
    scale: positiveScaleOr(input.scale, 100),
    scaleX: positiveScaleOr(input.scaleX, 100),
    scaleY: positiveScaleOr(input.scaleY, 100),
    rotation: finiteOr(input.rotation, 0),
    opacity: Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, opacity)),
  };
}

/** Effective scale factors as fractions of 1 (`1` = 1:1). */
export function transformScaleFactors(transform: CanonicalTransform): { readonly sx: number; readonly sy: number } {
  return {
    sx: (transform.scale / 100) * (transform.scaleX / 100),
    sy: (transform.scale / 100) * (transform.scaleY / 100),
  };
}

/** Opacity as a `0..1` fraction, for canvas `globalAlpha`. */
export function transformOpacityFraction(transform: CanonicalTransform): number {
  return Math.max(0, Math.min(1, transform.opacity / 100));
}

/**
 * Canonical 2×3 affine matrix in Canvas2D order `[a, b, c, d, e, f]`:
 *
 *      x' = a·x + c·y + e
 *      y' = b·x + d·y + f
 *
 * Equal to `T(origin + x, origin + y) · R(rotation) · S(sx, sy)`.
 */
export interface TransformMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export function transformMatrix(
  transform: CanonicalTransform,
  composition: Size,
  origin: { readonly x: number; readonly y: number } = transformOrigin(composition),
): TransformMatrix {
  const radians = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const { sx, sy } = transformScaleFactors(transform);
  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    e: origin.x + transform.x,
    f: origin.y + transform.y,
  };
}

/**
 * Canonical CSS transform string: `translate3d(...) rotate(...) scale(...)`,
 * i.e. **T · R · S**, matching `transformMatrix` exactly.
 */
export function transformToCss(transform: CanonicalTransform): string {
  const { sx, sy } = transformScaleFactors(transform);
  return `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${transform.rotation}deg) scale(${sx}, ${sy})`;
}

export function assertTransform(transform: CanonicalTransform, field = 'transform'): CanonicalTransform {
  const numericFields: readonly (keyof CanonicalTransform)[] = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'opacity'];
  for (const key of numericFields) {
    if (!Number.isFinite(transform[key])) {
      throw new DomainInvariantError('DOMAIN_INVALID_TRANSFORM', `${field}.${key}`, 'must be a finite number');
    }
  }
  if (transform.scale <= 0 || transform.scaleX <= 0 || transform.scaleY <= 0) {
    throw new DomainInvariantError('DOMAIN_INVALID_TRANSFORM', `${field}.scale`, 'scale, scaleX and scaleY must be > 0');
  }
  if (transform.opacity < OPACITY_MIN || transform.opacity > OPACITY_MAX) {
    throw new DomainInvariantError('DOMAIN_INVALID_TRANSFORM', `${field}.opacity`, 'must be within 0..100');
  }
  return transform;
}
