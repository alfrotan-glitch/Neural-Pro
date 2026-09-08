import { TIMELINE_HEADER_WIDTH } from './timelineGeometry';

export interface TimelineViewportCoordinateInput {
  clientX: number;
  workspaceRectLeft: number;
  scrollLeft: number;
  pixelsPerSecond: number;
}

export interface TimelineVisibleViewportInput {
  scrollLeft: number;
  viewportWidth: number;
  pixelsPerSecond: number;
  overscanSeconds?: number;
}

export function getTimelineContentViewportWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  return Math.max(0, viewportWidth - TIMELINE_HEADER_WIDTH);
}

/**
 * Convert a browser client X coordinate into Timeline-local pixels.
 * The Track Header is outside the time axis and horizontal scroll is applied
 * to the whole surface, therefore the canonical mapping is:
 * clientX - workspaceLeft + scrollLeft - headerWidth.
 */
export function clientXToTimelinePixel(input: TimelineViewportCoordinateInput): number {
  const clientX = Number.isFinite(input.clientX) ? input.clientX : 0;
  const workspaceRectLeft = Number.isFinite(input.workspaceRectLeft) ? input.workspaceRectLeft : 0;
  const scrollLeft = Number.isFinite(input.scrollLeft) ? Math.max(0, input.scrollLeft) : 0;
  return Math.max(0, clientX - workspaceRectLeft + scrollLeft - TIMELINE_HEADER_WIDTH);
}

export function timelinePixelToClientX(
  timelinePixel: number,
  workspaceRectLeft: number,
  scrollLeft: number,
): number {
  const safePixel = Number.isFinite(timelinePixel) ? Math.max(0, timelinePixel) : 0;
  const safeRectLeft = Number.isFinite(workspaceRectLeft) ? workspaceRectLeft : 0;
  const safeScrollLeft = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
  return safeRectLeft + TIMELINE_HEADER_WIDTH + safePixel - safeScrollLeft;
}

export function getVisibleTimelineTimeRange(
  input: TimelineVisibleViewportInput,
): { start: number; end: number } {
  const safePps = Number.isFinite(input.pixelsPerSecond) && input.pixelsPerSecond > 0
    ? input.pixelsPerSecond
    : 1;
  const scrollLeft = Number.isFinite(input.scrollLeft) ? Math.max(0, input.scrollLeft) : 0;
  const contentViewportWidth = getTimelineContentViewportWidth(input.viewportWidth);
  const overscanSeconds = Number.isFinite(input.overscanSeconds)
    ? Math.max(0, input.overscanSeconds ?? 0)
    : 5;

  return {
    start: Math.max(0, scrollLeft / safePps - overscanSeconds),
    end: (scrollLeft + contentViewportWidth) / safePps + overscanSeconds,
  };
}
