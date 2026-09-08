/**
 * Canonical geometry for media inside the Video Studio composition frame.
 *
 * Preview and export must use the same media frame so WYSIWYG composition
 * does not change when the user exports the project.
 */
export const MEDIA_FRAME_SIZE_PERCENT = 85;
export const MEDIA_FRAME_SIZE_FRACTION = MEDIA_FRAME_SIZE_PERCENT / 100;

export interface MediaFrameGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
}

export function getMediaFrameGeometry(canvasWidth: number, canvasHeight: number): MediaFrameGeometry {
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth < 0 || canvasHeight < 0) {
    return { width: 0, height: 0, x: 0, y: 0 };
  }

  const width = canvasWidth * MEDIA_FRAME_SIZE_FRACTION;
  const height = canvasHeight * MEDIA_FRAME_SIZE_FRACTION;

  return {
    width,
    height,
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
  };
}
