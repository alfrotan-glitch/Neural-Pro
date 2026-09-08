import { DomainInvariantError } from './errors';
import { type Fps, normalizeFps, frameDuration } from './fps';

/**
 * Canonical time kernel.
 *
 * Units are explicit and singular: **project time is measured in seconds**.
 * Pixels, frames and microseconds are projections of seconds and are never
 * stored as project time.
 */

/** Seconds on the project timeline. Finite, >= 0 for every timeline position. */
export type Seconds = number;

/** Zero-based frame index in a render pass. Integer, >= 0. */
export type FrameIndex = number;

/** Tolerance for float comparison of two timeline values. */
export const TIME_EPSILON = 1e-6;

export function isFiniteTime(value: unknown): value is Seconds {
  return typeof value === 'number' && Number.isFinite(value);
}

export function timesEqual(a: number, b: number, epsilon: number = TIME_EPSILON): boolean {
  if (!isFiniteTime(a) || !isFiniteTime(b)) return false;
  return Math.abs(a - b) <= epsilon;
}

export function clampTime(time: unknown, min: unknown, max: unknown): Seconds {
  const safeTime = isFiniteTime(time) ? time : 0;
  const safeMin = isFiniteTime(min) ? min : 0;
  const safeMax = isFiniteTime(max) ? Math.max(0, max) : 0;
  if (safeMax < safeMin) return safeMin;
  return Math.min(Math.max(safeMin, safeTime), safeMax);
}

/** Clamp a time into `[0, duration]`. Never returns a negative value. */
export function clampToDuration(time: unknown, duration: unknown): Seconds {
  const safeDuration = isFiniteTime(duration) ? Math.max(0, duration) : 0;
  return clampTime(time, 0, safeDuration);
}

// ---------------------------------------------------------------------------
// Frame projection
// ---------------------------------------------------------------------------

/**
 * Canonical frame quantisation rule.
 *
 * Executing evidence: the only *frame-index* authority in the codebase is
 * `captionTimecodeService.secondsToFrameTimecode`
 * (`Math.max(0, Math.round(seconds * fps))`, line 53). That rounding rule is
 * therefore the canonical one; every frame projection derives from it.
 *
 * Round-half-away-from-zero is intentional and must stay stable: changing it
 * shifts every frame boundary in existing exports.
 */
export function frameIndexAt(seconds: unknown, fps: unknown): FrameIndex {
  const safeFps = normalizeFps(fps);
  const safeSeconds = isFiniteTime(seconds) ? seconds : 0;
  return Math.max(0, Math.round(safeSeconds * safeFps));
}

/** Snap a time down to the start of the frame that contains it. */
export function floorTimeToFrame(seconds: unknown, fps: unknown): Seconds {
  const safeFps = normalizeFps(fps);
  const safeSeconds = isFiniteTime(seconds) ? seconds : 0;
  return Math.floor(safeSeconds * safeFps) / safeFps;
}

/** Snap a time to the nearest frame boundary. */
export function quantizeTimeToFrame(seconds: unknown, fps: unknown): Seconds {
  return frameIndexAt(seconds, fps) * frameDuration(fps);
}

/** Project a frame index back to the timeline. Inverse of `frameIndexAt`. */
export function frameToSeconds(frame: unknown, fps: unknown): Seconds {
  const safeFps = normalizeFps(fps);
  const safeFrame = isFiniteTime(frame) ? Math.max(0, Math.trunc(frame)) : 0;
  return safeFrame / safeFps;
}

/** Number of frames required to cover `duration` seconds at `fps`. */
export function framesForDuration(duration: unknown, fps: unknown): FrameIndex {
  const safeFps = normalizeFps(fps);
  const safeDuration = isFiniteTime(duration) ? Math.max(0, duration) : 0;
  return Math.max(0, Math.ceil(safeDuration * safeFps - TIME_EPSILON));
}

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

/**
 * Half-open time interval `[start, end)`.
 *
 * Half-open is canonical: adjacent clips `[0, 5)` and `[5, 10)` must not both
 * be active at exactly 5 s. This is already the documented rule in
 * `features/video-studio/project/time/intervals.ts`; it is now executable here.
 */
export interface TimeInterval {
  readonly start: Seconds;
  readonly end: Seconds;
}

export function makeInterval(start: unknown, duration: unknown): TimeInterval {
  const safeStart = isFiniteTime(start) ? Math.max(0, start) : 0;
  const safeDuration = isFiniteTime(duration) ? Math.max(0, duration) : 0;
  return { start: safeStart, end: safeStart + safeDuration };
}

export function intervalDuration(interval: TimeInterval): Seconds {
  return Math.max(0, interval.end - interval.start);
}

export function intervalContains(interval: TimeInterval, time: unknown): boolean {
  if (!isFiniteTime(time)) return false;
  return time >= interval.start && time < interval.end;
}

export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function clampToInterval(interval: TimeInterval, time: unknown): Seconds {
  return clampTime(time, interval.start, interval.end);
}

export function assertInterval(interval: TimeInterval, field = 'interval'): TimeInterval {
  if (!isFiniteTime(interval.start) || !isFiniteTime(interval.end) || interval.end < interval.start) {
    throw new DomainInvariantError(
      'DOMAIN_INVALID_INTERVAL',
      field,
      `start and end must be finite with end >= start (received [${String(interval.start)}, ${String(interval.end)}))`,
    );
  }
  return interval;
}
