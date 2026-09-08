import type { ClipNode, Track } from '../../project/types/project';
import { getActiveOverlayClips } from '../services/overlayService';

export const selectOverlayClips = (tracks: readonly Track[]): ClipNode[] =>
  tracks
    .filter((track) => track.clips.length > 0)
    .flatMap((track) => track.clips);

export const selectActiveOverlayClips = (
  tracks: readonly Track[],
  currentTime: number,
): ClipNode[] => getActiveOverlayClips(tracks, currentTime);
