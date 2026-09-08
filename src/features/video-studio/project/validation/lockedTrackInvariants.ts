import type { Track } from '../types/project';

function cloneForComparison(track: Track): unknown {
  return structuredClone(track.clips);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

/**
 * A locked track is immutable with respect to its clip/content payload.
 * Track-level controls (lock/mute/visibility/collapse) are intentionally
 * excluded so UI control commands remain legal while the track is locked.
 */
export function assertNoLockedTrackContentMutation(
  beforeTracks: readonly Track[],
  afterTracks: readonly Track[],
): void {
  const afterById = new Map(afterTracks.map((track) => [track.id, track]));

  for (const beforeTrack of beforeTracks) {
    if (!beforeTrack.isLocked) continue;

    const afterTrack = afterById.get(beforeTrack.id);
    if (!afterTrack) {
      throw new Error(`Cannot mutate locked track ${beforeTrack.id}: track was removed`);
    }

    if (!valuesEqual(cloneForComparison(beforeTrack), cloneForComparison(afterTrack))) {
      throw new Error(`Cannot mutate locked track ${beforeTrack.id}: clip content is locked`);
    }
  }
}
