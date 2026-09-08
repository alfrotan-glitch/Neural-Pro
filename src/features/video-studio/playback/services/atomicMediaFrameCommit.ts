import type { PlaybackSessionSnapshot } from './playbackSessionController';
import { resolvePresentedFrameBarrier, type PresentedFrameBarrierResult } from './presentedFrameBarrier';

export interface AtomicMediaFrameCommitInput {
  session: PlaybackSessionSnapshot;
  clipIds: readonly string[];
  presentedFrameTimes: Record<string, number>;
  transportTime: number;
  maxFrameSkewSeconds?: number;
  maxTransportLagSeconds?: number;
  fallbackTime?: number;
}

export interface AtomicMediaFrameCommit {
  sessionId: string;
  sessionRevision: number;
  barrierGeneration: number;
  transactionId: string;
  time: number;
  ready: boolean;
  barrier: PresentedFrameBarrierResult;
  epochKey: string;
}

/**
 * Creates the only presentation commit that Preview/Animation may consume.
 * Media presentation, session revision and barrier generation are committed
 * as one immutable epoch key. Consumers can safely reject/retain frames from
 * older epochs without mutating project state.
 */
export function resolveAtomicMediaFrameCommit(
  input: AtomicMediaFrameCommitInput,
): AtomicMediaFrameCommit {
  const barrier = resolvePresentedFrameBarrier({
    clipIds: [...input.clipIds],
    presentedFrameTimes: input.presentedFrameTimes,
    transportTime: input.transportTime,
    maxFrameSkewSeconds: input.maxFrameSkewSeconds,
    maxTransportLagSeconds: input.maxTransportLagSeconds,
    fallbackTime: input.fallbackTime,
  });

  return {
    sessionId: input.session.sessionId,
    sessionRevision: input.session.revision,
    barrierGeneration: input.session.barrierGeneration,
    transactionId: input.session.transactionId,
    time: barrier.time,
    ready: barrier.ready,
    barrier,
    epochKey: [
      input.session.sessionId,
      input.session.revision,
      input.session.barrierGeneration,
      input.session.transactionId,
    ].join(':'),
  };
}

export function isAtomicMediaFrameCommitCurrent(
  commit: AtomicMediaFrameCommit,
  session: PlaybackSessionSnapshot,
): boolean {
  return commit.sessionId === session.sessionId
    && commit.sessionRevision === session.revision
    && commit.barrierGeneration === session.barrierGeneration
    && commit.transactionId === session.transactionId;
}
