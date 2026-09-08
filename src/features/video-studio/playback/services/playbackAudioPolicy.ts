import type { PlaybackDirection } from './playbackDirection';

export type PlaybackAudioMode = 'normal' | 'muted-reverse';

export interface PlaybackAudioPolicy {
  mode: PlaybackAudioMode;
  muted: boolean;
  shouldPauseMedia: boolean;
}

/**
 * Interactive reverse presentation has no portable sample-accurate reverse
 * audio path. The safe preview policy is therefore to mute reverse playback
 * while keeping forward playback fully audio-enabled.
 */
export function resolvePlaybackAudioPolicy(
  direction: PlaybackDirection,
  isPlaying: boolean,
): PlaybackAudioPolicy {
  const reverse = isPlaying && direction < 0;
  return {
    mode: reverse ? 'muted-reverse' : 'normal',
    muted: reverse,
    shouldPauseMedia: reverse,
  };
}
