import type { ClipNode, ProjectState, Track, UUID } from '../types/project';

export const selectAllClips = (state: Pick<ProjectState, 'tracks'>): ClipNode[] =>
  state.tracks.flatMap((track) => track.clips);

export const selectClipById = (
  state: Pick<ProjectState, 'tracks'>,
  clipId: UUID,
): ClipNode | undefined => {
  for (const track of state.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return clip;
  }
  return undefined;
};

export const selectSelectedClips = (
  state: Pick<ProjectState, 'tracks' | 'selectedNodeIds'>,
): ClipNode[] => {
  const selected = new Set(state.selectedNodeIds);
  return selectAllClips(state).filter((clip) => selected.has(clip.id));
};

export const selectActualDuration = (
  state: Pick<ProjectState, 'totalDuration'>,
): number => state.totalDuration;

export const selectExportableTracks = (
  state: Pick<ProjectState, 'tracks'>,
): Track[] =>
  state.tracks.filter((track) => track.clips.length > 0 && track.isVisible);
