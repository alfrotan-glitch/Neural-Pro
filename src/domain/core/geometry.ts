import { DomainInvariantError } from './errors';

/**
 * Canonical geometry kernel.
 *
 * Two independent notions of geometry live in this codebase and must never be
 * conflated again:
 *
 *  1. **Composition geometry** — where media sits inside the output frame.
 *     Canonical constant: `MEDIA_FRAME_SIZE_FRACTION = 0.85`.
 *  2. **Timeline geometry** — a *projection* of seconds to pixels. It is view
 *     state, not project state; it lives in `features/video-studio/timeline/geometry`
 *     and is deliberately NOT part of this kernel.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Size {
  readonly x: number;
  readonly y: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function isFiniteSize(value: Size): boolean {
  return (
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );
}

export function assertSize(value: Size, field = 'size'): Size {
  if (!isFiniteSize(value)) {
    throw new DomainInvariantError(
      'DOMAIN_INVALID_SIZE',
      field,
      `width and height must be finite and >= 0 (received ${value?.width}×${value?.height})`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Composition frame
// ---------------------------------------------------------------------------

/**
 * The canonical media frame: media is composed inside an 85 % inset of the
 * output canvas, centred.
 *
 * SHIM-007 owner=Core-Architecture remove=WP-12 reason=legacy-authority-still-executes
 *
 * Executing evidence: `mediaFrameGeometry` in
 * `features/video-studio/playback/services/mediaFrameGeometry.ts`, consumed by
 * both `VideoPlayer.tsx` (preview) and `CanvasExportRenderer.ts:66` (export).
 * The value is preserved exactly.
 */
export const MEDIA_FRAME_SIZE_PERCENT = 85;
export const MEDIA_FRAME_SIZE_FRACTION = MEDIA_FRAME_SIZE_PERCENT / 100;

export function mediaFrameGeometry(canvas: Size): Rect {
  if (!isFiniteSize(canvas)) return { width: 0, height: 0, x: 0, y: 0 };
  // The centring arithmetic lives in `centerRect` only.
  return centerRect(
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    {
      width: canvas.width * MEDIA_FRAME_SIZE_FRACTION,
      height: canvas.height * MEDIA_FRAME_SIZE_FRACTION,
    },
  );
}

/** Centre of a composition. The canonical transform pivot. */
export function transformOrigin(composition: Size): Point {
  return { x: composition.width / 2, y: composition.height / 2 };
}

/** Place `size` at the centre of `frame`. */
export function centerRect(frame: Rect, size: Size): Rect {
  return {
    x: frame.x + (frame.width - size.width) / 2,
    y: frame.y + (frame.height - size.height) / 2,
    width: size.width,
    height: size.height,
  };
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------

/**
 * How source media is fitted into a composition box.
 *
 * `cover` is the executing default in Neural-Pro — evidence:
 *  - preview: `VideoPlayer.tsx` renders media with the CSS class `object-cover`;
 *  - export: `CanvasExportRenderer.ts:79` uses
 *    `scale = Math.max(boxWidth / vw, boxHeight / vh)` (max ⇒ cover).
 */
export type FitMode = 'cover' | 'contain' | 'fill' | 'none';

export const DEFAULT_FIT_MODE: FitMode = 'cover';

/**
 * Fit `source` into `frame` under `mode`, returning the destination rect.
 *
 * `cover`   scales by `max` — fills the frame, may overflow it (clipped).
 * `contain` scales by `min` — fits inside the frame, may letterbox.
 * `fill`    stretches to the frame, ignoring aspect ratio.
 * `none`    natural size, centred.
 *
 * Degenerate input (zero-sized source or frame) yields a zero rect rather than
 * `NaN` or `Infinity`, so a render pass can never emit a non-finite draw call.
 */
export function fitRect(source: Size, frame: Rect, mode: FitMode = DEFAULT_FIT_MODE): Rect {
  if (!isFiniteSize(source) || !isFiniteSize(frame)) {
    return { x: frame.x, y: frame.y, width: 0, height: 0 };
  }
  if (source.width === 0 || source.height === 0 || frame.width === 0 || frame.height === 0) {
    return { x: frame.x, y: frame.y, width: 0, height: 0 };
  }

  if (mode === 'fill') return { ...frame };
  if (mode === 'none') return centerRect(frame, source);

  const scaleX = frame.width / source.width;
  const scaleY = frame.height / source.height;
  const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  return centerRect(frame, { width: source.width * scale, height: source.height * scale });
}

/** Aspect ratio (`width / height`) of a size, or `0` when undefined. */
export function aspectRatio(size: Size): number {
  if (!isFiniteSize(size) || size.height === 0) return 0;
  return size.width / size.height;
}
