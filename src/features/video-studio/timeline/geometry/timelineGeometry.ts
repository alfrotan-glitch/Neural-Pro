export interface TimelineViewportMetrics {
  viewportWidth: number;
  pixelsPerSecond: number;
}

export interface TimelineGeometryMetrics extends TimelineViewportMetrics {
  contentDuration: number;
  contentWidth: number;
  surfaceWidth: number;
}

export const TIMELINE_HEADER_WIDTH = 160;
export const TIMELINE_BASE_PIXELS_PER_SECOND = 35;
export const TIMELINE_MIN_SURFACE_WIDTH = 1;

export function getPixelsPerSecond(
  basePixelsPerSecond: number,
  zoom: number,
): number {
  const safeBase = Number.isFinite(basePixelsPerSecond) && basePixelsPerSecond > 0
    ? basePixelsPerSecond
    : TIMELINE_BASE_PIXELS_PER_SECOND;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return safeBase * safeZoom;
}

export function getContentWidth(
  duration: number,
  pixelsPerSecond: number,
): number {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safePixelsPerSecond = Number.isFinite(pixelsPerSecond) && pixelsPerSecond > 0
    ? pixelsPerSecond
    : TIMELINE_BASE_PIXELS_PER_SECOND;
  return Math.max(TIMELINE_MIN_SURFACE_WIDTH, safeDuration * safePixelsPerSecond);
}

export function getSurfaceWidth(
  contentWidth: number,
  viewportWidth: number,
): number {
  const safeContentWidth = Number.isFinite(contentWidth) ? Math.max(0, contentWidth) : 0;
  const safeViewportWidth = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  return Math.max(TIMELINE_MIN_SURFACE_WIDTH, safeContentWidth, safeViewportWidth);
}

export function createTimelineGeometry(
  duration: number,
  basePixelsPerSecond: number,
  zoom: number,
  viewportWidth: number,
): TimelineGeometryMetrics {
  const pixelsPerSecond = getPixelsPerSecond(basePixelsPerSecond, zoom);
  const contentWidth = getContentWidth(duration, pixelsPerSecond);
  const surfaceWidth = getSurfaceWidth(contentWidth, viewportWidth);

  return {
    viewportWidth,
    pixelsPerSecond,
    contentDuration: Math.max(0, duration),
    contentWidth,
    surfaceWidth,
  };
}

export function timeToPixel(
  time: number,
  pixelsPerSecond: number,
): number {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  return safeTime * pixelsPerSecond;
}

export function pixelToTime(
  pixel: number,
  pixelsPerSecond: number,
): number {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    return 0;
  }
  return Math.max(0, pixel) / pixelsPerSecond;
}

export function durationToPixels(
  duration: number,
  pixelsPerSecond: number,
): number {
  return timeToPixel(duration, pixelsPerSecond);
}

export function getVisibleTimeRange(
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerSecond: number,
  overscanSeconds = 5,
): { start: number; end: number } {
  const safePps = Number.isFinite(pixelsPerSecond) && pixelsPerSecond > 0 ? pixelsPerSecond : 1;
  const contentLeft = Math.max(0, scrollLeft);
  const contentRight = Math.max(contentLeft, scrollLeft + Math.max(0, viewportWidth));
  const overscan = Math.max(0, overscanSeconds);

  return {
    start: Math.max(0, contentLeft / safePps - overscan),
    end: contentRight / safePps + overscan,
  };
}
