export const MEDIA_FRAME_SIZE_PERCENT = 85;
export const MEDIA_FRAME_CORNER_RADIUS = 8;

export interface MediaFrameGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Single source of truth for media frame composition geometry.
 */
export function getMediaFrameGeometry(canvasWidth: number, canvasHeight: number): MediaFrameGeometry {
  const width = (canvasWidth * MEDIA_FRAME_SIZE_PERCENT) / 100;
  const height = (canvasHeight * MEDIA_FRAME_SIZE_PERCENT) / 100;
  return {
    width,
    height,
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
  };
}
