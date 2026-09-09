import type { ClipNode, ProjectState, Track, TimelineTrackLaneRole } from '../types/project';
import { selectAllClips, selectClipById } from '../selectors/projectSelectors';
import { calculateProjectDuration, clampProjectTime } from '../../../../core/engine/projectDuration';
import { generateUUID } from '../../../../lib/uuid';
import { assertValidTimelineTracks } from '../validation';

export interface ProjectAssetInput {
  id: string;
  type?: string;
  name?: string;
  color?: string;
  thumbnail?: string;
  duration?: number;
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  /** Durable asset identity (ADR-006). Survives reload; the URLs above do not. */
  videoAssetId?: string;
  audioAssetId?: string;
  imageAssetId?: string;
  textContent?: string;
  words?: unknown;
}

export function getAllClips(tracks: Track[]): ClipNode[] {
  return selectAllClips({ tracks });
}

export function getClipById(
  tracks: Track[],
  clipId: string,
): ClipNode | undefined {
  return selectClipById({ tracks }, clipId);
}

export function getActualDuration(
  tracks: Track[],
): number {
  return calculateProjectDuration(tracks);
}

export function normalizeCurrentTime(
  state: Pick<ProjectState, 'tracks' | 'currentTime'>,
): number {
  return clampProjectTime(
    state.currentTime,
    calculateProjectDuration(state.tracks),
  );
}

export function resolveAssetLaneRole(asset: ProjectAssetInput): TimelineTrackLaneRole {
  const declaredType = String(asset.type ?? '').toLowerCase();
  if (declaredType === 'audio') return 'audio';
  if (declaredType === 'caption') return 'caption';
  if (declaredType === 'text') return 'text';
  if (declaredType === 'sticker') return 'sticker';
  if (declaredType === 'effects') return 'effect';
  if (declaredType === 'transitions') return 'transition';
  if (declaredType === 'filters') return 'filter';
  if (declaredType === 'adjustments') return 'adjustment';
  if (declaredType === 'overlay') return 'overlay';
  if (declaredType === 'subscribe') return 'subscribe';
  if (declaredType === 'element') return 'element';
  if (declaredType === 'image' || Boolean(asset.imageUrl && !asset.videoUrl)) return 'image';
  return 'video';
}

function resolveTrackTypeForLaneRole(role: TimelineTrackLaneRole): Track['type'] {
  switch (role) {
    case 'audio': return 'audio';
    case 'caption':
    case 'text': return 'text';
    case 'sticker':
    case 'overlay':
    case 'subscribe':
    case 'effect':
    case 'transition':
    case 'filter':
    case 'adjustment':
    case 'element': return 'effect';
    case 'image':
    case 'video':
    default: return 'video';
  }
}

export function nextDedicatedTrackName(tracks: readonly Track[], role: TimelineTrackLaneRole): string {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  const count = tracks.filter((track) => (track.laneRole ?? track.type) === role).length + 1;
  return `${label} ${count}`;
}

/**
 * Prunes empty secondary / auxiliary tracks from the timeline to keep the workspace clean.
 * Preserves at least 1 base video track and 1 base audio track so the timeline structure remains intact.
 */
export function pruneEmptyTracks(tracks: readonly Track[]): Track[] {
  let keptVideoCount = 0;
  let keptAudioCount = 0;

  return tracks.filter((track) => {
    // If the track has clips, ALWAYS keep it
    if (track.clips && track.clips.length > 0) {
      if (track.type === 'video') keptVideoCount++;
      if (track.type === 'audio') keptAudioCount++;
      return true;
    }

    // Keep the primary base video track even if empty
    if (track.type === 'video' && keptVideoCount === 0) {
      keptVideoCount++;
      return true;
    }

    // Keep the primary base audio track even if empty
    if (track.type === 'audio' && keptAudioCount === 0) {
      keptAudioCount++;
      return true;
    }

    // Auxiliary empty tracks (extra video/audio tracks, empty text/effect tracks) are cleaned up
    return false;
  });
}

export function createDedicatedTimelineTrack(
  tracks: readonly Track[],
  role: TimelineTrackLaneRole,
  clip: ClipNode,
): Track[] {
  const trackType = resolveTrackTypeForLaneRole(role);
  const newTrack: Track = {
    id: generateUUID(),
    type: trackType,
    laneRole: role,
    name: nextDedicatedTrackName(tracks, role),
    isLocked: false,
    isMuted: false,
    isVisible: true,
    clips: [clip],
  };

  const nextTracks = [...tracks];
  const lastSameRole = nextTracks.reduce((last, track, index) => (
    (track.laneRole ?? track.type) === role ? index : last
  ), -1);

  nextTracks.splice(lastSameRole >= 0 ? lastSameRole + 1 : nextTracks.length, 0, newTrack);
  return nextTracks;
}

/**
 * Inserts a clip into an existing compatible track if no time collision exists at [clip.startAt, clip.startAt + clip.duration].
 * Only creates a new track if all compatible tracks are occupied/overlapping at that time range.
 */
export function smartInsertClip(
  tracks: readonly Track[],
  role: TimelineTrackLaneRole,
  clip: ClipNode,
): { tracks: Track[]; trackId: string; createdNewTrack: boolean } {
  const trackType = resolveTrackTypeForLaneRole(role);
  const clipStart = clip.startAt;
  const clipEnd = clip.startAt + clip.duration;

  // Find candidate compatible unlocked tracks
  const candidateTracks = tracks.filter((track) => {
    if (track.isLocked) return false;
    if (track.type !== trackType) return false;

    // Track type is intentionally broader than semantic lane role for effect/video
    // families. Never place (for example) a Subscribe clip onto an Overlay lane just
    // because both are backed by the generic `effect` track type. Legacy tracks without
    // a laneRole fall back to their concrete track type.
    const trackRole = track.laneRole ?? track.type;
    return trackRole === role;
  });

  // Check each candidate track for time collisions
  for (const candidate of candidateTracks) {
    const hasCollision = candidate.clips.some((c) => {
      const existingEnd = c.startAt + c.duration;
      return Math.max(c.startAt, clipStart) < Math.min(existingEnd, clipEnd) - 0.001;
    });

    if (!hasCollision) {
      // Place the clip into this existing track!
      const updatedTracks = tracks.map((track) => {
        if (track.id === candidate.id) {
          const newClips = [...track.clips, structuredClone(clip)].sort((a, b) => a.startAt - b.startAt);
          return {
            ...track,
            clips: newClips,
          };
        }
        return track;
      });

      return {
        tracks: updatedTracks,
        trackId: candidate.id,
        createdNewTrack: false,
      };
    }
  }

  // All compatible tracks had collisions or no compatible track exists.
  // Create a new dedicated track.
  const nextTracks = createDedicatedTimelineTrack(tracks, role, clip);
  const newTrack = nextTracks.find((t) => t.clips.some((c) => c.id === clip.id));

  return {
    tracks: nextTracks,
    trackId: newTrack?.id || generateUUID(),
    createdNewTrack: true,
  };
}

export function addAssetToTracks(
  tracks: Track[],
  asset: ProjectAssetInput,
  currentTime: number,
  cyberpunkDefaults: Record<string, unknown> = {},
): { tracks: Track[]; clipId: string; trackId: string; laneRole: TimelineTrackLaneRole } {
  const clipId = generateUUID();
  const laneRole = resolveAssetLaneRole(asset);
  const duration = Number.isFinite(asset.duration) && Number(asset.duration) > 0 ? Number(asset.duration) : 5;
  const isCaption = laneRole === 'caption';
  const properties: Record<string, unknown> = {
    name: asset.name,
    color: asset.color,
    thumbnail: asset.thumbnail,
    ...(asset.videoUrl ? { videoUrl: asset.videoUrl } : {}),
    ...(asset.audioUrl ? { audioUrl: asset.audioUrl } : {}),
    ...(asset.imageUrl ? { imageUrl: asset.imageUrl } : {}),
    ...(asset.videoAssetId ? { videoAssetId: asset.videoAssetId } : {}),
    ...(asset.audioAssetId ? { audioAssetId: asset.audioAssetId } : {}),
    ...(asset.imageAssetId ? { imageAssetId: asset.imageAssetId } : {}),
    ...(asset.textContent ? { textContent: asset.textContent } : {}),
    ...(asset.words ? { words: asset.words } : {}),
    timelineLaneRole: laneRole,
    ...(asset.videoUrl || asset.audioUrl || asset.videoAssetId || asset.audioAssetId || laneRole === 'audio'
      ? { sourceMediaDuration: duration }
      : {}),
    ...(laneRole === 'subscribe' || asset.id === 'st_cyber_sub' || asset.id === 'ef_cyber_sub'
      ? cyberpunkDefaults
      : {}),
  };

  const newClip: ClipNode = {
    id: clipId,
    sourceId: asset.id,
    startAt: Math.max(0, currentTime),
    duration,
    trim: { in: 0, out: duration },
    transform: isCaption
      ? { x: 0, y: 65, scale: 110, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100 }
      : { x: 0, y: 0, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100 },
    properties,
  };

  // Smart placement: Use existing compatible track if no collision, otherwise create new track
  const { tracks: nextTracks, trackId } = smartInsertClip(tracks, laneRole, newClip);
  assertValidTimelineTracks(nextTracks);

  return { clipId, trackId, laneRole, tracks: nextTracks };
}

