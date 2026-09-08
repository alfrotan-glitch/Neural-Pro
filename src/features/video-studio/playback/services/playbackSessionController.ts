import type { PlaybackDirection } from './playbackDirection';

export type PlaybackSessionPhase = 'idle' | 'starting' | 'playing' | 'paused' | 'seeking' | 'stopping';

export interface PlaybackSessionSnapshot {
  sessionId: string;
  revision: number;
  transactionId: string;
  phase: PlaybackSessionPhase;
  isPlaying: boolean;
  direction: PlaybackDirection;
  projectTime: number;
  mediaGeneration: number;
  barrierGeneration: number;
  attachedClipIds: readonly string[];
}

export interface PlaybackSessionTransaction {
  phase: PlaybackSessionPhase;
  isPlaying: boolean;
  direction: PlaybackDirection;
  projectTime: number;
  attachedClipIds?: readonly string[];
  mediaReset?: boolean;
  barrierReset?: boolean;
}

/**
 * Atomic master fence for one preview Playback Session.
 *
 * All fields which define playback intent are committed together in one
 * transaction. Media/frame consumers must use the returned transactionId and
 * revision as stale-work fences. This controller never mutates media or
 * project state directly.
 */
export class PlaybackSessionController {
  private sessionCounter = 0;
  private transactionCounter = 0;
  private snapshotValue: PlaybackSessionSnapshot = {
    sessionId: 'playback-session-0',
    revision: 0,
    transactionId: 'playback-tx-0',
    phase: 'idle',
    isPlaying: false,
    direction: 1,
    projectTime: 0,
    mediaGeneration: 0,
    barrierGeneration: 0,
    attachedClipIds: [],
  };

  get snapshot(): PlaybackSessionSnapshot {
    return this.capture();
  }

  begin(isPlaying: boolean, direction: PlaybackDirection, projectTime = this.snapshotValue.projectTime, attachedClipIds?: readonly string[]): PlaybackSessionSnapshot {
    this.sessionCounter += 1;
    return this.commitAtomic({
      phase: isPlaying ? 'starting' : 'paused',
      isPlaying,
      direction,
      projectTime,
      attachedClipIds,
      mediaReset: true,
      barrierReset: true,
    }, `playback-session-${this.sessionCounter}`);
  }

  transition(isPlaying: boolean, direction: PlaybackDirection, projectTime = this.snapshotValue.projectTime): PlaybackSessionSnapshot {
    const phase: PlaybackSessionPhase = isPlaying ? (direction < 0 ? 'playing' : 'playing') : 'paused';
    return this.commitAtomic({
      phase,
      isPlaying,
      direction,
      projectTime,
      mediaReset: true,
      barrierReset: true,
    });
  }

  seek(projectTime: number): PlaybackSessionSnapshot {
    return this.commitAtomic({
      phase: 'seeking',
      isPlaying: false,
      direction: this.snapshotValue.direction,
      projectTime,
      mediaReset: true,
      barrierReset: true,
    });
  }

  stop(projectTime = this.snapshotValue.projectTime): PlaybackSessionSnapshot {
    return this.commitAtomic({
      phase: 'stopping',
      isPlaying: false,
      direction: this.snapshotValue.direction,
      projectTime,
      mediaReset: true,
      barrierReset: true,
    });
  }

  invalidate(): PlaybackSessionSnapshot {
    return this.commitAtomic({
      phase: 'paused',
      isPlaying: false,
      direction: this.snapshotValue.direction,
      projectTime: this.snapshotValue.projectTime,
      mediaReset: true,
      barrierReset: true,
    });
  }

  syncMediaAttachments(clipIds: readonly string[]): PlaybackSessionSnapshot {
    const normalized = Array.from(new Set(clipIds.filter(Boolean)));
    const current = this.snapshotValue.attachedClipIds;
    const same = normalized.length === current.length && normalized.every((id, index) => id === current[index]);
    if (same) return this.capture();
    return this.commitAtomic({
      phase: this.snapshotValue.phase,
      isPlaying: this.snapshotValue.isPlaying,
      direction: this.snapshotValue.direction,
      projectTime: this.snapshotValue.projectTime,
      attachedClipIds: normalized,
      mediaReset: true,
      barrierReset: true,
    });
  }

  attachMedia(clipId: string): PlaybackSessionSnapshot {
    if (!clipId || this.snapshotValue.attachedClipIds.includes(clipId)) return this.capture();
    return this.commitAtomic({
      phase: this.snapshotValue.phase === 'idle' ? 'starting' : this.snapshotValue.phase,
      isPlaying: this.snapshotValue.isPlaying,
      direction: this.snapshotValue.direction,
      projectTime: this.snapshotValue.projectTime,
      attachedClipIds: [...this.snapshotValue.attachedClipIds, clipId],
      mediaReset: true,
    });
  }

  detachMedia(clipId: string): PlaybackSessionSnapshot {
    if (!this.snapshotValue.attachedClipIds.includes(clipId)) return this.capture();
    return this.commitAtomic({
      phase: this.snapshotValue.phase,
      isPlaying: this.snapshotValue.isPlaying,
      direction: this.snapshotValue.direction,
      projectTime: this.snapshotValue.projectTime,
      attachedClipIds: this.snapshotValue.attachedClipIds.filter(id => id !== clipId),
      mediaReset: true,
      barrierReset: true,
    });
  }

  commitAtomic(transaction: PlaybackSessionTransaction, sessionIdOverride?: string): PlaybackSessionSnapshot {
    if (!Number.isFinite(transaction.projectTime) || transaction.projectTime < 0) {
      throw new RangeError('Playback session projectTime must be finite and non-negative.');
    }

    const sessionId = sessionIdOverride ?? this.snapshotValue.sessionId;
    const direction: PlaybackDirection = transaction.direction < 0 ? -1 : 1;
    const transactionId = `playback-tx-${++this.transactionCounter}`;
    const attachedClipIds = Array.from(new Set((transaction.attachedClipIds ?? this.snapshotValue.attachedClipIds).filter(Boolean)));

    this.snapshotValue = {
      sessionId,
      revision: this.snapshotValue.revision + 1,
      transactionId,
      phase: transaction.phase,
      isPlaying: transaction.isPlaying,
      direction,
      projectTime: transaction.projectTime,
      mediaGeneration: this.snapshotValue.mediaGeneration + (transaction.mediaReset ? 1 : 0),
      barrierGeneration: this.snapshotValue.barrierGeneration + (transaction.barrierReset ? 1 : 0),
      attachedClipIds,
    };
    return this.capture();
  }

  capture(): PlaybackSessionSnapshot {
    return {
      ...this.snapshotValue,
      attachedClipIds: [...this.snapshotValue.attachedClipIds],
    };
  }

  isCurrent(sessionId: string, revision: number, transactionId?: string): boolean {
    return this.snapshotValue.sessionId === sessionId
      && this.snapshotValue.revision === revision
      && (transactionId === undefined || this.snapshotValue.transactionId === transactionId);
  }
}

export function createPlaybackSessionController(): PlaybackSessionController {
  return new PlaybackSessionController();
}
