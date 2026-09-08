import type { ClipNode, Track } from '../../project/types/project';
import { getEffectiveClipEnd } from '../../project/time/clipBounds';
import { resizeSelectedClips } from './timelineResizeService';

export interface SelectionTimeBounds {
  startAt: number;
  endAt: number;
}

export function getSelectionTimeBounds(
  tracks: readonly Track[],
  selectedClipIds: readonly string[],
): SelectionTimeBounds | null {
  const selected = new Set(selectedClipIds);
  let startAt = Number.POSITIVE_INFINITY;
  let endAt = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!selected.has(clip.id)) continue;
      found = true;
      startAt = Math.min(startAt, clip.startAt);
      endAt = Math.max(endAt, getEffectiveClipEnd(clip));
    }
  }

  return found && Number.isFinite(startAt) && Number.isFinite(endAt)
    ? { startAt, endAt }
    : null;
}

export function resolveSharedResizeDelta(
  tracks: readonly Track[],
  selectedClipIds: readonly string[],
  requestedDelta: number,
  side: 'left' | 'right',
  minimumDuration = 0.2,
): number {
  if (!Number.isFinite(requestedDelta) || requestedDelta === 0 || selectedClipIds.length === 0) return 0;

  const ids = [...new Set(selectedClipIds)];
  const isFeasible = (delta: number): boolean => {
    const preview = resizeSelectedClips(tracks, ids, {
      deltaTime: delta,
      side,
      minimumDuration,
    });
    const selected = new Set(ids);
    const epsilon = 1e-8;

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (!selected.has(clip.id)) continue;
        const resized = preview.tracks
          .find((candidate) => candidate.id === track.id)
          ?.clips.find((candidate) => candidate.id === clip.id);
        if (!resized) return false;
        const actualDelta = side === 'right'
          ? resized.duration - clip.duration
          : resized.startAt - clip.startAt;
        if (Math.abs(actualDelta - delta) > epsilon) return false;
      }
    }
    return true;
  };

  if (isFeasible(requestedDelta)) return requestedDelta;

  // Feasible edits contain zero. Find the furthest feasible point in the
  // requested direction so the whole selection moves together and no member
  // is independently clamped by resizeSelectedClips.
  let low = 0;
  let high = requestedDelta;
  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    if (isFeasible(mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return isFeasible(low) ? low : 0;
}
