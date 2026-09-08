import type { ClipNode, Track } from '../../project/types/project';
import { resolveClipAudioMix, getOfflineAudioSourceDuration } from './audioMixModel';
import { getEffectiveClipTimelineDuration } from '../../playback/services/mediaTimeMapper';
import { loadAudioBuffer } from './audioRenderService';

export interface ProjectAudioRenderOptions {
  tracks: Track[];
  duration: number;
  sampleRate?: number;
  signal?: AbortSignal;
}

export class AudioRenderError extends Error {
  readonly code = 'AUDIO_RENDER_FAILED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AudioRenderError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Audio render aborted.', 'AbortError');
  }
}

function effectiveClipTimelineDuration(clip: ClipNode): number {
  const rate = resolveClipAudioMix(clip, false).playbackRate;
  const sourceDuration = getOfflineAudioSourceDuration(clip);
  return Math.min(getEffectiveClipTimelineDuration(clip), sourceDuration / rate);
}

/**
 * Renders the same per-clip audio model used by Preview into an OfflineAudioContext.
 * The service is intentionally independent of React/Zustand so it can be shared by
 * Export, tests, and future background rendering workers.
 */
export async function renderProjectAudio({
  tracks,
  duration,
  sampleRate = 44100,
  signal,
}: ProjectAudioRenderOptions): Promise<AudioBuffer> {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new AudioRenderError('Cannot render project audio without a positive project duration.');
  }

  throwIfAborted(signal);

  const offlineContext = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(duration * sampleRate)),
    sampleRate,
  );

  const audioClips = tracks.flatMap((track) =>
    track.isVisible !== false
      ? track.clips
          .filter((clip) => clip.properties?.deactivated !== true)
          .filter((clip) => Boolean(clip.properties?.audioUrl || clip.properties?.videoUrl))
          .map((clip) => ({ track, clip }))
      : [],
  );

  const decoded = await Promise.all(
    audioClips.map(async ({ track, clip }) => {
      throwIfAborted(signal);
      const url = clip.properties?.audioUrl || clip.properties?.videoUrl;
      if (!url) return null;
      try {
        const buffer = await loadAudioBuffer(url, offlineContext);
        return { track, clip, buffer };
      } catch (error) {
        throw new AudioRenderError(
          `Failed to decode audio for clip ${clip.id}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
    }),
  );

  throwIfAborted(signal);

  for (const item of decoded) {
    if (!item) continue;
    throwIfAborted(signal);

    const { track, clip, buffer } = item;
    const mix = resolveClipAudioMix(clip, track.isMuted);
    const timelineDuration = effectiveClipTimelineDuration(clip);
    if (timelineDuration <= 0 || mix.muted) continue;

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(mix.playbackRate, 0);

    const gain = offlineContext.createGain();
    const pan = offlineContext.createStereoPanner();
    const baseGain = mix.gain;
    const fadeIn = Math.min(timelineDuration, Number.isFinite(Number(clip.properties?.fadeIn)) ? Math.max(0, Number(clip.properties?.fadeIn)) : 0);
    const fadeOut = Math.min(timelineDuration, Number.isFinite(Number(clip.properties?.fadeOut)) ? Math.max(0, Number(clip.properties?.fadeOut)) : 0);
    const startAt = Math.max(0, clip.startAt);
    const endAt = Math.min(duration, startAt + timelineDuration);

    // Build a monotonic envelope so overlapping fade-in/fade-out cannot introduce
    // a gain jump in the middle of a clip.
    gain.gain.setValueAtTime(0, startAt);
    if (fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(baseGain, Math.min(endAt, startAt + fadeIn));
    } else {
      gain.gain.setValueAtTime(baseGain, startAt);
    }
    if (fadeOut > 0) {
      const fadeOutStart = Math.max(startAt, endAt - fadeOut);
      const overlapAtStart = fadeIn > 0 ? Math.min(1, Math.max(0, (fadeOutStart - startAt) / fadeIn)) : 1;
      gain.gain.setValueAtTime(baseGain * overlapAtStart, fadeOutStart);
      gain.gain.linearRampToValueAtTime(0, endAt);
    }

    pan.pan.setValueAtTime(mix.pan, startAt);

    source.connect(gain);
    gain.connect(pan);
    pan.connect(offlineContext.destination);

    const requestedSourceDuration = Math.max(0, timelineDuration * mix.playbackRate);
    const availableSourceDuration = Math.max(0, buffer.duration - mix.trimIn);
    const sourceDuration = Math.min(requestedSourceDuration, availableSourceDuration);
    if (sourceDuration <= 0 || startAt >= duration) continue;

    try {
      source.start(startAt, mix.trimIn, sourceDuration);
      source.stop(endAt);
    } catch (error) {
      throw new AudioRenderError(
        `Failed to schedule audio for clip ${clip.id}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  throwIfAborted(signal);
  try {
    return await offlineContext.startRendering();
  } catch (error) {
    throw new AudioRenderError(
      `Offline audio rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}
