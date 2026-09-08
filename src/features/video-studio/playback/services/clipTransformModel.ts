import type { ClipNode } from '../../project/types/project';

export interface CanonicalClipTransform {
  x: number;
  y: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

function finiteOr(value: unknown, fallback: number): number {
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
  transform: ClipNode['transform'] | null | undefined,
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


export interface PreviewTransformCssValues {
  x: number;
  y: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  opacity: number;
}

/**
 * Canonical CSS transform contract shared by React Preview and imperative
 * transform overrides. The transform origin is always the element center so
 * position, resize, and rotation use the same pivot before and after release.
 */
export function getPreviewTransformCss(
  transform: ClipNode['transform'] | PreviewTransformCssValues | null | undefined,
): string {
  const canonical = getCanonicalClipTransform(transform as ClipNode['transform']);
  const sx = (canonical.scale / 100) * (canonical.scaleX / 100);
  const sy = (canonical.scale / 100) * (canonical.scaleY / 100);
  return `translate3d(${canonical.x}px, ${canonical.y}px, 0) scale(${sx}, ${sy}) rotate(${canonical.rotation}deg)`;
}
