import type { PlaybackDirection } from './playbackDirection';

export type PlaybackIntentMode = 'paused' | 'forward' | 'reverse' | 'seeking';

export interface PlaybackIntentSnapshot {
  mode: PlaybackIntentMode;
  direction: PlaybackDirection;
  revision: number;
}

/**
 * Owns semantic playback transitions. Every explicit intent that can invalidate
 * asynchronous media/frame work increments the revision. Consumers use the
 * captured revision as a stale-work fence; this class never mutates media or
 * project state.
 */
export class PlaybackTransitionStateMachine {
  private snapshotValue: PlaybackIntentSnapshot = {
    mode: 'paused',
    direction: 1,
    revision: 0,
  };

  get snapshot(): PlaybackIntentSnapshot {
    return this.snapshotValue;
  }

  get revision(): number {
    return this.snapshotValue.revision;
  }

  transition(mode: PlaybackIntentMode, direction: PlaybackDirection = this.snapshotValue.direction): number {
    const normalizedDirection: PlaybackDirection = direction < 0 ? -1 : 1;
    this.snapshotValue = {
      mode,
      direction: normalizedDirection,
      revision: this.snapshotValue.revision + 1,
    };
    return this.snapshotValue.revision;
  }

  playForward(): number {
    return this.transition('forward', 1);
  }

  playReverse(): number {
    return this.transition('reverse', -1);
  }

  pause(): number {
    return this.transition('paused');
  }

  seek(): number {
    return this.transition('seeking');
  }

  isCurrent(revision: number): boolean {
    return revision === this.snapshotValue.revision;
  }
}

export function createPlaybackTransitionStateMachine(): PlaybackTransitionStateMachine {
  return new PlaybackTransitionStateMachine();
}
