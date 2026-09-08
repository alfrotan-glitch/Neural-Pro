import type { ClipNode } from '../../project/types/project';
import { getEffectiveClipTimelineDuration } from './mediaTimeMapper';

export interface ImageToVideoAnimationState {
  x: number;
  y: number;
  scale: number;
}

function finiteOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Canonical Image-to-Video (Ken Burns) transform used by Preview and Export.
 *
 * The returned scale is relative to clip.transform.scale. Position is expressed
 * in the same percentage-of-composition coordinate system as ClipNode.transform.
 */
export function getImageToVideoAnimationState(clip: ClipNode, projectTime: number): ImageToVideoAnimationState {
  const baseScale = finiteOr(clip.transform?.scale, 100);
  const baseX = finiteOr(clip.transform?.x, 0);
  const baseY = finiteOr(clip.transform?.y, 0);

  if (!clip.properties?.imageToVideoEnabled || !clip.properties?.imageUrl) {
    return { x: baseX, y: baseY, scale: baseScale };
  }

  const duration = Math.max(0.001, getEffectiveClipTimelineDuration(clip));
  const localProgress = Math.min(1, Math.max(0, (projectTime - clip.startAt) / duration));
  const startScale = finiteOr(clip.properties.imageToVideoStartScale, baseScale);
  const endScale = finiteOr(clip.properties.imageToVideoEndScale, startScale);
  const startX = finiteOr(clip.properties.imageToVideoStartX, baseX);
  const endX = finiteOr(clip.properties.imageToVideoEndX, startX);
  const startY = finiteOr(clip.properties.imageToVideoStartY, baseY);
  const endY = finiteOr(clip.properties.imageToVideoEndY, startY);
  const eased = localProgress * localProgress * (3 - 2 * localProgress);
  const relativeScale = Math.max(0.01, (startScale + (endScale - startScale) * eased) / Math.max(1, startScale));

  return {
    x: baseX + (endX - startX) * eased,
    y: baseY + (endY - startY) * eased,
    scale: baseScale * relativeScale,
  };
}
