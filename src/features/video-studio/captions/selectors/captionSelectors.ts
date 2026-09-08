import type { ClipNode, Track } from '../../project/types/project';
import { getCaptionWordsForTime } from '../services/captionService';
import { isTimeInClip } from '../../project/time/intervals';

export const selectCaptionClips = (tracks: readonly Track[]): ClipNode[] =>
  tracks
    .filter((track) => track.isVisible && track.type === 'text')
    .flatMap((track) => track.clips)
    .filter((clip) => clip.properties.textContent !== undefined || clip.properties.words !== undefined);

export const selectActiveCaptionClips = (
  tracks: readonly Track[],
  currentTime: number,
): ClipNode[] =>
  selectCaptionClips(tracks).filter(
    (clip) => isTimeInClip(currentTime, clip),
  );

export { getCaptionWordsForTime };
