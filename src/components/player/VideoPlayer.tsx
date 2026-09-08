import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { RealVideoElement } from '../../features/video-studio/playback/components/RealVideoElement';
import { RealAudioElement } from '../../features/video-studio/playback/components/RealAudioElement';
import { usePreviewTransformInteraction } from '../../features/video-studio/playback/hooks/usePreviewTransformInteraction';
import { useProjectStore } from '../../store/useProjectStore';
import { SubtitleRenderer } from './SubtitleRenderer';
import { CyberpunkSubscribe } from './CyberpunkSubscribe';
import { SubscribeTemplates } from './SubscribeTemplates';
import { AudioWaveOverlay } from './AudioWaveOverlay';
import { resolveClipSelection } from '../../features/video-studio/shared/services/selectionInteractionService';
import { UpdateCyberpunkSubscribePropertiesCommand, type CyberpunkPropertySnapshot } from '../../features/video-studio/overlays/commands';
import { normalizeCyberpunkSubscribeProperties, type CyberpunkSubscribeProperties } from '../../core/engine/cyberpunkSubscribeModel';
import { getTransportClock, useTransportTime } from '../../features/video-studio/playback/services/useTransportClock';
import type { MediaHealthSnapshot } from '../../features/video-studio/playback/services/mediaHealthController';
import { getAudioMixController } from '../../features/video-studio/playback/audio';
import { getClipPlaybackRate } from '../../features/video-studio/playback/services/mediaTimeMapper';
import type { ClipNode } from '../../features/video-studio/project/types/project';
import type { Command } from '../../core/commands/types';
import { 
  Play, Pause, Square, SkipBack, SkipForward, 
  Grid3X3, Maximize2, Volume2, VolumeX 
} from 'lucide-react';

import { buildPreviewCompositorIndex, selectActivePreviewCompositorPlan } from '../../features/video-studio/playback/compositor/previewCompositorIndex';
import { MEDIA_FRAME_SIZE_PERCENT } from '../../features/video-studio/playback/services/mediaFrameGeometry';
import { getMediaVisualEffects } from '../../features/video-studio/playback/services/mediaVisualEffects';
import { getImageToVideoAnimationState } from '../../features/video-studio/playback/services/imageToVideoAnimation';
import { getCanonicalClipTransform, getPreviewTransformCss } from '../../features/video-studio/playback/services/clipTransformModel';
import { resolveCaptionFontWeight } from '../../features/video-studio/captions/services/captionVisualContract';
import { getCaptionCanvasPlacement } from '../../features/video-studio/captions/services/captionRenderPlan';
import { evaluateClipAnimation } from '../../features/video-studio/animation/services';
import { resolveAtomicMediaFrameCommit, isAtomicMediaFrameCommitCurrent, type AtomicMediaFrameCommit } from '../../features/video-studio/playback/services/atomicMediaFrameCommit';
import { createAtomicRenderSnapshot } from '../../features/video-studio/playback/services/atomicRenderSnapshot';
import { diagnoseRenderSnapshotPair, type RenderSnapshotDiagnostic } from '../../features/video-studio/playback/services/renderSnapshotDiagnostics';
import { createPlaybackSessionController, type PlaybackSessionSnapshot } from '../../features/video-studio/playback/services/playbackSessionController';

const PreviewResizeHandles: React.FC<{
  clip: ClipNode;
  onResize: (e: React.MouseEvent, clip: ClipNode) => void;
  enabled?: boolean;
}> = ({ clip, onResize, enabled = true }) => {
  if (!enabled) return null;
  const handles = [
    ['nw', 'nwse-resize', '-top-1.5 -left-1.5'],
    ['n', 'ns-resize', '-top-1.5 left-1/2 -translate-x-1/2'],
    ['ne', 'nesw-resize', '-top-1.5 -right-1.5'],
    ['e', 'ew-resize', 'top-1/2 -right-1.5 -translate-y-1/2'],
    ['se', 'nwse-resize', '-bottom-1.5 -right-1.5'],
    ['s', 'ns-resize', '-bottom-1.5 left-1/2 -translate-x-1/2'],
    ['sw', 'nesw-resize', '-bottom-1.5 -left-1.5'],
    ['w', 'ew-resize', 'top-1/2 -left-1.5 -translate-y-1/2'],
  ] as const;
  return <>
    {handles.map(([handle, cursor, position]) => (
      <div
        key={handle}
        data-preview-resize-handle={handle}
        onMouseDown={(e) => onResize(e, clip)}
        style={{ cursor }}
        className={`absolute ${position} w-3 h-3 bg-purple-500 rounded-sm border border-white hover:scale-125 transition-transform z-30 shadow`}
        title={`Resize ${handle}`}
      />
    ))}
  </>;
};

interface VideoPlayerProps {
  safeAreaGrid?: boolean;
  initialScript?: any[];
  isExporting?: boolean;
  onRenderSnapshotDiagnostics?: (diagnostic: RenderSnapshotDiagnostic) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ safeAreaGrid = true, initialScript, isExporting = false, onRenderSnapshotDiagnostics }) => {
  const { 
    isPlaying, 
    currentTime, 
    totalDuration, 
    tracks, 
    selectedNodeIds, 
    setSelectedNodeIds,
    setCurrentTime, 
    setIsPlaying,
    updateNodeProperty,
    executeCommand,
    hoverTime,
    activeTool,
    metadata,
    animations
  } = useProjectStore();

  // Calculate actual end of project (max end time of any clip)
  const clips = tracks.flatMap(t => t.clips);
  const actualVideoDuration = totalDuration;
  const projectFps = Number.isFinite(metadata?.fps) && metadata.fps > 0 ? metadata.fps : 30;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const {
    hudRef,
    isTransformDragging,
    handleMoveMouseDown,
    handleResizeMouseDown,
    handleRotateMouseDown,
    handleLineHeightMouseDown,
    handleLetterSpacingMouseDown,
  } = usePreviewTransformInteraction({
    containerRef,
    tracks,
    selectedNodeIds,
    executeCommand,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  
  // New customization states
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:5'>('16:9');
  const [showGrid, setShowGrid] = useState<boolean>(safeAreaGrid);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [mediaHealth, setMediaHealth] = useState<Record<string, MediaHealthSnapshot>>({});
  const [mediaReloadTokens, setMediaReloadTokens] = useState<Record<string, number>>({});
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const handleVideoElementReady = useCallback((clipId: string, element: HTMLVideoElement | null) => {
    if (element) {
      videoElementsRef.current.set(clipId, element);
    } else {
      videoElementsRef.current.delete(clipId);
    }
  }, []);

  const handleMediaHealthChange = useCallback((clipId: string, snapshot: MediaHealthSnapshot) => {
    setMediaHealth((previous) => {
      if (previous[clipId]?.status === snapshot.status && previous[clipId]?.message === snapshot.message && previous[clipId]?.retryCount === snapshot.retryCount) {
        return previous;
      }
      return { ...previous, [clipId]: snapshot };
    });
  }, []);

  const retryMediaClip = useCallback((clipId: string) => {
    setMediaReloadTokens((previous) => ({ ...previous, [clipId]: (previous[clipId] ?? 0) + 1 }));
  }, []);

  const canvasDimensions = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { width: 1, height: 1 };
    }

    let ratio = 16 / 9;
    if (aspectRatio === '9:16') ratio = 9 / 16;
    else if (aspectRatio === '1:1') ratio = 1;
    else if (aspectRatio === '4:5') ratio = 4 / 5;

    const padding = containerSize.width < 400 || containerSize.height < 300 ? 4 : 8;
    const maxW = Math.max(1, containerSize.width - padding * 2);
    const maxH = Math.max(1, containerSize.height - padding * 2);

    let width = maxW;
    let height = maxW / ratio;

    if (height > maxH) {
      height = maxH;
      width = maxH * ratio;
    }

    return { width, height };
  }, [containerSize, aspectRatio]);

  const canvasStyle = useMemo(() => ({
    width: `${canvasDimensions.width}px`,
    height: `${canvasDimensions.height}px`,
  }), [canvasDimensions]);

  // The actual time we are rendering. Usually currentTime, but can be hoverTime during scrub.
  const transportTime = useTransportTime();
  const playbackDirection = getTransportClock().playbackDirection;
  const playbackSessionControllerRef = useRef(createPlaybackSessionController());
  const [playbackSession, setPlaybackSession] = useState<PlaybackSessionSnapshot>(() => playbackSessionControllerRef.current.capture());
  const previousPlaybackIntentRef = useRef<{ isPlaying: boolean; direction: typeof playbackDirection; projectTime: number }>({ isPlaying: false, direction: 1, projectTime: transportTime });
  // The Project Time remains shared/authoritative. Each video also reports
  // its own decoded-frame presentation time so clip-local visual animation can
  // follow the frame actually presented by that specific media element.
  const [presentedFrameTimes, setPresentedFrameTimes] = useState<Record<string, number>>({});
  const handlePresentedFrame = useCallback((clipId: string, projectTime: number, sessionId?: string, sessionRevision?: number) => {
    if (sessionId && sessionRevision !== undefined && !playbackSessionControllerRef.current.isCurrent(sessionId, sessionRevision)) return;
    setPresentedFrameTimes((previous) => {
      if (Math.abs((previous[clipId] ?? Number.NaN) - projectTime) < 0.0001) return previous;
      return { ...previous, [clipId]: projectTime };
    });
  }, []);
  const activeTime = isPlaying
    ? transportTime
    : (hoverTime !== null ? hoverTime : currentTime);

  // Build static compositor metadata only when the project tracks change.
  // Active layers are then selected from that index for each playback time,
  // avoiding a full track/clip traversal on every transport update.
  const previewCompositorIndex = useMemo(
    () => buildPreviewCompositorIndex(tracks),
    [tracks],
  );
  const previewCompositorPlan = useMemo(
    () => selectActivePreviewCompositorPlan(previewCompositorIndex, activeTime),
    [previewCompositorIndex, activeTime],
  );

  const activeVideoLayers = previewCompositorPlan.byRole.video;
  const activeTextLayers = previewCompositorPlan.byRole.text;
  const activeAudioLayers = previewCompositorPlan.byRole['audio-visual'];
  const activeEffectLayers = previewCompositorPlan.byRole.overlay;

  const activeVideoClipIdsKey = useMemo(
    () => activeVideoLayers.map(layer => layer.clip.id).join('|'),
    [activeVideoLayers],
  );
  const activeVideoClipIds = useMemo(
    () => (activeVideoClipIdsKey ? activeVideoClipIdsKey.split('|') : []),
    [activeVideoClipIdsKey],
  );
  useEffect(() => {
    const previous = previousPlaybackIntentRef.current;
    const directionChanged = previous.direction !== playbackDirection;
    const playingChanged = previous.isPlaying !== isPlaying;
    const timeChangedWhilePaused = !isPlaying && Math.abs(previous.projectTime - transportTime) >= 0.0001;
    let nextSession: PlaybackSessionSnapshot | null = null;

    if (isPlaying && !previous.isPlaying) {
      nextSession = playbackSessionControllerRef.current.begin(true, playbackDirection, transportTime, activeVideoClipIds);
    } else if (!isPlaying && previous.isPlaying) {
      nextSession = playbackSessionControllerRef.current.stop(transportTime);
    } else if (isPlaying && (directionChanged || playingChanged)) {
      nextSession = playbackSessionControllerRef.current.transition(true, playbackDirection, transportTime);
    } else if (timeChangedWhilePaused) {
      nextSession = playbackSessionControllerRef.current.seek(transportTime);
    }

    const currentAttached = playbackSessionControllerRef.current.capture().attachedClipIds;
    const attachmentsChanged = currentAttached.length !== activeVideoClipIds.length
      || currentAttached.some((id, index) => id !== activeVideoClipIds[index]);
    if (!nextSession && attachmentsChanged) {
      nextSession = playbackSessionControllerRef.current.syncMediaAttachments(activeVideoClipIds);
    }

    if (nextSession) setPlaybackSession(nextSession);
    previousPlaybackIntentRef.current = { isPlaying, direction: playbackDirection, projectTime: transportTime };
  }, [isPlaying, playbackDirection, transportTime, activeVideoClipIdsKey]);
  const atomicMediaFrameCommit = useMemo(() =>
    resolveAtomicMediaFrameCommit({
      session: playbackSession,
      clipIds: activeVideoClipIds,
      presentedFrameTimes,
      transportTime,
      maxFrameSkewSeconds: 1 / Math.max(1, projectFps),
      maxTransportLagSeconds: 0.125,
      fallbackTime: activeTime,
    }),
    [playbackSession, activeVideoClipIds, presentedFrameTimes, transportTime, projectFps, activeTime],
  );
  const lastAtomicMediaFrameCommitRef = useRef<AtomicMediaFrameCommit | null>(null);
  useEffect(() => {
    if (!isPlaying) return;
    if (atomicMediaFrameCommit.ready) {
      lastAtomicMediaFrameCommitRef.current = atomicMediaFrameCommit;
    } else if (lastAtomicMediaFrameCommitRef.current && !isAtomicMediaFrameCommitCurrent(lastAtomicMediaFrameCommitRef.current, playbackSession)) {
      lastAtomicMediaFrameCommitRef.current = null;
    }
  }, [isPlaying, atomicMediaFrameCommit, playbackSession]);

  const coherentPresentationTime = isPlaying
    ? (lastAtomicMediaFrameCommitRef.current && isAtomicMediaFrameCommitCurrent(lastAtomicMediaFrameCommitRef.current, playbackSession)
      ? lastAtomicMediaFrameCommitRef.current.time
      : activeTime)
    : activeTime;

  // The preview owns one AudioMixController. Master mute is applied here; individual
  // media elements register their clip/track gain and pan when mounted.
  useEffect(() => {
    const audioMix = getAudioMixController();
    audioMix.setMasterMuted(isMuted || isExporting);
  }, [isMuted, isExporting]);

  // Ensure AudioContext resumes when playback starts (solves browser autoplay policy blocks)
  useEffect(() => {
    if (isPlaying) {
      getAudioMixController().resumeIfNeeded().catch(() => {});
    }
  }, [isPlaying]);

  // Selected clip lookup is project/selection driven, not transport-time driven.
  const activeClip = useMemo(
    () => tracks.flatMap(t => t.clips).find(c => c.id === selectedNodeIds[0]),
    [tracks, selectedNodeIds],
  );

  const renderCompositorPlan = useMemo(
    () => selectActivePreviewCompositorPlan(previewCompositorIndex, coherentPresentationTime),
    [previewCompositorIndex, coherentPresentationTime],
  );
  const renderSnapshot = useMemo(
    () => createAtomicRenderSnapshot({
      plan: renderCompositorPlan,
      animations: animations ?? [],
      commit: lastAtomicMediaFrameCommitRef.current ?? atomicMediaFrameCommit,
    }),
    [renderCompositorPlan, animations, atomicMediaFrameCommit],
  );

  useEffect(() => {
    if (!isPlaying) {
      lastAtomicMediaFrameCommitRef.current = null;
      setPresentedFrameTimes(prev => Object.keys(prev).length === 0 ? prev : {});
    }
  }, [isPlaying]);

  const previousRenderSnapshotRef = useRef(renderSnapshot);
  useEffect(() => {
    const previous = previousRenderSnapshotRef.current;
    previousRenderSnapshotRef.current = renderSnapshot;
    if (!onRenderSnapshotDiagnostics || !previous) return;
    onRenderSnapshotDiagnostics(diagnoseRenderSnapshotPair(previous, renderSnapshot, 'preview'));
  }, [renderSnapshot, onRenderSnapshotDiagnostics]);

  // Every active video owns its own decoded-frame clock.
  const activeClipsAtTime = activeVideoLayers.map(layer => layer.clip);
  const activeTextClips = activeTextLayers.map(layer => layer.clip);
  const activeAudioClipsAtTime = activeAudioLayers.map(layer => layer.clip);
  const activeEffectsClips = activeEffectLayers.map(layer => layer.clip);
  const previewLayerByClipId = previewCompositorPlan.byClipId;



  const activePreviewClips = useMemo(() => {
    const seen = new Set<string>();
    const result: any[] = [];
    [...activeClipsAtTime, ...activeTextClips, ...activeEffectsClips, ...activeAudioClipsAtTime].forEach((clip) => {
      if (!seen.has(clip.id)) {
        seen.add(clip.id);
        result.push(clip);
      }
    });
    return result;
  }, [activeClipsAtTime, activeTextClips, activeEffectsClips, activeAudioClipsAtTime]);

  const findClipTrack = (clipId: string) =>
    tracks.find((track) => track.clips.some((clip) => clip.id === clipId));

  const handlePreviewClipMouseDown = (e: React.MouseEvent, clip: any) => {
    if (e.button !== 0 && e.button !== 2) return;
    const target = e.target as HTMLElement;
    if (target.closest('button,input,textarea,select,[contenteditable="true"]')) return;

    const nextSelection = resolveClipSelection({
      selectedIds: selectedNodeIds,
      allClips: activePreviewClips,
      clickedClipId: clip.id,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    });

    setSelectedNodeIds(nextSelection);

    if (e.button === 2) {
      e.preventDefault();
      return;
    }

    const clickedWasSelected = selectedNodeIds.includes(clip.id);
    const subtractive = e.altKey || ((e.ctrlKey || e.metaKey) && clickedWasSelected);
    const rangeSelection = e.shiftKey;
    const track = findClipTrack(clip.id);
    const locked = Boolean(track?.isLocked);

    if (activeTool === 'select' && !locked && !subtractive && !rangeSelection && nextSelection.includes(clip.id)) {
      handleMoveMouseDown(e, clip);
    }
  };

  const handlePreviewBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      setSelectedNodeIds([]);
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (actualVideoDuration > 0 && rect.width > 0) {
      const normalizedX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setCurrentTime(normalizedX * actualVideoDuration);
    }
  };
  // Audio waveform rendering pseudo-data helper
  const getWaveformData = (clip: any) => {
    if (clip.properties.waveformData) return clip.properties.waveformData;
    const peaks = [];
    const seed = clip.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    for (let i = 0; i < 30; i++) {
      const val = Math.abs(Math.sin(seed + i * 0.95)) * 70 + 15;
      peaks.push(val);
    }
    return peaks;
  };


  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Frame-by-frame navigation follows the project's actual FPS.
  const stepFrameForward = () => {
    setIsPlaying(false);
    setCurrentTime(Math.min(actualVideoDuration, currentTime + 1 / projectFps));
  };

  const stepFrameBackward = () => {
    setIsPlaying(false);
    setCurrentTime(Math.max(0, currentTime - 1 / projectFps));
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#08090c]" id="video-player-container">
      {/* Visual Canvas stage */}
      <div 
        ref={containerRef}
        className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-hidden group/canvas select-none"
      >
        {/* Render base aspect ratio box */}
        <div 
          style={canvasStyle}
          onMouseDown={handlePreviewBackgroundMouseDown}
          className="relative bg-[#0e0f14] shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden rounded-lg flex items-center justify-center select-none"
        >
          
          {/* Real Background Audio Elements (Always play when active, regardless of selection) */}
          {activeAudioClipsAtTime.map(clip => {
            if (clip.properties.audioUrl) {
              return (
                <RealAudioElement
                  key={`audio_play_${clip.id}`}
                  audioUrl={clip.properties.audioUrl}
                  clipId={clip.id}
                  activeTime={activeTime}
                  clipStartAt={clip.startAt}
                  clipTrimIn={clip.trim?.in || 0}
                  clipTrimOut={Number.isFinite(clip.trim?.out) ? clip.trim!.out : (clip.trim?.in || 0) + clip.duration}
                  clipDuration={clip.duration}
                  playbackSpeed={getClipPlaybackRate(clip)}
                  clipMuted={Boolean(clip.properties.muted ?? clip.properties.isMuted)}
                  trackMuted={Boolean(tracks.find(t => t.clips.some(c => c.id === clip.id))?.isMuted)}
                  levelDb={Number(clip.properties.levelDb ?? 0)}
                  pan={Number(clip.properties.pan ?? 0)}
                  fadeIn={Number(clip.properties.fadeIn ?? 0)}
                  fadeOut={Number(clip.properties.fadeOut ?? 0)}
                  isPlaying={isPlaying}
                  playbackDirection={playbackDirection}
                  playbackFps={projectFps}
                  isMuted={isMuted}
                  isExporting={isExporting}
                  reloadToken={mediaReloadTokens[clip.id] ?? 0}
                  onHealthChange={handleMediaHealthChange}
                />
              );
            }
            return null;
          })}

          {/* Active video clips rendering in stack */}
          {renderSnapshot.byRole.video.map(layer => {
            const clip = layer.clip;
            const isSelected = selectedNodeIds.includes(clip.id);
            const mediaVisualEffects = getMediaVisualEffects(clip.properties);
            const clipPresentedTime = isPlaying ? (presentedFrameTimes[clip.id] ?? activeTime) : activeTime;
            const imageToVideoState = getImageToVideoAnimationState(clip, coherentPresentationTime);
            const canonicalTransform = renderSnapshot.transformByClipId[clip.id] ?? evaluateClipAnimation(animations, clip, renderSnapshot.time);
            return (
              <div
                key={clip.id}
                className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              >
                {/* The transform target is the same element that owns the interaction bounds.
                    Keeping the transform off the full-canvas wrapper prevents post-release
                    jumps where a canvas-sized box is scaled instead of the visual element. */}
                <div 
                  data-preview-clip-id={clip.id}
                  data-preview-transformable="true"
                  data-preview-asset-kind={clip.properties.videoUrl ? 'video' : clip.properties.imageUrl ? 'image' : 'media'}
                  onMouseDown={(e) => handlePreviewClipMouseDown(e, clip)}
                  style={{
                    width: `${MEDIA_FRAME_SIZE_PERCENT}%`,
                    height: `${MEDIA_FRAME_SIZE_PERCENT}%`,
                    transform: getPreviewTransformCss({ ...canonicalTransform, x: imageToVideoState.x, y: imageToVideoState.y, scale: imageToVideoState.scale }),
                    transformOrigin: 'center center',
                    opacity: canonicalTransform.opacity / 100,
                    zIndex: renderSnapshot.byClipId.get(clip.id)?.zIndex ?? 0,
                    filter: mediaVisualEffects.cssFilter,
                    mixBlendMode: mediaVisualEffects.cssBlendMode,
                  } as React.CSSProperties}
                  className={`rounded-lg bg-gradient-to-tr ${clip.properties.color || 'from-purple-600 to-indigo-600'} flex flex-col items-center justify-center shadow-lg relative overflow-hidden pointer-events-auto ${
                    isSelected ? 'border-2 border-dashed border-purple-500 ring-4 ring-purple-500/20' : ''
                  }`}
                >
                  {isSelected && (
                    <>
                      <PreviewResizeHandles clip={clip} onResize={handleResizeMouseDown} />
                      {/* Rotate Handle */}
                      <div 
                        onMouseDown={(e) => handleRotateMouseDown(e, clip)}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border border-white cursor-crosshair hover:scale-125 transition-transform z-30 shadow"
                        title="Rotate"
                      />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-500/50 z-20" />
                      {/* Drag move handle */}
                      <div 
                        onMouseDown={(e) => handleMoveMouseDown(e, clip)}
                        className="absolute inset-0 cursor-move z-20"
                      />
                    </>
                  )}

                  {clip.properties.videoUrl ? (
                    <>
                      <RealVideoElement
                        videoUrl={clip.properties.videoUrl}
                        clipId={clip.id}
                        activeTime={activeTime}
                        clipStartAt={clip.startAt}
                        clipTrimIn={clip.trim?.in || 0}
                  clipTrimOut={Number.isFinite(clip.trim?.out) ? clip.trim!.out : (clip.trim?.in || 0) + clip.duration}
                        clipDuration={clip.duration}
                        playbackSpeed={getClipPlaybackRate(clip)}
                        clipMuted={Boolean(clip.properties.muted ?? clip.properties.isMuted)}
                        trackMuted={Boolean(tracks.find(t => t.clips.some(c => c.id === clip.id))?.isMuted)}
                        levelDb={Number(clip.properties.levelDb ?? 0)}
                        pan={Number(clip.properties.pan ?? 0)}
                        fadeIn={Number(clip.properties.fadeIn ?? 0)}
                        fadeOut={Number(clip.properties.fadeOut ?? 0)}
                        isPlaying={isPlaying}
                        playbackDirection={playbackDirection}
                        playbackFps={projectFps}
                        isMuted={isMuted}
                        isExporting={isExporting}
                        reloadToken={mediaReloadTokens[clip.id] ?? 0}
                        onHealthChange={handleMediaHealthChange}
                        onVideoElementReady={handleVideoElementReady}
                        onPresentedFrame={handlePresentedFrame}
                        playbackSessionId={playbackSession.sessionId}
                        playbackSessionRevision={playbackSession.revision}
                        isPlaybackSessionCurrent={(sessionId, revision) => playbackSessionControllerRef.current.isCurrent(sessionId, revision)}
                      />
                    </>
                  ) : clip.properties.imageUrl ? (
                    <>
                      <img
                        src={clip.properties.imageUrl}
                        className="absolute inset-0 w-full h-full object-cover rounded-lg pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                    </>
                  ) : (
                    <>
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/40 text-[8px] font-bold tracking-wider text-white">PRO MODE</div>
                      <div className="text-4xl select-none">🎬</div>
                      <p className="text-[10px] font-bold tracking-tight text-white mt-2 truncate max-w-[80%] select-none">{clip.properties.name}</p>
                      <p className="text-[8px] font-mono text-white/50 mt-1 select-none">Rendered at {formatTime(activeTime)}</p>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active effects, stickers, subscribe templates, and caption overlays */}
          <div id="export-overlay-layer" className="absolute inset-0 pointer-events-none z-[100]">
          {renderSnapshot.byRole.overlay.map(layer => {
            const clip = layer.clip;
            const isSelected = selectedNodeIds.includes(clip.id);
            const showSelection = isSelected && !isExporting;
            const canonicalTransform = renderSnapshot.transformByClipId[clip.id] ?? evaluateClipAnimation(animations, clip, renderSnapshot.time);
            return (
              <div
                key={clip.id}
                className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              >
                {/* Transform/interaction share the same concrete element geometry. */}
                <div
                  data-preview-clip-id={clip.id}
                  data-preview-transformable="true"
                  data-preview-asset-kind="effect"
                  style={{
                    width: '85%',
                    height: '85%',
                    position: 'relative',
                    transform: getPreviewTransformCss(canonicalTransform),
                    transformOrigin: 'center center',
                    opacity: canonicalTransform.opacity / 100,
                    zIndex: renderSnapshot.byClipId.get(clip.id)?.zIndex ?? 0,
                  }}
                  onMouseDown={(e) => handlePreviewClipMouseDown(e, clip)}
                  className={`rounded-lg flex flex-col items-center justify-center relative overflow-hidden pointer-events-auto ${
                    showSelection ? 'border-2 border-dashed border-pink-500 ring-4 ring-pink-500/20' : ''
                  }`}
                >
                  {showSelection && (
                    <>
                      <PreviewResizeHandles clip={clip} onResize={handleResizeMouseDown} />
                {/* Rotate Handle */}
                      <div 
                        onMouseDown={(e) => handleRotateMouseDown(e, clip)}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border border-white cursor-crosshair hover:scale-125 transition-transform z-30 shadow"
                        title="Rotate"
                      />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-500/50 z-20" />
                      {/* Drag move handle */}
                      <div 
                        onMouseDown={(e) => handleMoveMouseDown(e, clip)}
                        className="absolute inset-0 cursor-move z-20"
                      />
                    </>
                  )}

                  {/* Render Cyberpunk Subscribe Component */}
                  {clip.sourceId === 'st_cyber_sub' || clip.sourceId === 'ef_cyber_sub' ? (
                    <CyberpunkSubscribe 
                      clipId={clip.id} 
                      isPlaying={isPlaying} 
                      currentTime={activeTime - clip.startAt}
                      properties={clip.properties}
                      onPropertiesChange={(patch) => {
                        const current = normalizeCyberpunkSubscribeProperties(clip.properties);
                        const next = { ...current, ...patch };
                        const changedKeys = Object.keys(patch) as Array<keyof CyberpunkSubscribeProperties>;
                        const previousValues = changedKeys.reduce<Record<string, CyberpunkPropertySnapshot>>((acc, key) => {
                          const present = Object.prototype.hasOwnProperty.call(clip.properties, key);
                          acc[key] = {
                            present,
                            value: present ? clip.properties[key] : undefined,
                          };
                          return acc;
                        }, {});
                        const nextValues = changedKeys.reduce<Record<string, CyberpunkPropertySnapshot>>((acc, key) => {
                          acc[key] = { present: true, value: next[key] };
                          return acc;
                        }, {});

                        executeCommand(
                          new UpdateCyberpunkSubscribePropertiesCommand(
                            clip.id,
                            previousValues,
                            nextValues,
                          ),
                        );
                      }}
                    />
                  ) : clip.sourceId === 'st_audio_wave_overlay' || clip.sourceId === 'ef_audio_wave_overlay' ? (
                    <AudioWaveOverlay 
                      clipId={clip.id}
                      isPlaying={isPlaying}
                      currentTime={activeTime}
                      initialScript={initialScript}
                      properties={clip.properties}
                      onPropertiesChange={(patch) => {
                        const next = { ...clip.properties, ...patch };
                        const changedKeys = Object.keys(patch) as Array<string>;
                        const previousValues = changedKeys.reduce<Record<string, CyberpunkPropertySnapshot>>((acc, key) => {
                          const present = Object.prototype.hasOwnProperty.call(clip.properties, key);
                          acc[key] = {
                            present,
                            value: present ? clip.properties[key] : undefined,
                          };
                          return acc;
                        }, {});
                        const nextValues = changedKeys.reduce<Record<string, CyberpunkPropertySnapshot>>((acc, key) => {
                          acc[key] = { present: true, value: next[key] };
                          return acc;
                        }, {});

                        executeCommand(
                          new UpdateCyberpunkSubscribePropertiesCommand(
                            clip.id,
                            previousValues,
                            nextValues,
                          ),
                        );
                      }}
                    />
                  ) : clip.sourceId === 'st_neon_capsule' || 
                      clip.sourceId === 'ef_neon_capsule' || 
                      clip.sourceId === 'st_neon_outrun' || 
                      clip.sourceId === 'ef_neon_outrun' || 
                      clip.sourceId === 'st_glass_minimal' || 
                      clip.sourceId === 'ef_glass_minimal' || 
                      clip.sourceId === 'st_classic_youtube' || 
                      clip.sourceId === 'ef_classic_youtube' || 
                      clip.sourceId === 'st_matrix_glitch' || 
                      clip.sourceId === 'ef_matrix_glitch' ||
                      clip.sourceId === 'st_custom_subscribe' ||
                      clip.sourceId === 'ef_custom_subscribe' ? (
                    <SubscribeTemplates 
                      templateId={clip.sourceId} 
                      isPlaying={isPlaying} 
                      currentTime={activeTime - clip.startAt} 
                      properties={clip.properties}
                      onPropertiesChange={(patch) => {
                        const next = { ...clip.properties, ...patch };
                        const changedKeys = Object.keys(patch) as Array<string>;
                        const previousValues = changedKeys.reduce<Record<string, CyberpunkPropertySnapshot>>((acc, key) => {
                          const present = Object.prototype.hasOwnProperty.call(clip.properties, key);
                          acc[key] = {
                            present,
                            value: present ? clip.properties[key] : undefined,
                          };
                          return acc;
                        }, {});
                        const nextValues = changedKeys.reduce<Record<string, CyberpunkPropertySnapshot>>((acc, key) => {
                          acc[key] = { present: true, value: next[key] };
                          return acc;
                        }, {});

                        executeCommand(
                          new UpdateCyberpunkSubscribePropertiesCommand(
                            clip.id,
                            previousValues,
                            nextValues,
                          ),
                        );
                      }}
                    />
                  ) : clip.sourceId === 'st_sub' || clip.sourceId === 'ef_sub' ? (
                    <div className="absolute inset-0 bg-[#090b11] border border-[#ff0055]/30 flex flex-col items-center justify-center p-6 text-white text-center rounded-lg">
                      <div className="text-4xl mb-2 animate-bounce">🔔</div>
                      <h3 className="text-xl font-bold uppercase tracking-wider text-rose-500">Subscribe</h3>
                      <p className="text-xs text-gray-400 mt-1">Don't miss our latest content!</p>
                    </div>
                  ) : clip.properties.imageUrl ? (
                    <img
                      src={clip.properties.imageUrl}
                      className="absolute inset-0 w-full h-full object-cover rounded-lg pointer-events-none"
                      referrerPolicy="no-referrer"
                    />
                  ) : clip.sourceId?.startsWith('st') ? (
                    <div className={`absolute inset-0 bg-gradient-to-tr ${clip.properties.color || 'from-purple-600 to-indigo-600'} flex flex-col items-center justify-center p-4 rounded-lg shadow-lg`}>
                      <span className="text-6xl select-none filter drop-shadow-md">{clip.properties.thumbnail || '⭐'}</span>
                      <span className="text-[10px] font-mono font-bold tracking-widest text-white/80 uppercase mt-2 bg-black/30 px-2 py-0.5 rounded">{clip.properties.name}</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-pink-500/10 border border-pink-500/30 flex flex-col items-center justify-center p-6 text-white text-center rounded-lg">
                      <div className="text-4xl mb-2">{clip.properties.thumbnail || '✨'}</div>
                      <h3 className="text-sm font-bold uppercase tracking-widest text-pink-500">{clip.properties.name}</h3>
                      <p className="text-[10px] text-gray-400 mt-1 italic">{clip.properties.textContent}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {(Object.entries(mediaHealth) as Array<[string, MediaHealthSnapshot]>)
            .filter(([clipId, snapshot]) => {
              const clip = clips.find((candidate) => candidate.id === clipId);
              return Boolean(clip) && activeTime >= clip!.startAt && activeTime < clip!.startAt + clip!.duration && snapshot.status !== 'ready' && snapshot.status !== 'idle';
            })
            .map(([clipId, snapshot]) => {
              const clip = clips.find((candidate) => candidate.id === clipId);
              if (!clip) return null;
              return (
                <div
                  key={`media-health-${clipId}`}
                  className="absolute inset-0 z-[80] pointer-events-none flex items-center justify-center"
                >
                  <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/75 px-4 py-3 text-center shadow-2xl backdrop-blur-sm">
                    <div className="text-xs font-semibold text-white">{snapshot.status === 'buffering' ? 'Buffering preview…' : snapshot.status === 'loading' ? 'Loading media…' : 'Media playback error'}</div>
                    {snapshot.message && <div className="mt-1 max-w-xs text-[11px] text-gray-300">{snapshot.message}</div>}
                    {snapshot.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => retryMediaClip(clipId)}
                        className="mt-2 rounded-md border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium text-white hover:bg-white/15"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {/* Render Text overlay with Karaoke highlights and customized bounds */}
            {renderSnapshot.byRole.text.map(layer => {
            const clip = layer.clip;
            const canonicalTransform = renderSnapshot.transformByClipId[clip.id] ?? evaluateClipAnimation(animations, clip, renderSnapshot.time);
              const isSelected = selectedNodeIds.includes(clip.id);
              const showSelection = isSelected && !isExporting;
            const containerHeight = Number(clip.properties.containerHeight) || 110;
            const captionPlacement = getCaptionCanvasPlacement(
              canvasDimensions.width,
              canvasDimensions.height,
              containerHeight,
              0,
            );
            return (
              <div
                key={clip.id}
                className="absolute inset-0 pointer-events-none select-none"
                data-caption-export-exclude="true"
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${captionPlacement.centerX}px`,
                    top: `${captionPlacement.centerY}px`,
                    width: 0,
                    height: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <div 
                    data-preview-clip-id={clip.id}
                    data-preview-transformable="true"
                    data-preview-asset-kind="caption"
                    style={{
                      position: 'relative',
                      boxSizing: 'border-box',
                      transform: getPreviewTransformCss(canonicalTransform),
                      transformOrigin: 'center center',
                      opacity: canonicalTransform.opacity / 100,
                      zIndex: renderSnapshot.byClipId.get(clip.id)?.zIndex ?? 0,
                      backgroundColor: 'transparent',
                      borderColor: 'transparent',
                      backdropFilter: 'none',
                      boxShadow: 'none',
                      borderRadius: clip.properties.radius !== undefined ? `${clip.properties.radius}px` : '12px',
                      width: clip.properties.containerAutoWidth ? 'auto' : `${clip.properties.containerWidth ?? 550}px`,
                      height: clip.properties.containerAutoHeight ? 'auto' : `${clip.properties.containerHeight ?? 110}px`,
                    }}
                    onMouseDown={(e) => handlePreviewClipMouseDown(e, clip)}
                    className={`text-center select-none relative pointer-events-auto ${
                      showSelection ? 'outline outline-1 outline-dashed outline-purple-500/50' : ''
                    }`}
                  >
                  {showSelection && (
                    <>
                      <PreviewResizeHandles clip={clip} onResize={handleResizeMouseDown} />
                      {/* Rotate Handle */}
                      <div 
                        onMouseDown={(e) => handleRotateMouseDown(e, clip)}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border border-white cursor-crosshair hover:scale-125 transition-transform z-30 shadow"
                        title="Rotate"
                      />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-500/50 z-20" />
                      
                      {/* Line Height Handle */}
                      <div 
                        onMouseDown={(e) => handleLineHeightMouseDown(e, clip)}
                        className="absolute top-1/2 -right-4 -translate-y-1/2 w-3 h-6 bg-orange-500 rounded-sm border border-white cursor-ns-resize hover:scale-110 transition-transform z-30 shadow flex items-center justify-center"
                        title="Line Spacing"
                      >
                        <div className="w-1 h-3 bg-white/50 rounded-full" />
                      </div>

                      {/* Letter Spacing Handle */}
                      <div 
                        onMouseDown={(e) => handleLetterSpacingMouseDown(e, clip)}
                        className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-6 h-3 bg-green-500 rounded-sm border border-white cursor-ew-resize hover:scale-110 transition-transform z-30 shadow flex items-center justify-center"
                        title="Character Spacing"
                      >
                        <div className="w-3 h-1 bg-white/50 rounded-full" />
                      </div>

                      {/* Drag handle */}
                      <div 
                        onMouseDown={(e) => handleMoveMouseDown(e, clip)}
                        className="absolute inset-0 cursor-move z-20"
                      />
                    </>
                  )}

                  <div className="relative z-10 pointer-events-none w-full h-full">
                    <SubtitleRenderer
                      clipId={clip.id}
                      textContent={clip.properties.textContent || ''}
                      words={clip.properties.words}
                      currentTime={activeTime}
                      theme={clip.properties.captionTheme || 'karaoke'}
                      captionDisplayMode={clip.properties.captionDisplayMode || 'phrase'}
                      clipStart={clip.startAt}
                      clipEnd={clip.startAt + clip.duration}
                      
                      // Container properties
                      containerWidth={clip.properties.containerWidth}
                      containerHeight={clip.properties.containerHeight}
                      containerAutoWidth={clip.properties.containerAutoWidth}
                      containerAutoHeight={clip.properties.containerAutoHeight}
                      padding={clip.properties.padding !== undefined ? clip.properties.padding : 16}
                      containerMargin={clip.properties.containerMargin}
                      radius={clip.properties.radius !== undefined ? clip.properties.radius : 12}
                      alignment={clip.properties.alignment || 'center'}

                      // Background properties
                      bgEnabled={clip.properties.bgEnabled !== undefined ? clip.properties.bgEnabled : true}
                      backgroundColor={clip.properties.backgroundColor || 'rgba(0, 0, 0, 0.75)'}
                      bgOpacity={clip.properties.bgOpacity !== undefined ? clip.properties.bgOpacity : 0.75}
                      bgGradientEnabled={clip.properties.bgGradientEnabled}
                      bgGradientColor={clip.properties.bgGradientColor}
                      bgGradientDirection={clip.properties.bgGradientDirection}
                      bgBlur={clip.properties.bgBlur !== undefined ? clip.properties.bgBlur : 4}
                      bgGlassEffect={clip.properties.bgGlassEffect}

                      // Border properties
                      borderEnabled={clip.properties.borderEnabled}
                      borderWidth={clip.properties.borderWidth}
                      borderColor={clip.properties.borderColor}
                      borderStyle={clip.properties.borderStyle}

                      // Shadow properties
                      shadowEnabled={clip.properties.shadowEnabled !== undefined ? clip.properties.shadowEnabled : true}
                      shadowColor={clip.properties.shadowColor}
                      shadowBlur={clip.properties.shadowBlur !== undefined ? clip.properties.shadowBlur : 25}
                      shadowDistance={clip.properties.shadowDistance}
                      shadowOpacity={clip.properties.shadowOpacity}

                      // Typography spacing details
                      fontFamily={clip.properties.fontFamily || 'Inter'}
                      fontSize={clip.properties.fontSize || 22}
                      fontWeight={resolveCaptionFontWeight({
                        theme: clip.properties.captionTheme || 'karaoke',
                        fontWeight: clip.properties.fontWeight,
                        bold: clip.properties.bold,
                      })}
                      textColor={clip.properties.textColor || '#ffffff'}
                      textStrokeEnabled={clip.properties.textStrokeEnabled}
                      textStrokeColor={clip.properties.textStrokeColor}
                      textStrokeWidth={clip.properties.textStrokeWidth}
                      textOutlineEnabled={clip.properties.textOutlineEnabled}
                      textOutlineColor={clip.properties.textOutlineColor}
                      textOutlineBlur={clip.properties.textOutlineBlur}
                      textGlowEnabled={clip.properties.textGlowEnabled}
                      textGlowColor={clip.properties.textGlowColor}
                      textGlowBlur={clip.properties.textGlowBlur}
                      charSpacing={clip.properties.charSpacing !== undefined ? clip.properties.charSpacing : 0}
                      lineSpacing={clip.properties.lineSpacing !== undefined ? clip.properties.lineSpacing : 1.2}
                      wordSpacing={clip.properties.wordSpacing !== undefined ? clip.properties.wordSpacing : 12}

                      // Highlight properties
                      highlightEnabled={clip.properties.highlightEnabled !== undefined ? clip.properties.highlightEnabled : true}
                      activeColor={clip.properties.activeColor || '#eab308'}
                      highlightOpacity={clip.properties.highlightOpacity}
                      highlightRadius={clip.properties.highlightRadius}
                      highlightPaddingX={clip.properties.highlightPaddingX}
                      highlightPaddingY={clip.properties.highlightPaddingY}
                      highlightSpeed={clip.properties.highlightSpeed}
                      highlightCurve={clip.properties.highlightCurve}
                      highlightFollowMode={clip.properties.highlightFollowMode}

                      // Animations preset
                      textAnimationPreset={clip.properties.textAnimationPreset || 'fade'}
                      
                      // Theme-specific custom properties
                      movingBoxBgColor={clip.properties.movingBoxBgColor}
                      movingBoxRadius={clip.properties.movingBoxRadius}
                      movingBoxBorderWidth={clip.properties.movingBoxBorderWidth}
                      movingBoxBorderColor={clip.properties.movingBoxBorderColor}
                      movingBoxPaddingX={clip.properties.movingBoxPaddingX}
                      movingBoxPaddingY={clip.properties.movingBoxPaddingY}
                      movingBoxScale={clip.properties.movingBoxScale}
                      movingBoxShadowOpacity={clip.properties.movingBoxShadowOpacity}

                      karaokeActiveScale={clip.properties.karaokeActiveScale}
                      karaokeInactiveOpacity={clip.properties.karaokeInactiveOpacity}
                      karaokeInactiveColor={clip.properties.karaokeInactiveColor}
                      karaokeActiveBold={clip.properties.karaokeActiveBold}

                      underlineColor={clip.properties.underlineColor}
                      underlineHeight={clip.properties.underlineHeight}
                      underlineGap={clip.properties.underlineGap}
                      underlineStyle={clip.properties.underlineStyle}
                      underlineAnimation={clip.properties.underlineAnimation}

                      glowColor={clip.properties.glowColor}
                      glowRadius={clip.properties.glowRadius}
                      glowBrightness={clip.properties.glowBrightness}
                      glowPulseSpeed={clip.properties.glowPulseSpeed}
                      glowInactiveBlur={clip.properties.glowInactiveBlur}

                      highlightBgColor={clip.properties.highlightBgColor}
                      highlightBorderColor={clip.properties.highlightBorderColor}
                      highlightBorderWidth={clip.properties.highlightBorderWidth}
                      highlightTextColor={clip.properties.highlightTextColor}

                      popScale={clip.properties.popScale}
                      popRotation={clip.properties.popRotation}
                      popBorderColor={clip.properties.popBorderColor}
                      popBounceStiffness={clip.properties.popBounceStiffness}

                      bounceHeight={clip.properties.bounceHeight}
                      bounceRotate={clip.properties.bounceRotate}
                      bounceScale={clip.properties.bounceScale}
                      bounceDuration={clip.properties.bounceDuration}

                      minimalShowDot={clip.properties.minimalShowDot}
                      minimalDotColor={clip.properties.minimalDotColor}
                      minimalLetterSpacing={clip.properties.minimalLetterSpacing}
                      minimalActiveLetterSpacing={clip.properties.minimalActiveLetterSpacing}
                      minimalScale={clip.properties.minimalScale}
                      minimalOpacity={clip.properties.minimalOpacity}

                      typewriterCursorType={clip.properties.typewriterCursorType}
                      typewriterCursorSpeed={clip.properties.typewriterCursorSpeed}
                      typewriterCursorColor={clip.properties.typewriterCursorColor}
                      typewriterCursorSize={clip.properties.typewriterCursorSize}

                      cleanContrast={clip.properties.cleanContrast}
                      cleanIndicatorBar={clip.properties.cleanIndicatorBar}
                      cleanIndicatorColor={clip.properties.cleanIndicatorColor}

                      // Shadow Pop properties
                      shadowPopColor={clip.properties.shadowPopColor}
                      shadowPopBlur={clip.properties.shadowPopBlur}
                      shadowPopOffset={clip.properties.shadowPopOffset}
                      shadowPopActiveOffset={clip.properties.shadowPopActiveOffset}

                      // Word Stack properties
                      wordStackDirection={clip.properties.wordStackDirection}
                      wordStackSpacing={clip.properties.wordStackSpacing}
                      wordStackMaxItems={clip.properties.wordStackMaxItems}

                      // Split Reveal properties
                      splitRevealGap={clip.properties.splitRevealGap}
                      splitRevealDuration={clip.properties.splitRevealDuration}
                      splitRevealDirection={clip.properties.splitRevealDirection}

                      // Bold Impact properties
                      boldImpactUppercase={clip.properties.boldImpactUppercase}
                      boldImpactLetterSpacing={clip.properties.boldImpactLetterSpacing}
                      boldImpactBorderWidth={clip.properties.boldImpactBorderWidth}
                      boldImpactBorderColor={clip.properties.boldImpactBorderColor}

                      // Gradient Flow properties
                      gradientFlowStartColor={clip.properties.gradientFlowStartColor}
                      gradientFlowEndColor={clip.properties.gradientFlowEndColor}
                      gradientFlowSpeed={clip.properties.gradientFlowSpeed}
                      gradientFlowAngle={clip.properties.gradientFlowAngle}

                      // Chat Bubble properties
                      chatBubbleBgColor={clip.properties.chatBubbleBgColor}
                      chatBubbleTextColor={clip.properties.chatBubbleTextColor}
                      chatBubbleRadius={clip.properties.chatBubbleRadius}
                      chatBubblePaddingX={clip.properties.chatBubblePaddingX}
                      chatBubblePaddingY={clip.properties.chatBubblePaddingY}
                      chatBubbleTail={clip.properties.chatBubbleTail}

                      // Handwritten properties
                      handwrittenFont={clip.properties.handwrittenFont}
                      handwrittenDrawSpeed={clip.properties.handwrittenDrawSpeed}
                      handwrittenColor={clip.properties.handwrittenColor}

                      // Flip/Rotate properties
                      flipRotateAxis={clip.properties.flipRotateAxis}
                      flipRotateDuration={clip.properties.flipRotateDuration}
                      flipRotatePerspective={clip.properties.flipRotatePerspective}

                      // Confetti Burst properties
                      confettiBurstCount={clip.properties.confettiBurstCount}
                      confettiBurstColorList={clip.properties.confettiBurstColorList}
                      confettiBurstRadius={clip.properties.confettiBurstRadius}

                      // Outline Stroke properties
                      outlineStrokeColor={clip.properties.outlineStrokeColor}
                      outlineStrokeWidth={clip.properties.outlineStrokeWidth}
                      outlineStrokeFillOpacity={clip.properties.outlineStrokeFillOpacity}

                      style={{
                        width: '100%',
                        height: '100%',
                        fontStyle: clip.properties.italic ? 'italic' : 'normal',
                        textDecoration: clip.properties.underline ? 'underline' : 'none',
                      } as React.CSSProperties}
                    />
                  </div>
                </div>
                </div>
              </div>
            );
          })}
          </div>

          {/* Export Status Badge (Floating top-right to preserve overlay capture) */}
          {isExporting && (
            <div className="absolute top-4 right-4 z-[200] pointer-events-none flex items-center gap-2.5 bg-black/85 border border-purple-500/40 rounded-xl px-3.5 py-2 text-white shadow-2xl backdrop-blur-md">
              <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <div className="text-left">
                <span className="block text-[11px] font-bold text-purple-300">در حال رندر و صادرات فریم‌ها...</span>
                <span className="block text-[9px] text-gray-400">تمام جلوه‌ها و استیکرها بر روی ویدیو نهایی اعمال می‌شوند</span>
              </div>
            </div>
          )}

          {/* Render selected audio waveform card directly on canvas */}
          {activeAudioClipsAtTime.map(clip => {
            const isSelected = selectedNodeIds.includes(clip.id);
            if (!isSelected) return null; // Only render inside the viewport when selected to keep clean
            const canonicalTransform = getCanonicalClipTransform(clip.transform);
            return (
              <div
                key={clip.id}
                className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              >
                <div
                  data-preview-clip-id={clip.id}
                  data-preview-transformable="true"
                  data-preview-asset-kind="audio"
                  style={{
                    transform: getPreviewTransformCss(canonicalTransform),
                    transformOrigin: 'center center',
                    opacity: canonicalTransform.opacity / 100,
                    zIndex: previewLayerByClipId.get(clip.id)?.zIndex ?? 0
                  }}
                  onMouseDown={(e) => handlePreviewClipMouseDown(e, clip)}
                  className="w-[70%] h-[32%] bg-[#08090d]/95 border border-purple-500/35 rounded-2xl p-4 flex flex-col justify-between shadow-2xl backdrop-blur-md pointer-events-auto select-none relative"
                >
                <PreviewResizeHandles clip={clip} onResize={handleResizeMouseDown} />
                {/* Rotate Handle: all preview-visible asset types share the same transform contract. */}
                <div 
                  onMouseDown={(e) => handleRotateMouseDown(e, clip)}
                  className="absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full border border-white cursor-crosshair hover:scale-125 transition-transform z-30 shadow"
                  title="Rotate"
                />
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-500/50 z-20" />
                {/* Drag move handle */}
                <div 
                  onMouseDown={(e) => handleMoveMouseDown(e, clip)}
                  className="absolute inset-0 cursor-move rounded-2xl z-10"
                />

                {/* Header info */}
                <div className="flex items-center justify-between relative z-20">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🎵</span>
                  </div>
                  <span className="text-[8px] font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20">
                    {clip.properties.levelDb || 0} dB
                  </span>
                </div>

                {/* Waveform representation */}
                <div className="h-14 flex items-end gap-[2.5px] px-1 relative z-20 pointer-events-none">
                  {getWaveformData(clip).map((h: number, idx: number) => {
                    // Dynamic ripple visualizer height during real-time playback
                    const pulseHeight = isPlaying 
                      ? Math.min(100, Math.max(10, h + Math.sin(currentTime * 12 + idx) * 18))
                      : h;
                    return (
                      <div 
                        key={idx} 
                        style={{ height: `${pulseHeight}%` }}
                        className="flex-1 bg-gradient-to-t from-purple-600 to-indigo-400 rounded-sm"
                      />
                    );
                  })}
                </div>

                {/* Audio pan, scale status footer */}
                <div className="flex items-center justify-between text-[8px] font-mono text-gray-500 relative z-20">
                  <span>PAN: {clip.properties.pan || 0}</span>
                  <span>LENGTH: {clip.duration.toFixed(1)}s</span>
                </div>
              </div>
              </div>
            );
          })}

          {/* Safe Area grid overlay lines */}
          {showGrid && (
            <div className="absolute inset-0 border border-white/[0.03] pointer-events-none flex flex-wrap">
              <div className="w-1/3 h-full border-r border-white/[0.03]" />
              <div className="w-1/3 h-full border-r border-white/[0.03]" />
              <div className="absolute inset-0 flex flex-col">
                <div className="h-1/3 border-b border-white/[0.03]" />
                <div className="h-1/3 border-b border-white/[0.03]" />
              </div>
              
              {/* Inner Safe Boundary Box (Action safe 90%, Title safe 80%) */}
              <div className="absolute inset-[10%] border border-dotted border-white/[0.05] rounded" />
              <div className="absolute inset-[5%] border border-dashed border-white/[0.03]" />
            </div>
          )}
        </div>
      </div>

      {/* Playback Controls Footer bar */}
      <div className="bg-[#0b0c10] border-t border-white/5 px-4 py-2.5 flex items-center justify-between select-none">
        
        {/* Playback Trigger Group & Frame Navigation */}
        <div className="flex items-center gap-2">
          <button 
            onClick={stepFrameBackward}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer transition-colors"
            title="Backward 1 Frame (Left Arrow)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          
          <button 
            onClick={togglePlayback}
            className="w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_0_12px_rgba(147,51,234,0.3)] cursor-pointer animate-none"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>

          <button 
            onClick={stepFrameForward}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer transition-colors"
            title="Forward 1 Frame (Right Arrow)"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <button 
            onClick={handleStop}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer transition-colors"
            title="Stop Playback"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        </div>

        {/* Timecode display */}
        <div className="text-center font-mono text-[11px] font-bold text-gray-300">
          <span className="text-purple-400">{formatTime(currentTime)}</span>
          <span className="text-white/20 mx-1.5">/</span>
          <span className="text-gray-500">{formatTime(actualVideoDuration)}</span>
        </div>

        {/* Monitoring Controls: Aspect Ratio, Safe Area, Volume */}
        <div className="flex items-center gap-3">
          
          {/* Mute toggle button */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-purple-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Safe Area Grid toggle */}
          <button 
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1.5 rounded border transition-colors cursor-pointer flex items-center gap-1 text-[9px] font-bold ${
              showGrid ? 'bg-purple-600/10 text-purple-400 border-purple-500/30' : 'text-gray-400 border-white/5 hover:border-white/10 hover:bg-white/5'
            }`}
            title="Toggle Safe Area Overlay (Grid)"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Safe Area</span>
          </button>

          {/* Aspect Ratio select */}
          <div className="flex items-center gap-1 text-[9px] font-bold text-gray-500 bg-white/5 px-2 py-1 rounded border border-white/5">
            <Maximize2 className="w-3 h-3 text-purple-400" />
            <select 
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
              className="bg-transparent border-none focus:outline-none focus:ring-0 text-gray-300 cursor-pointer font-sans"
            >
              <option value="16:9" className="bg-[#0b0c10] text-gray-200">16:9 Landscape</option>
              <option value="9:16" className="bg-[#0b0c10] text-gray-200">9:16 Portrait</option>
              <option value="1:1" className="bg-[#0b0c10] text-gray-200">1:1 Square</option>
              <option value="4:5" className="bg-[#0b0c10] text-gray-200">4:5 Social</option>
            </select>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-gray-500">
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5">1080p</span>
            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{projectFps} FPS</span>
          </div>
        </div>

      </div>

      <div
        ref={hudRef}
        className="fixed pointer-events-none z-[9999] bg-black/80 text-white font-mono text-[10px] font-bold px-2 py-1 rounded shadow-lg border border-white/20 whitespace-nowrap transform -translate-x-1/2 -translate-y-full"
        style={{ display: isTransformDragging ? 'block' : 'none', left: 0, top: 0 }}
        aria-hidden="true"
      />
    </div>
  );
};
