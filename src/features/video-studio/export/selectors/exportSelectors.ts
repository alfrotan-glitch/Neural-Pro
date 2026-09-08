import type { ProjectState } from '../../project/types/project';
import type { ExportJob } from '../types/settings';
import { getExportDimensions } from '../../../../core/engine/exportResolution';
import { selectExportableTracks } from '../../project/selectors/projectSelectors';
import type { Track } from '../../project/types/project';
import { getEffectiveClipTimelineDuration } from '../../playback/services/mediaTimeMapper';

export const selectExportDuration = (state: Pick<ProjectState, 'totalDuration'>): number => state.totalDuration;

export const selectExportableTrackIds = (state: Pick<ProjectState, 'tracks'>): string[] =>
  selectExportableTracks(state).map((track) => track.id);

export const selectExportDimensions = (job: ExportJob): { width: number; height: number } =>
  getExportDimensions(job.settings.resolution);

export interface ExportScope {
  tracks: Track[];
  duration: number;
}

export function selectExportScope(
  state: Pick<ProjectState, 'tracks' | 'totalDuration'>,
  clipIds?: readonly string[],
): ExportScope {
  const exportableTracks = selectExportableTracks(state);

  if (!clipIds || clipIds.length === 0) {
    return {
      tracks: structuredClone(exportableTracks),
      duration: Math.max(0, ...exportableTracks.flatMap((track) =>
        track.clips.map((clip) => clip.startAt + getEffectiveClipTimelineDuration(clip)),
      )),
    };
  }

  const selected = new Set(clipIds);
  const selectedClips = exportableTracks.flatMap((track) =>
    track.clips
      .filter((clip) => selected.has(clip.id))
      .map((clip) => ({ clip, track })),
  );

  if (selectedClips.length === 0) {
    return {
      tracks: [],
      duration: 0,
    };
  }

  const origin = Math.min(
    ...selectedClips.map(({ clip }) => clip.startAt),
  );

  const scopedTracks = exportableTracks
    .map((track) => ({
      ...track,
      clips: track.clips
        .filter((clip) => selected.has(clip.id))
        .map((clip) => ({
          ...clip,
          startAt: Math.max(0, clip.startAt - origin),
        })),
    }))
    .filter((track) => track.clips.length > 0);

  const duration = Math.max(
    0,
    ...scopedTracks.flatMap((track) =>
      track.clips.map((clip) => clip.startAt + getEffectiveClipTimelineDuration(clip)),
    ),
  );

  return {
    tracks: scopedTracks,
    duration,
  };
}
