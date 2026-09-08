import React, { useEffect, useRef } from 'react';
import type { ClipNode } from '../../project/types/project';
import { getAudioMixController } from '../audio';
import { resolveClipAudioMix } from '../../audio/services/audioMixModel';
import { createMediaHealthController, type MediaHealthSnapshot } from '../services/mediaHealthController';
import { stopAndResetMediaElement } from '../services/mediaSyncController';
import { createMediaSyncSession, type MediaSyncSession } from '../services/multiMediaSyncController';
import type { PlaybackDirection } from '../services/playbackDirection';
import { resolvePlaybackAudioPolicy } from '../services/playbackAudioPolicy';

export interface RealAudioElementProps {
  audioUrl: string;
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
  playbackSessionId?: string;
  playbackSessionRevision?: number;
}

export const RealAudioElement: React.FC<RealAudioElementProps> = ({
  audioUrl,
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
  playbackSessionId,
  playbackSessionRevision,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncSessionRef = useRef<MediaSyncSession | null>(null);
  const healthControllerRef = useRef<ReturnType<typeof createMediaHealthController> | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const audioMix = getAudioMixController();
    audioMix.registerMediaElement(audio, { muted: true });
    return () => audioMix.unregisterMediaElement(audio);
  }, []);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isExporting) return;

    audio.pause();
    syncSessionRef.current?.dispose();
    syncSessionRef.current = null;
  }, [isExporting]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isExporting) return;
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
    getAudioMixController().updateMediaElement(audio, {
      muted: mix.muted || isMuted || playbackAudioPolicy.muted,
      levelDb: mix.levelDb,
      pan: mix.pan,
      fadeGain: mix.fadeGain,
    });
  }, [activeTime, clipId, clipDuration, clipMuted, clipStartAt, clipTrimIn, clipTrimOut, playbackSpeed, trackMuted, levelDb, pan, fadeIn, fadeOut, isPlaying, playbackDirection, isExporting, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isExporting) return;
    const clip: ClipNode = {
      id: clipId,
      sourceId: clipId,
      startAt: clipStartAt,
      duration: clipDuration,
      trim: { in: clipTrimIn, out: clipTrimOut },
      transform: { x: 0, y: 0, scale: 100, rotation: 0 },
      properties: { speed: playbackSpeed, muted: clipMuted },
    };
    const session = syncSessionRef.current ?? createMediaSyncSession(audio);
    syncSessionRef.current = session;
    session.update({ clip, projectTime: activeTime, isPlaying, playbackDirection, playbackFps, playbackSessionId, playbackSessionRevision });
  }, [activeTime, clipDuration, clipId, clipMuted, clipStartAt, clipTrimIn, clipTrimOut, isExporting, isPlaying, playbackSpeed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isExporting) return;
    const controller = createMediaHealthController(audio, {
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
    const audio = audioRef.current;
    if (audio) stopAndResetMediaElement(audio);
    syncSessionRef.current?.dispose();
    syncSessionRef.current = null;
  }, []);

  return <audio ref={audioRef} data-export-media-clip-id={clipId} src={audioUrl} muted={false} crossOrigin="anonymous" />;
};
