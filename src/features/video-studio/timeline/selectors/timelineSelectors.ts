import type { ClipNode, ProjectState, Track, UUID } from '../../project/types/project';
import { selectAllClips, selectSelectedClips } from '../../project/selectors/projectSelectors';
import { isTimeInClip } from '../../project/time/intervals';

export const selectTimelineTracks = (
  state: Pick<ProjectState, 'tracks'>,
): Track[] => state.tracks;

export const selectTimelineClips = (
  state: Pick<ProjectState, 'tracks'>,
): ClipNode[] => selectAllClips(state);

export const selectSelectedTimelineClips = (
  state: Pick<ProjectState, 'tracks' | 'selectedNodeIds'>,
): ClipNode[] => selectSelectedClips(state);

export const selectSelectedClipIds = (
  state: Pick<ProjectState, 'selectedNodeIds'>,
): UUID[] => state.selectedNodeIds;

export const selectLockedTrackIds = (
  state: Pick<ProjectState, 'tracks'>,
): Set<UUID> => {
  const locked = new Set<UUID>();
  for (const track of state.tracks) {
    if (track.isLocked) locked.add(track.id);
  }
  return locked;
};

export const selectTimelineClipAtTime = (
  state: Pick<ProjectState, 'tracks'>,
  time: number,
): ClipNode | undefined =>
  selectTimelineClips(state).find(
    (clip) => isTimeInClip(time, clip),
  );
