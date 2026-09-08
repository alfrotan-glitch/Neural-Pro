import type { ClipNode, Track } from '../../project/types/project';
import { normalizeCyberpunkSubscribeProperties } from '../../../../core/engine/cyberpunkSubscribeModel';
import { isTimeInClip } from '../../project/time/intervals';

export function isOverlayTrack(track: Track): boolean {
  return track.type === 'effect' ||
    (track.type as string) === 'sticker' ||
    (track.type as string) === 'element' ||
    track.id.includes('effect') ||
    track.id.includes('sticker') ||
    track.id.includes('overlay') ||
    track.id.includes('element');
}

export function getActiveOverlayClips(
  tracks: readonly Track[],
  time: number,
): ClipNode[] {
  return tracks
    .filter((track) => track.isVisible && (isOverlayTrack(track) || track.clips.some((clip) => clip.sourceId?.startsWith('st_') || clip.sourceId?.startsWith('ef_'))))
    .flatMap((track) => track.clips)
    .filter((clip) => isTimeInClip(time, clip));
}

export function getCyberpunkSubscribeProperties(
  clip: ClipNode,
): ReturnType<typeof normalizeCyberpunkSubscribeProperties> {
  return normalizeCyberpunkSubscribeProperties(clip.properties);
}
