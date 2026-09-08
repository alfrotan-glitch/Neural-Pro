import type { ClipNode, Track, TimelineTrackLaneRole } from '../../project/types/project';

export interface CrossTrackDropResult {
  tracks: Track[];
  trackId: string;
  created: boolean;
}

function laneRoleOf(track: Track): TimelineTrackLaneRole | string {
  return track.laneRole ?? track.type;
}

/**
 * Resolves a single-clip cross-track move transaction.
 *
 * Rules:
 * - same semantic lane role is required for direct reuse of the destination;
 * - a locked destination rejects the transaction;
 * - a compatible destination track is used directly (no silent extra track);
 * - an incompatible destination is reported as null so the caller can decide
 *   whether a dedicated semantic lane must be materialized.
 */
export function placeSingleClipOnCrossTrackDrop(
  tracks: readonly Track[],
  clipId: string,
  sourceTrackId: string,
  requestedTrackId: string,
): CrossTrackDropResult | null {
  if (sourceTrackId === requestedTrackId) return null;

  const requestedTrack = tracks.find((track) => track.id === requestedTrackId);
  if (!requestedTrack || requestedTrack.isLocked) return null;

  // Locate clip across tracks if it was already moved in draft
  let clip: ClipNode | undefined;
  for (const t of tracks) {
    const found = t.clips.find((candidate) => candidate.id === clipId);
    if (found) {
      clip = found;
      break;
    }
  }
  if (!clip) return null;

  const sourceTrack = tracks.find((track) => track.id === sourceTrackId) ?? tracks.find((track) => track.clips.some((c) => c.id === clipId));
  if (!sourceTrack) return null;

  const isCompatible = (sourceTrack.laneRole ?? sourceTrack.type) === (requestedTrack.laneRole ?? requestedTrack.type) || sourceTrack.type === requestedTrack.type;
  if (!isCompatible) return null;

  const nextTracks = tracks.map((track) => {
    const remainingClips = track.clips.filter((candidate) => candidate.id !== clipId).map((c) => structuredClone(c));
    if (track.id === requestedTrackId) {
      return { ...track, clips: [...remainingClips, structuredClone(clip!)] };
    }
    return { ...track, clips: remainingClips };
  });

  return { tracks: nextTracks, trackId: requestedTrackId, created: false };
}
