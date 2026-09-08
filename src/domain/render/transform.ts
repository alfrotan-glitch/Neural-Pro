import type { ClipNode } from '../../features/video-studio/project/types/project';

export interface CanonicalClipTransform {
  x: number;
  y: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface PreviewTransformCssValues {
  x: number;
  y: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  opacity: number;
}

export class DOMMatrix2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
  readonly is2D: boolean = true;

  constructor(init?: [number, number, number, number, number, number] | DOMMatrix2D | number[]) {
    if (init instanceof DOMMatrix2D) {
      this.a = init.a;
      this.b = init.b;
      this.c = init.c;
      this.d = init.d;
      this.e = init.e;
      this.f = init.f;
    } else if (Array.isArray(init) && init.length >= 6) {
      this.a = Number(init[0]);
      this.b = Number(init[1]);
      this.c = Number(init[2]);
      this.d = Number(init[3]);
      this.e = Number(init[4]);
      this.f = Number(init[5]);
    } else {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  transformPoint(point: { x?: number; y?: number } = { x: 0, y: 0 }): { x: number; y: number; z: number; w: number } {
    const px = point.x ?? 0;
    const py = point.y ?? 0;
    return {
      x: this.a * px + this.c * py + this.e,
      y: this.b * px + this.d * py + this.f,
      z: 0,
      w: 1,
    };
  }

  multiply(m: DOMMatrix2D): DOMMatrix2D {
    return new DOMMatrix2D([
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    ]);
  }

  translate(tx: number, ty = 0): DOMMatrix2D {
    const t = new DOMMatrix2D([1, 0, 0, 1, tx, ty]);
    return this.multiply(t);
  }

  rotate(deg: number): DOMMatrix2D {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const r = new DOMMatrix2D([cos, sin, -sin, cos, 0, 0]);
    return this.multiply(r);
  }

  scale(sx: number, sy = sx): DOMMatrix2D {
    const s = new DOMMatrix2D([sx, 0, 0, sy, 0, 0]);
    return this.multiply(s);
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }

  toArray(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.e, this.f];
  }
}

export function finiteOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * Single source of truth for persisted ClipNode transform values.
 *
 * `x` and `y` are pixel offsets from the canvas center, matching the Inspector
 * contract (px). Missing/non-finite values receive safe defaults, while opacity is clamped to the valid 0..100 range. Preview and
 * export must consume this same normalized representation.
 */
export function getCanonicalClipTransform(
  transform: ClipNode['transform'] | PreviewTransformCssValues | null | undefined,
): CanonicalClipTransform {
  const scale = finiteOr(transform?.scale, 100);
  const opacity = finiteOr(transform?.opacity, 100);
  const scaleX = finiteOr(transform?.scaleX, 100);
  const scaleY = finiteOr(transform?.scaleY, 100);
  return {
    x: finiteOr(transform?.x, 0),
    y: finiteOr(transform?.y, 0),
    scale: scale > 0 ? scale : 100,
    scaleX: scaleX > 0 ? scaleX : 100,
    scaleY: scaleY > 0 ? scaleY : 100,
    rotation: finiteOr(transform?.rotation, 0),
    opacity: Math.max(0, Math.min(100, opacity)),
  };
}

export function getCanvasTransformOrigin(
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: width / 2, y: height / 2 };
}

export function getCanvasTransformTranslation(
  transform: CanonicalClipTransform,
  width: number,
  height: number,
): { x: number; y: number } {
  const origin = getCanvasTransformOrigin(width, height);
  return {
    x: origin.x + transform.x,
    y: origin.y + transform.y,
  };
}

/**
 * Single canonical transform matrix calculation (INV-003, ADR-007, D-004 fix).
 *
 * Evaluates in canonical order: T(origin + x, origin + y) · R(rotation) · S(scale * scaleX, scale * scaleY)
 * Both Preview (via getPreviewTransformCss) and Export (via Canvas/DOMMatrix) derive from this order.
 */
export function getCanonicalTransformMatrix(
  transform: ClipNode['transform'] | PreviewTransformCssValues | null | undefined,
  width: number,
  height: number,
): DOMMatrix2D {
  const canonical = getCanonicalClipTransform(transform);
  const translation = getCanvasTransformTranslation(canonical, width, height);
  const sx = (canonical.scale / 100) * (canonical.scaleX / 100);
  const sy = (canonical.scale / 100) * (canonical.scaleY / 100);
  const rad = (canonical.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // M = T(tx, ty) · R(deg) · S(sx, sy)
  return new DOMMatrix2D([
    sx * cos,
    sx * sin,
    -sy * sin,
    sy * cos,
    translation.x,
    translation.y,
  ]);
}

/**
 * Canonical CSS transform contract shared by React Preview and imperative
 * transform overrides. The transform origin is always the element center so
 * position, resize, and rotation use the same pivot before and after release.
 *
 * In CSS, transform: translate3d(x,y,0) rotate(r) scale(sx,sy) applies right-to-left:
 * Scale first, then Rotation, then Translation (T · R · S).
 * This guarantees strict mathematical parity with Canvas2D (D-004 closed).
 */
export function getPreviewTransformCss(
  transform: ClipNode['transform'] | PreviewTransformCssValues | null | undefined,
): string {
  const canonical = getCanonicalClipTransform(transform as ClipNode['transform']);
  const sx = (canonical.scale / 100) * (canonical.scaleX / 100);
  const sy = (canonical.scale / 100) * (canonical.scaleY / 100);
  return `translate3d(${canonical.x}px, ${canonical.y}px, 0) rotate(${canonical.rotation}deg) scale(${sx}, ${sy})`;
}
