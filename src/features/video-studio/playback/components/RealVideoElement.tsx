import React, { useCallback, useEffect, useRef } from 'react';
import type { ClipNode } from '../../project/types/project';
import { getAudioMixController } from '../audio';
import { resolveClipAudioMix } from '../../audio/services/audioMixModel';
import { createMediaHealthController, type MediaHealthSnapshot } from '../services/mediaHealthController';
import { stopAndResetMediaElement } from '../services/mediaSyncController';
import { createMediaSyncSession, type MediaSyncSession } from '../services/multiMediaSyncController';
import { attachFrameAccurateVideoClock } from '../services/frameAccurateVideoClock';
import { getTransportClock } from '../services/useTransportClock';
import type { PlaybackDirection } from '../services/playbackDirection';
import { resolvePlaybackAudioPolicy } from '../services/playbackAudioPolicy';

export interface RealVideoElementProps {
  videoUrl: string;
  activeTime: number;
  clipStartAt: number;
  clipTrimIn: number;
  clipTrimOut: number;
  clipDuration: number;
  playbackSpeed: number;
  clipMuted: boolean;
  trackMuted: boolean;
  levelDb: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
  isPlaying: boolean;
  playbackDirection?: PlaybackDirection;
  playbackFps?: number;
  isMuted: boolean;
  isExporting?: boolean;
  clipId: string;
  reloadToken?: number;
  onHealthChange?: (clipId: string, snapshot: MediaHealthSnapshot) => void;
  onVideoElementReady?: (clipId: string, element: HTMLVideoElement | null) => void;
  onPresentedFrame?: (clipId: string, projectTime: number, sessionId?: string, sessionRevision?: number) => void;
  playbackSessionId?: string;
  playbackSessionRevision?: number;
  isPlaybackSessionCurrent?: (sessionId: string, revision: number) => boolean;
}

export const RealVideoElement: React.FC<RealVideoElementProps> = ({
  videoUrl,
  activeTime,
  clipStartAt,
  clipTrimIn,
  clipTrimOut,
  clipDuration,
  playbackSpeed,
  clipMuted,
  trackMuted,
  levelDb,
  pan,
  fadeIn,
  fadeOut,
  isPlaying,
  playbackDirection = 1,
  playbackFps = 30,
  isMuted,
  isExporting = false,
  clipId,
  reloadToken = 0,
  onHealthChange,
  onVideoElementReady,
  onPresentedFrame,
  playbackSessionId,
  playbackSessionRevision,
  isPlaybackSessionCurrent,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const setVideoElement = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    onVideoElementReady?.(clipId, element);
  }, [clipId, onVideoElementReady]);
  const syncSessionRef = useRef<MediaSyncSession | null>(null);
  const healthControllerRef = useRef<ReturnType<typeof createMediaHealthController> | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const audioMix = getAudioMixController();
    audioMix.registerMediaElement(video, { muted: true });
    return () => audioMix.unregisterMediaElement(video);
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isExporting) return;

    video.pause();
    syncSessionRef.current?.dispose();
    syncSessionRef.current = null;
  }, [isExporting]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isExporting) return;
    const clipForMix: ClipNode = {
      id: clipId,
      sourceId: clipId,
      startAt: clipStartAt,
      duration: clipDuration,
      trim: { in: clipTrimIn, out: clipTrimOut },
      transform: { x: 0, y: 0, scale: 100, rotation: 0 },
      properties: { speed: playbackSpeed, muted: clipMuted, levelDb, pan, fadeIn, fadeOut },
    };
    const mix = resolveClipAudioMix(clipForMix, trackMuted, activeTime);
    const playbackAudioPolicy = resolvePlaybackAudioPolicy(playbackDirection, isPlaying);
    getAudioMixController().updateMediaElement(video, {
      muted: mix.muted || isMuted || playbackAudioPolicy.muted,
      levelDb: mix.levelDb,
      pan: mix.pan,
      fadeGain: mix.fadeGain,
    });
  }, [activeTime, clipId, clipDuration, clipMuted, clipStartAt, clipTrimIn, clipTrimOut, playbackSpeed, trackMuted, levelDb, pan, fadeIn, fadeOut, isPlaying, playbackDirection, isExporting, isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isExporting || !isPlaying) return;

    const clip: ClipNode = {
      id: clipId,
      sourceId: clipId,
      startAt: clipStartAt,
      duration: clipDuration,
      trim: { in: clipTrimIn, out: clipTrimOut },
      transform: { x: 0, y: 0, scale: 100, rotation: 0 },
      properties: { speed: playbackSpeed },
    };

    return attachFrameAccurateVideoClock(video, clip, true, {
      syncTransport: false,
      onFrame: (projectTime) => onPresentedFrame?.(clipId, projectTime, playbackSessionId, playbackSessionRevision),
      sessionId: playbackSessionId,
      sessionRevision: playbackSessionRevision,
      isSessionCurrent: isPlaybackSessionCurrent,
    }) ?? undefined;
  }, [clipId, clipDuration, clipStartAt, clipTrimIn, clipTrimOut, playbackSpeed, isExporting, isPlaying, onPresentedFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isExporting) return;
    const clip: ClipNode = {
      id: clipId,
      sourceId: clipId,
      startAt: clipStartAt,
      duration: clipDuration,
      trim: { in: clipTrimIn, out: clipTrimOut },
      transform: { x: 0, y: 0, scale: 100, rotation: 0 },
      properties: { speed: playbackSpeed, muted: clipMuted },
    };
    const session = syncSessionRef.current ?? createMediaSyncSession(video);
    syncSessionRef.current = session;
    session.update({ clip, projectTime: activeTime, isPlaying, playbackDirection, playbackFps, playbackSessionId, playbackSessionRevision });
  }, [activeTime, clipId, clipDuration, clipMuted, clipStartAt, clipTrimIn, clipTrimOut, isExporting, isPlaying, playbackSpeed, playbackDirection, playbackSessionId, playbackSessionRevision]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isExporting) return;
    const controller = createMediaHealthController(video, {
      onChange: snapshot => onHealthChange?.(clipId, snapshot),
    });
    healthControllerRef.current = controller;
    controller.attach();
    return () => {
      controller.detach();
      healthControllerRef.current = null;
      onHealthChange?.(clipId, { status: 'idle', retryCount: 0 });
    };
  }, [clipId, isExporting, onHealthChange]);

  useEffect(() => {
    if (reloadToken > 0) {
      healthControllerRef.current?.retry();
      syncSessionRef.current?.forceSync();
    }
  }, [reloadToken]);

  useEffect(() => () => {
    const video = videoRef.current;
    if (video) stopAndResetMediaElement(video);
    syncSessionRef.current?.dispose();
    syncSessionRef.current = null;
  }, []);

  return (
    <video
      ref={setVideoElement}
      data-export-media-clip-id={clipId}
      src={videoUrl}
      className="absolute inset-0 w-full h-full object-cover rounded-lg pointer-events-none"
      playsInline
      muted={false}
      crossOrigin="anonymous"
    />
  );
};
