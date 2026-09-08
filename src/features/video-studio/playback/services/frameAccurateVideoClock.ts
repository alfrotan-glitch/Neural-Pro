import type { ClipNode } from '../../project/types/project';
import { sourceTimeToProjectTime } from './mediaTimeMapper';
import { getTransportClock } from './useTransportClock';

interface VideoFrameCallbackMetadataLike {
  mediaTime: number;
  expectedDisplayTime?: number;
  presentedFrames?: number;
}

type RequestVideoFrameCallback = (
  callback: (now: number, metadata: VideoFrameCallbackMetadataLike) => void,
) => number;
type CancelVideoFrameCallback = (handle: number) => void;

function requestFrame(video: HTMLVideoElement, callback: Parameters<RequestVideoFrameCallback>[0]): number | null {
  const candidate = video as HTMLVideoElement & { requestVideoFrameCallback?: RequestVideoFrameCallback };
  return typeof candidate.requestVideoFrameCallback === 'function'
    ? candidate.requestVideoFrameCallback(callback)
    : null;
}

function cancelFrame(video: HTMLVideoElement, handle: number): void {
  const candidate = video as HTMLVideoElement & { cancelVideoFrameCallback?: CancelVideoFrameCallback };
  if (typeof candidate.cancelVideoFrameCallback === 'function') {
    candidate.cancelVideoFrameCallback(handle);
  }
}

export interface FrameAccurateVideoClockOptions {
  correctionThresholdSeconds?: number;
  /** Re-anchor the shared project transport from this media frame. */
  syncTransport?: boolean;
  onFrame?: (projectTime: number, metadata: VideoFrameCallbackMetadataLike) => void;
  sessionId?: string;
  sessionRevision?: number;
  isSessionCurrent?: (sessionId: string, revision: number) => boolean;
}

/**
 * Uses decoded video frames as the presentation-time reference whenever the
 * browser exposes requestVideoFrameCallback. It corrects the shared transport
 * without publishing React state for every decoded frame.
 */
export function attachFrameAccurateVideoClock(
  video: HTMLVideoElement,
  clip: ClipNode,
  isPlaying: boolean,
  options: FrameAccurateVideoClockOptions = {},
): (() => void) | null {
  if (!isPlaying) return null;

  const transport = getTransportClock();
  const correctionThreshold = options.correctionThresholdSeconds ?? 0.02;
  const syncTransport = options.syncTransport ?? true;
  let disposed = false;
  let frameHandle: number | null = null;
  let lastPresentedProjectTime: number | null = null;

  const schedule = () => {
    if (disposed) return;
    const callbackSeekRevision = transport.currentSeekRevision;
    const callbackTransitionRevision = transport.currentTransitionRevision;
    const callbackSessionId = options.sessionId;
    const callbackSessionRevision = options.sessionRevision;
    frameHandle = requestFrame(video, (_now, metadata) => {
      frameHandle = null;
      if (disposed || !Number.isFinite(metadata.mediaTime)) return;
      if (transport.currentSeekRevision !== callbackSeekRevision) return;
      if (transport.currentTransitionRevision !== callbackTransitionRevision) return;
      if (callbackSessionId && callbackSessionRevision !== undefined && options.isSessionCurrent && !options.isSessionCurrent(callbackSessionId, callbackSessionRevision)) return;

      const projectTime = sourceTimeToProjectTime(clip, metadata.mediaTime);
      const direction = transport.playbackDirection;
      const frameTolerance = Math.max(correctionThreshold * 2, 0.05);
      if (lastPresentedProjectTime !== null) {
        const wrongWay = direction < 0
          ? projectTime > lastPresentedProjectTime + frameTolerance
          : projectTime < lastPresentedProjectTime - frameTolerance;
        if (wrongWay) {
          if (!disposed && !video.paused && !video.ended) schedule();
          return;
        }
      }
      lastPresentedProjectTime = projectTime;
      if (syncTransport) {
        transport.syncFromMediaFrame(projectTime, correctionThreshold);
      }
      options.onFrame?.(projectTime, metadata);

      if (!disposed && !video.paused && !video.ended) {
        schedule();
      }
    });
  };

  schedule();

  return () => {
    disposed = true;
    if (frameHandle !== null) {
      cancelFrame(video, frameHandle);
      frameHandle = null;
    }
  };
}
