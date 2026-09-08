import type { ClipNode, Track } from '../../project/types/project';
import { getEffectiveClipTimelineDuration } from '../services/mediaTimeMapper';

export type PreviewLayerRole = 'background' | 'video' | 'overlay' | 'text' | 'audio-visual';

const ROLE_BASE_Z: Record<PreviewLayerRole, number> = {
  background: 0,
  video: 100,
  'audio-visual': 200,
  overlay: 300,
  text: 400,
};

export interface OrderedClip {
  clip: ClipNode;
  track: Track;
  trackIndex: number;
  clipIndex: number;
  role: PreviewLayerRole;
}

export function isClipActiveAtTime(clip: ClipNode, time: number): boolean {
  if (!Number.isFinite(time) || !Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) {
    return false;
  }

  if (clip.properties?.deactivated === true) return false;

  const end = clip.startAt + getEffectiveClipTimelineDuration(clip);
  return time >= clip.startAt && time < end;
}

export function getTrackLayerRole(track: Track): PreviewLayerRole {
  // Legacy projects may encode visual overlay/effect semantics in the track id
  // even when the persisted track type is still `video` or `text`. Resolve that
  // compatibility rule once here so Preview and Export cannot disagree.
  const legacyOverlayId = /(?:effect|sticker|overlay|element)/i.test(track.id);
  if (track.type === 'effect' || legacyOverlayId) return 'overlay';

  switch (track.type) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio-visual';
    case 'text':
      return 'text';
    default:
      return 'overlay';
  }
}

export function buildOrderedActiveClips(
  tracks: readonly Track[],
  time: number,
  predicate?: (track: Track) => boolean,
): OrderedClip[] {
  const result: OrderedClip[] = [];

  tracks.forEach((track, trackIndex) => {
    if (!track.isVisible || predicate && !predicate(track)) return;

    track.clips.forEach((clip, clipIndex) => {
      if (isClipActiveAtTime(clip, time)) {
        result.push({
          clip,
          track,
          trackIndex,
          clipIndex,
          role: getTrackLayerRole(track),
        });
      }
    });
  });

  return result.sort((a, b) => {
    const roleDelta = ROLE_BASE_Z[a.role] - ROLE_BASE_Z[b.role];
    if (roleDelta !== 0) return roleDelta;
    if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
    return a.clipIndex - b.clipIndex;
  });
}

export function getPreviewLayerZIndex(role: PreviewLayerRole, trackIndex: number, clipIndex: number): number {
  return ROLE_BASE_Z[role] + trackIndex * 0.01 + clipIndex * 0.0001;
}

export function getExportLayerZIndex(role: PreviewLayerRole, trackIndex: number, clipIndex: number): number {
  return getPreviewLayerZIndex(role, trackIndex, clipIndex);
}
