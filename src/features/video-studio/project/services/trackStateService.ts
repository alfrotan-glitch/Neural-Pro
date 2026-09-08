import type { Track } from '../types/project';

export interface TrackStateCache {
  visible: boolean;
  locked: boolean;
  muted: boolean;
  collapsed?: boolean;
}

export function deriveTrackStates(tracks: readonly Track[]): Record<string, TrackStateCache> {
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      {
        visible: track.isVisible !== false,
        locked: track.isLocked === true,
        muted: track.isMuted === true,
        collapsed: track.isCollapsed === true,
      },
    ]),
  );
}
