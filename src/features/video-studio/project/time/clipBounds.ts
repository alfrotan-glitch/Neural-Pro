import type { ClipNode } from '../types/project';
import { getCanonicalClipTimelineDuration } from '../../../../core/engine/clipTimelineDuration';

/**
 * Editing end and playable end are intentionally different concepts.
 *
 * clip.duration remains the user's declared Timeline item duration.
 * effective end is the latest point the current source/trim/speed can actually play.
 */
export function getEffectiveClipEnd(clip: ClipNode): number {
  return clip.startAt + getCanonicalClipTimelineDuration(clip);
}
