import type { Track } from '../../features/video-studio/project/types/project';
import { getCanonicalClipTimelineDuration } from './clipTimelineDuration';

/**
 * Single source of truth for project duration.
 * Duration is the furthest EFFECTIVE timeline endpoint across every clip.
 *
 * The effective duration is bounded by the clip's source trim range and
 * playback rate, so project duration can never extend beyond media that the
 * Preview/Playback/Audio/Export paths are actually able to represent.
 */
export function calculateProjectDuration(tracks: readonly Track[]): number {
  let duration = 0;

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) {
        continue;
      }

      const effectiveDuration = getCanonicalClipTimelineDuration(clip);
      duration = Math.max(0, Math.max(duration, clip.startAt + effectiveDuration));
    }
  }

  return duration;
}

export function clampProjectTime(
  time: number,
  duration: number,
): number {
  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.min(Math.max(0, time), Math.max(0, duration));
}
