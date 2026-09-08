import type { ProjectState } from '../../project/types/project';
import { selectAllClips } from '../../project/selectors/projectSelectors';
import { isTimeInClip } from '../../project/time/intervals';

export const selectCurrentTime = (state: Pick<ProjectState, 'currentTime'>): number => state.currentTime;
export const selectIsPlaying = (state: Pick<ProjectState, 'isPlaying'>): boolean => state.isPlaying;
export const selectPlaybackProgress = (
  state: Pick<ProjectState, 'currentTime' | 'totalDuration'>,
): number => state.totalDuration > 0 ? Math.min(1, Math.max(0, state.currentTime / state.totalDuration)) : 0;

export const selectActiveClipIds = (
  state: Pick<ProjectState, 'tracks'>,
  time: number,
): string[] =>
  selectAllClips(state)
    .filter((clip) => isTimeInClip(time, clip))
    .map((clip) => clip.id);
