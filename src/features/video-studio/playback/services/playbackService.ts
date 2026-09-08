import type { ClipNode, Track } from '../../project/types/project';
import { selectActiveClipIds } from '../selectors/playbackSelectors';
import { seekMediaElement } from '../../../../core/engine/mediaSeek';
import { isClipActiveAt, projectTimeToSourceTime } from './mediaTimeMapper';

export function getActiveVideoClips(
  tracks: readonly Track[],
  time: number,
): ClipNode[] {
  const activeIds = new Set(
    tracks
      .filter((track) => track.isVisible && track.type === 'video')
      .flatMap((track) => track.clips)
      .filter(
        (clip) =>
          Boolean(clip.properties.videoUrl) &&
          clip.properties?.deactivated !== true &&
          isClipActiveAt(clip, time),
      )
      .map((clip) => clip.id),
  );

  return tracks
    .filter((track) => track.isVisible && track.type === 'video')
    .flatMap((track) => track.clips)
    .filter((clip) => activeIds.has(clip.id));
}

export async function seekActiveVideoClips(
  tracks: readonly Track[],
  time: number,
  mediaByClipId: ReadonlyMap<string, HTMLVideoElement>,
  signal?: AbortSignal,
): Promise<void> {
  const activeClips = getActiveVideoClips(tracks, time);

  await Promise.all(
    activeClips.map(async (clip) => {
      const media = mediaByClipId.get(clip.id);
      if (!media) {
        throw new Error(`Missing registered media element for clip ${clip.id}.`);
      }

      const clipMediaTime = projectTimeToSourceTime(clip, time);

      await seekMediaElement(
        media,
        clipMediaTime,
        { timeoutMs: 15_000, toleranceSeconds: 0.001 },
        signal,
      );
    }),
  );
}


export function getActiveVideoClipSourceTimes(
  tracks: readonly Track[],
  time: number,
): ReadonlyMap<string, number> {
  return new Map(
    getActiveVideoClips(tracks, time).map((clip) => [clip.id, projectTimeToSourceTime(clip, time)]),
  );
}

export const selectActivePlaybackClipIds = selectActiveClipIds;
