import type { ClipNode } from '../../project/types/project';
import { durationToPixels, timeToPixel } from './timelineGeometry';

export interface TimelineClipGeometry {
  readonly startAt: number;
  readonly duration: number;
  readonly endAt: number;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly rightPx: number;
}

const MIN_RENDER_WIDTH_PX = 2;
const MIN_TIMELINE_DURATION = 0;

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/**
 * Canonical Timeline geometry: project time is authoritative; pixels are a pure
 * projection of time. The renderer never derives time from DOM width/transform.
 */
export function resolveTimelineClipGeometry(
  clip: Pick<ClipNode, 'startAt' | 'duration'>,
  pixelsPerSecond: number,
): TimelineClipGeometry {
  const startAt = finiteNonNegative(clip.startAt);
  const duration = Math.max(
    MIN_TIMELINE_DURATION,
    finiteNonNegative(clip.duration),
  );
  const endAt = startAt + duration;
  const leftPx = timeToPixel(startAt, pixelsPerSecond);
  const widthPx = Math.max(
    MIN_RENDER_WIDTH_PX,
    durationToPixels(duration, pixelsPerSecond),
  );

  return {
    startAt,
    duration,
    endAt,
    leftPx,
    widthPx,
    rightPx: leftPx + widthPx,
  };
}

export function isTimelineClipVisible(
  geometry: Pick<TimelineClipGeometry, 'startAt' | 'endAt'>,
  visibleStart: number,
  visibleEnd: number,
): boolean {
  return geometry.endAt >= Math.max(0, visibleStart) &&
    geometry.startAt <= Math.max(0, visibleEnd);
}
