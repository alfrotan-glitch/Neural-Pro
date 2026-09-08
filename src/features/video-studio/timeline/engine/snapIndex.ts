import type { Track } from '../../project/types/project';
import { getEffectiveClipEnd } from '../../project/time/clipBounds';

export interface SnapCandidate {
  time: number;
  kind: 'timeline-start' | 'playhead' | 'clip-start' | 'clip-end';
  sourceId?: string;
}

export interface SnapMatch {
  time: number;
  distance: number;
  candidate: SnapCandidate;
}

export interface TimelineSnapIndex {
  candidates: readonly SnapCandidate[];
  nearest(targetTime: number, thresholdSeconds: number): SnapMatch | null;
}

function lowerBound(candidates: readonly SnapCandidate[], time: number): number {
  let lo = 0;
  let hi = candidates.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const candidate = candidates[mid];
    if (!candidate) break;
    if (candidate.time < time) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

export function createTimelineSnapIndex(
  tracks: readonly Track[],
  excludedClipIds: ReadonlySet<string>,
  currentTime: number,
): TimelineSnapIndex {
  const candidates: SnapCandidate[] = [
    { time: 0, kind: 'timeline-start' },
    { time: Math.max(0, currentTime), kind: 'playhead' },
  ];

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (excludedClipIds.has(clip.id)) continue;

      candidates.push({
        time: Math.max(0, clip.startAt),
        kind: 'clip-start',
        sourceId: clip.id,
      });

      candidates.push({
        time: Math.max(0, getEffectiveClipEnd(clip)),
        kind: 'clip-end',
        sourceId: clip.id,
      });
    }
  }

  candidates.sort((a, b) => a.time - b.time);

  const deduplicated: SnapCandidate[] = [];
  for (const candidate of candidates) {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && Math.abs(previous.time - candidate.time) < Number.EPSILON) {
      if (previous.kind === 'playhead' && candidate.kind !== 'playhead') {
        deduplicated[deduplicated.length - 1] = candidate;
      }
      continue;
    }
    deduplicated.push(candidate);
  }

  return {
    candidates: deduplicated,
    nearest(targetTime, thresholdSeconds) {
      if (deduplicated.length === 0 || thresholdSeconds < 0) return null;

      const index = lowerBound(deduplicated, targetTime);
      let best: SnapMatch | null = null;

      const consider = (candidate?: SnapCandidate) => {
        if (!candidate) return;
        const distance = Math.abs(candidate.time - targetTime);
        if (distance > thresholdSeconds) return;
        if (!best || distance < best.distance) {
          best = { time: candidate.time, distance, candidate };
        }
      };

      consider(deduplicated[index]);
      consider(deduplicated[index - 1]);

      return best;
    },
  };
}
