import type { ClipNode } from '../../project/types/project';
import { seekMediaElement, type MediaSeekOptions } from '../../../../core/engine/mediaSeek';
import { isClipActiveAt, projectTimeToSourceTime, getClipPlaybackRate, getClipSourceRange } from './mediaTimeMapper';
import type { PlaybackDirection } from './playbackDirection';

export interface MediaSyncOptions extends MediaSeekOptions {
  driftToleranceSeconds?: number;
  /** Transport direction. Reverse media presentation is seek/step based. */
  playbackDirection?: PlaybackDirection;
}

export interface MediaSyncResult {
  sourceTime: number;
  playbackRate: number;
  seeked: boolean;
}

const DEFAULT_DRIFT_TOLERANCE = 0.18;
const DEFAULT_SEEK_TIMEOUT = 15_000;

/**
 * Synchronizes a single HTMLMediaElement with its timeline ClipNode.
 * This is intentionally imperative: it runs at the media boundary and does not
 * mutate React/Zustand state on every playback frame.
 */
export async function syncMediaElementToClip(
  media: HTMLMediaElement,
  clip: ClipNode,
  projectTime: number,
  isPlaying: boolean,
  options: MediaSyncOptions = {},
  signal?: AbortSignal,
): Promise<MediaSyncResult> {
  const sourceTime = projectTimeToSourceTime(clip, projectTime);
  const playbackRate = getClipPlaybackRate(clip);
  const playbackDirection: PlaybackDirection = options.playbackDirection ?? 1;
  const tolerance = options.driftToleranceSeconds ?? DEFAULT_DRIFT_TOLERANCE;

  if (Math.abs(media.playbackRate - playbackRate) > 0.0001) {
    media.playbackRate = playbackRate;
  }
  if (Math.abs(media.defaultPlaybackRate - playbackRate) > 0.0001) {
    media.defaultPlaybackRate = playbackRate;
  }
  media.muted = Boolean(clip.properties.muted);

  if (!isClipActiveAt(clip, projectTime) || clip.properties?.deactivated === true) {
    media.pause();
    return { sourceTime, playbackRate, seeked: false };
  }

  if (signal?.aborted) {
    throw new Error('Media sync cancelled.');
  }

  const { start: sourceStart, end: sourceEnd } = getClipSourceRange(clip);
  const boundedSourceTime = sourceEnd === null
    ? Math.max(sourceStart, sourceTime)
    : Math.min(Math.max(sourceStart, sourceTime), sourceEnd);

  const drift = Math.abs(media.currentTime - boundedSourceTime);
  const reverseMode = isPlaying && playbackDirection < 0;
  const shouldSeek =
    !isPlaying ||
    reverseMode ||
    media.seeking ||
    media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    drift > tolerance;

  if (shouldSeek) {
    await seekMediaElement(
      media,
      boundedSourceTime,
      {
        timeoutMs: options.timeoutMs ?? DEFAULT_SEEK_TIMEOUT,
        toleranceSeconds: options.toleranceSeconds ?? 0.01,
      },
      signal,
    );
  }

  if (signal?.aborted) {
    throw new Error('Media sync cancelled.');
  }

  if (isPlaying && !reverseMode) {
    if (media.paused) {
      if (signal?.aborted) {
        throw new Error('Media sync cancelled.');
      }
      await media.play();
      if (signal?.aborted) {
        media.pause();
        throw new Error('Media sync cancelled.');
      }
    }
  } else if (reverseMode) {
    // Browsers do not provide portable negative playbackRate semantics.
    // Reverse playback is therefore represented as deterministic seek-to-frame
    // stepping while the media element remains paused.
    if (!media.paused) media.pause();
  } else if (!media.paused) {
    media.pause();
  }

  return { sourceTime: boundedSourceTime, playbackRate, seeked: shouldSeek };
}

export function stopAndResetMediaElement(media: HTMLMediaElement): void {
  media.pause();
  try {
    media.currentTime = 0;
  } catch {
    // Media may not be seekable yet; leaving currentTime untouched is safer than throwing.
  }
}
