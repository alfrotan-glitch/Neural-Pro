import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioMixController } from '../features/video-studio/playback/audio';
import { VideoStudioShellView } from '../features/video-studio/shell';
import type { PanelId } from '../features/video-studio/shell/types';
import { useProjectStore } from '../store/useProjectStore';
import { useSubscribeStore } from '../store/useSubscribeStore';
import { useExportStore } from '../store/useExportStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { ResourceSidebar } from './workspace/ResourceSidebar';
import { VideoPlayer } from './player/VideoPlayer';
import { VirtualizedTimeline } from './timeline/VirtualizedTimeline';
import { InspectorEngine } from './inspector/InspectorEngine';
import { exportVideoWebCodecs, getExportScope, createExportProjectSnapshot } from '../features/video-studio/export/services/exportService';
import { getExportDimensions } from '../core/engine/exportResolution';
import { getExportDimensionsForJob } from '../features/video-studio/export/services/exportService';
import { seekActiveVideoClips } from '../features/video-studio/playback/services/playbackService';
import { getClipPlaybackRate, getClipSourceRange } from '../features/video-studio/playback/services/mediaTimeMapper';
import { RenderPipeline } from '../core/engine/RenderPipeline';
import { normalizeCyberpunkSubscribeProperties } from '../core/engine/cyberpunkSubscribeModel';
import { CanvasExportRenderer } from '../core/engine/render/CanvasExportRenderer';
import { collectExportVideoElements } from '../core/engine/render/ExportMediaRegistry';
import type { ExportJob, ExportResolution } from '../store/useExportStore';
import type { ClipNode } from '../features/video-studio/project/types';
import { addAssetToTracks } from '../features/video-studio/project/services/projectService';
import { createTrackSnapshotCommand } from '../features/video-studio/project/commands';
import { selectAllClips, selectActualDuration } from '../features/video-studio/project/selectors/projectSelectors';
import { renderProjectAudio } from '../features/video-studio/audio/services/projectAudioRenderService';
import { getTransportClock } from '../features/video-studio/playback/services/useTransportClock';
import { loadProjectFromStorage, saveProjectToStorage } from '../features/video-studio/project/services/projectPersistenceService';

export interface VideoStudioProProps {
  projectName: string;
  initialScript?: any[];
  audioUrl?: string | null;
  onBack: () => void;
}

async function loadExportImageSource(url: string): Promise<CanvasImageSource> {
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'same-origin',
    cache: 'force-cache',
  });

  if (!response.ok) {
    throw new Error(`Overlay image request failed (${response.status}) for ${url}`);
  }

  const blob = await response.blob();

  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function VideoStudioPro({ projectName, initialScript, audioUrl, onBack }: VideoStudioProProps) {
  const isPlaying = useProjectStore(s => s.isPlaying);
  const storeCurrentTime = useProjectStore(s => s.currentTime);
  const totalDuration = useProjectStore(s => s.totalDuration);
  const tracks = useProjectStore(s => s.tracks);
  const toastMessage = useProjectStore(s => s.toastMessage);
  const theme = useProjectStore(s => s.theme);
  const setTheme = useProjectStore(s => s.setTheme);
  const setCurrentTime = useProjectStore(s => s.setCurrentTime);
  const setIsPlaying = useProjectStore(s => s.setIsPlaying);
  const executeCommand = useProjectStore(s => s.executeCommand);
  const hydrateTracks = useProjectStore(s => s.hydrateTracks);
  const hydrateProject = useProjectStore(s => s.hydrateProject);
  const setSelectedNodeIds = useProjectStore(s => s.setSelectedNodeIds);
  const showToast = useProjectStore(s => s.showToast);

  // Calculate actual end of project (max end time of any clip)
  const clips = selectAllClips({ tracks });
  const actualVideoDuration = selectActualDuration({ totalDuration });

  const { undo, redo, past, future } = useHistoryStore();
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  
  // Advanced export configuration states
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showQueueModal, setShowQueueModal] = useState<boolean>(false);
  const [exportQuality, setExportQuality] = useState<ExportResolution>('1080p');
  const [exportFps, setExportFps] = useState<24 | 30 | 60>(30);
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm' | 'mkv'>('mp4');
  
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const exportRendererRef = useRef<CanvasExportRenderer | null>(null);
  const exportMediaRegistryRef = useRef<ReadonlyMap<string, HTMLVideoElement> | null>(null);
  if (!exportRendererRef.current) {
    exportRendererRef.current = new CanvasExportRenderer();
  }
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [renderedFileName, setRenderedFileName] = useState<string>('');

  const renderPipeline = RenderPipeline.getInstance();
  const queueResolversRef = useRef(new Map<string, {
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
  }>());
  const activeExportSignalRef = useRef<AbortSignal | null>(null);
  const activeExportSettingsRef = useRef<ExportJob['settings'] | null>(null);
  const pendingExportClipIdsRef = useRef<string[] | undefined>(undefined);
  const activeExportProjectSnapshotRef = useRef<ExportJob['projectSnapshot'] | null>(null);
  const activeExportProjectNameRef = useRef<string | null>(null);
  const exportOverlayImageCacheRef = useRef(new Map<string, CanvasImageSource>());
  const exportOverlayImageLoadsRef = useRef(new Map<string, Promise<CanvasImageSource>>());

  const clearExportOverlayImageCache = () => {
    exportOverlayImageCacheRef.current.forEach((source) => {
      if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
        source.close();
      }
    });
    exportOverlayImageCacheRef.current.clear();
    exportOverlayImageLoadsRef.current.clear();
  };

  const preloadExportOverlayImages = async () => {
    const urls = new Set<string>();

    useProjectStore.getState().tracks
      .filter((track) => track.isVisible)
      .flatMap((track) => track.clips)
      .forEach((clip) => {
        const imageUrl = clip.properties?.imageUrl;
        if (typeof imageUrl === 'string' && imageUrl.trim()) {
          urls.add(imageUrl);
        }

        if (clip.sourceId === 'st_cyber_sub' || clip.sourceId === 'ef_cyber_sub' || clip.sourceId?.includes('cyber')) {
          const customLogoUrl = clip.properties?.customLogoUrl;
          if (typeof customLogoUrl === 'string' && customLogoUrl.trim()) {
            urls.add(customLogoUrl);
          }
        }
      });

    await Promise.all(Array.from(urls, async (url) => {
      if (exportOverlayImageCacheRef.current.has(url)) return;

      const existing = exportOverlayImageLoadsRef.current.get(url);
      const loadPromise = existing ?? loadExportImageSource(url);
      exportOverlayImageLoadsRef.current.set(url, loadPromise);

      try {
        const source = await loadPromise;
        exportOverlayImageCacheRef.current.set(url, source);
      } finally {
        exportOverlayImageLoadsRef.current.delete(url);
      }
    }));
  };

  useEffect(() => {
    const unregisterRenderer = renderPipeline.registerRenderer(async (job, signal) => {
      return new Promise<Blob>((resolve, reject) => {
        queueResolversRef.current.set(job.id, { resolve, reject, signal });
        activeExportSignalRef.current = signal;
        activeExportSettingsRef.current = job.settings;
        activeExportProjectSnapshotRef.current = job.projectSnapshot;
        activeExportProjectNameRef.current = job.projectName;
        setExportQuality(job.settings.resolution);
        setExportFps(job.settings.fps);
        setExportFormat(job.settings.format);
        setRenderedBlobUrl(previousUrl => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return null;
        });
        setRenderedFileName('');
        setExportProgress(0);
        setIsExporting(true);
        showToast('⚡ Queue job accepted by the production WebCodecs export engine.');
      });
    });

    return () => {
      unregisterRenderer();
      queueResolversRef.current.forEach(({ reject }) => reject(new Error('Video Studio Pro was unmounted before export completion.')));
      queueResolversRef.current.clear();
      activeExportSignalRef.current = null;
      activeExportSettingsRef.current = null;
      activeExportProjectSnapshotRef.current = null;
      activeExportProjectNameRef.current = null;
      clearExportOverlayImageCache();
      exportMediaRegistryRef.current = null;
    };
  }, []);

  // Sync generated podcast audio directly to background audio track on the timeline
  useEffect(() => {
    if (audioUrl) {
      const state = useProjectStore.getState();
      const updatedTracks = state.tracks.map(track => {
        if (track.id === 'track_audio_bg') {
          return {
            ...track,
            clips: [
              {
                id: 'generated_podcast_audio_clip',
                sourceId: 'generated_podcast_audio',
                startAt: 0.0,
                duration: state.totalDuration,
                trim: { in: 0, out: state.totalDuration },
                transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 },
                properties: {
                  name: 'Generated Podcast Audio.wav',
                  color: 'from-purple-600 to-blue-500',
                  thumbnail: '🎙️',
                  audioUrl: audioUrl,
                  levelDb: 0,
                  pan: 0,
                  noiseReduction: false,
                  enhanceVoice: false,
                  waveformData: Array.from({ length: 45 }, () => Math.floor(Math.random() * 30) + 10)
                }
              }
            ]
          };
        }
        return track;
      });
      state.executeCommand(createTrackSnapshotCommand('Add Generated Podcast Audio', state.tracks, updatedTracks));
      state.showToast("🎙️ Synchronized generated podcast audio directly to Video Studio!");
    }
  }, [audioUrl]);

  // Centralized preview transport clock. The clock owns elapsed time while React/Zustand
  // receives a bounded UI publication rate instead of maintaining a component-local RAF.
  useEffect(() => {
    const clock = getTransportClock();
    clock.setDuration(actualVideoDuration);

    const unsubscribe = clock.subscribe((time) => {
      const currentStoreTime = useProjectStore.getState().currentTime;
      if (Math.abs(currentStoreTime - time) >= 0.001) {
        setCurrentTime(time);
      }
      if (!clock.isPlaying && useProjectStore.getState().isPlaying) {
        setIsPlaying(false);
      }
    });

    return unsubscribe;
  }, [actualVideoDuration, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const clock = getTransportClock();
    if (Math.abs(clock.totalDuration - actualVideoDuration) > 0.0001) {
      clock.setDuration(actualVideoDuration);
    }
  }, [actualVideoDuration]);

  useEffect(() => {
    const clock = getTransportClock();
    if (isPlaying) {
      if (!clock.isApproximatelyAt(useProjectStore.getState().currentTime, 0.06)) {
        clock.seek(useProjectStore.getState().currentTime);
      }
      clock.play();
    } else {
      clock.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) return;
    const clock = getTransportClock();
    const storeTime = useProjectStore.getState().currentTime;
    if (!clock.isApproximatelyAt(storeTime, 0.04)) {
      clock.seek(storeTime);
    }
  }, [storeCurrentTime, isPlaying]);

  // Handle adding asset to timeline tracks
  const handleAddAssetToTimeline = (asset: any) => {
    const state = useProjectStore.getState();
    const result = addAssetToTracks(
      state.tracks,
      asset,
      state.currentTime,
      { ...normalizeCyberpunkSubscribeProperties() },
    );

    executeCommand(createTrackSnapshotCommand(`Add Asset: ${asset.name}`, state.tracks, result.tracks));
    setSelectedNodeIds([result.clipId]);
    showToast(`➕ Added: ${asset.name}`);
  };

  const handleSave = () => {
    try {
      saveProjectToStorage(localStorage, projectName, useProjectStore.getState());
      showToast("💾 Saved project successfully!");
    } catch (error) {
      console.error('Failed to save Video Studio project:', error);
      showToast("❌ Saving the project failed.");
    }
  };

  useEffect(() => {
    try {
      const loadedProject = loadProjectFromStorage(
        localStorage,
        projectName,
        useProjectStore.getState(),
      );
      if (!loadedProject) return;
      hydrateProject(loadedProject);
    } catch (error) {
      console.error('Failed to load saved Video Studio project:', error);
      showToast("❌ Saved project is invalid and was not loaded.");
    }
  }, [projectName, hydrateProject, showToast]);

  const getEstimatedSize = () => {
    const selectedVideoBitrate = useExportStore.getState().videoBitrate;
    const selectedAudioBitrate = useExportStore.getState().audioBitrate;
    const audioBps = Number.parseInt(selectedAudioBitrate, 10) * 1000;

    const clips = tracks.flatMap(t => t.clips);
    const actualVideoDuration = totalDuration;

    const totalBitrate = selectedVideoBitrate + audioBps;
    const sizeInMB = (totalBitrate * actualVideoDuration) / 8 / 1_000_000;

    if (sizeInMB < 1) return `${(sizeInMB * 1024).toFixed(0)} KB`;
    if (sizeInMB >= 1024) return `${(sizeInMB / 1024).toFixed(2)} GB`;
    return `${sizeInMB.toFixed(1)} MB`;
  };

  const getProgressStatusMessage = () => {
    if (exportProgress < 15) {
      return "🎵 در حال استخراج و رندر صدا... (Processing Audio...)";
    } else if (exportProgress < 100) {
      return `🚀 در حال رندر ویدیوی سخت‌افزاری با GPU سیستم شما... (Hardware GPU Render: ${exportProgress}%)`;
    } else {
      return "🎉 پردازش با موفقیت به اتمام رسید! (Completed!)";
    }
  };

  const beginExport = useCallback((settings: ExportJob['settings']) => {
    setShowExportModal(false);
    activeExportSettingsRef.current = structuredClone(settings);
    setExportQuality(settings.resolution);
    setExportFps(settings.fps);
    setExportFormat(settings.format);
    if (renderedBlobUrl) {
      URL.revokeObjectURL(renderedBlobUrl);
    }
    setRenderedBlobUrl(null);
    setRenderedFileName('');
    setExportProgress(0);
    const projectSnapshot = createExportProjectSnapshot(useProjectStore.getState());
    const jobId = useExportStore.getState().addJob(projectName, settings, projectSnapshot);
    void renderPipeline.renderJob(jobId);
    showToast(
      settings.clipIds && settings.clipIds.length > 0
        ? '🎯 Selected Timeline clips added to the production export queue.'
        : '⚡ Export job added to the production queue.',
    );
  }, [projectName, renderedBlobUrl, renderPipeline, setShowExportModal, showToast]);

  useEffect(() => {
    const onExportSelected = (event: Event) => {
      const detail = (event as CustomEvent<{ clipIds?: string[] }>).detail;
      const clipIds = Array.isArray(detail?.clipIds)
        ? [...new Set(detail.clipIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [];

      if (clipIds.length === 0) {
        showToast('⚠️ Select at least one clip to export.');
        return;
      }

      pendingExportClipIdsRef.current = clipIds;
      setSelectedNodeIds(clipIds);
      setShowExportModal(true);
      showToast(`🎯 ${clipIds.length} selected clip${clipIds.length === 1 ? '' : 's'} ready for export.`);
    };

    const onRenderSelected = (event: Event) => {
      const detail = (event as CustomEvent<{ clipIds?: string[] }>).detail;
      const clipIds = Array.isArray(detail?.clipIds)
        ? [...new Set(detail.clipIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [];

      if (clipIds.length === 0) {
        showToast('⚠️ Select at least one clip to render.');
        return;
      }

      const exportStore = useExportStore.getState();
      beginExport({
        resolution: exportStore.resolution,
        fps: exportStore.fps,
        codec: exportStore.codec,
        quality: exportStore.quality,
        audioBitrate: exportStore.audioBitrate,
        videoBitrate: exportStore.videoBitrate,
        format: exportStore.format,
        clipIds,
      });
    };

    window.addEventListener('video-studio:timeline:export-selected', onExportSelected);
    window.addEventListener('video-studio:timeline:render-selected', onRenderSelected);

    return () => {
      window.removeEventListener('video-studio:timeline:export-selected', onExportSelected);
      window.removeEventListener('video-studio:timeline:render-selected', onRenderSelected);
    };
  }, [beginExport, setSelectedNodeIds, showToast]);

  // Helper to draw the current state onto the export canvas
;

  // GPU-accelerated direct 2D canvas renderer for export overlays (Ultra-fast, 0ms DOM capture delay)
;

  // Advanced frame-accurate sequential video export pipeline (FFmpeg-assisted)
  useEffect(() => {
    if (!isExporting) return;

    let isCancelled = false;

    const runRenderPipeline = async () => {
      const projectSnapshot = activeExportProjectSnapshotRef.current;
      const liveStore = useProjectStore.getState();
      const activeSignal = activeExportSignalRef.current;
      try {
        if (!projectSnapshot) {
          throw new Error('Export job snapshot is unavailable.');
        }
        // 1. Reset live preview state; rendering below uses the immutable job snapshot.
        liveStore.setIsPlaying(false);
        liveStore.setCurrentTime(0);
      setExportProgress(1);

      // Create the canvas from the canonical project/export resolution.
      // Export dimensions are derived from project metadata, never from the UI viewport.
      const canvas = document.createElement('canvas');
      const activeSettings = activeExportSettingsRef.current ?? {
        resolution: exportQuality,
        fps: exportFps,
        codec: useExportStore.getState().codec,
        quality: useExportStore.getState().quality,
        audioBitrate: useExportStore.getState().audioBitrate,
        videoBitrate: useExportStore.getState().videoBitrate,
        format: exportFormat,
        clipIds: pendingExportClipIdsRef.current,
      };
      const dimensions = getExportDimensionsForJob({
        id: 'active-export',
        projectName: activeExportProjectNameRef.current ?? projectName,
        status: 'rendering',
        progress: 0,
        settings: activeSettings,
        projectSnapshot,
      });
      const width = dimensions.width;
      const height = dimensions.height;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
      if (!ctx) return;

      // Mute local preview output during export without creating a second AudioContext owner.
      getAudioMixController().setMasterMuted(true);

      const exportScope = getExportScope(projectSnapshot, {
        id: 'active-export',
        projectName: activeExportProjectNameRef.current ?? projectName,
        status: 'rendering',
        progress: 0,
        settings: activeSettings,
        projectSnapshot,
      });
      const scopedTracks = exportScope.tracks;
      const actualVideoDuration = exportScope.duration;
      if (actualVideoDuration <= 0 || scopedTracks.every((track) => track.clips.length === 0)) {
        throw new Error('Nothing exportable was found in the selected project scope.');
      }
      const renderState = {
        ...projectSnapshot,
        tracks: scopedTracks,
        totalDuration: actualVideoDuration,
      }; 

      // ----------------------------------------------------
      // PHASE 1: CANONICAL PROJECT AUDIO RENDER
      // ----------------------------------------------------
      setExportProgress(3);
      showToast("🔊 مرحله ۱ از ۲: میکس آفلاین صدای پروژه با همان مدل Preview... (Phase 1/2: Canonical Offline Audio Mix...)");

      let finalAudioBuffer: AudioBuffer | null = null;
      try {
        finalAudioBuffer = await renderProjectAudio({
          tracks: scopedTracks,
          duration: actualVideoDuration,
          sampleRate: 44100,
          signal: activeSignal ?? undefined,
        });
        if (activeSignal?.aborted || isCancelled) return;
        setExportProgress(15);
      } catch (audioError) {
        if (activeSignal?.aborted || isCancelled) return;
        // Audio is part of the export contract. Do not silently replace it with silence.
        throw audioError;
      }

      setExportProgress(31);
      clearExportOverlayImageCache();
      await preloadExportOverlayImages();
      exportMediaRegistryRef.current = collectExportVideoElements();

      // ----------------------------------------------------
      // PHASE 2: ADVANCED FRAME-BY-FRAME SEQUENTIAL VIDEO EXPORT
      // ----------------------------------------------------
      showToast("🚀 مرحله ۲ از ۲: پردازش محلی با شتاب‌دهنده گرافیکی (GPU Local Render)...");

      const totalFrames = Math.ceil(actualVideoDuration * exportFps);
      if (!Number.isFinite(totalFrames) || totalFrames < 1) {
        throw new Error('Export duration produced no renderable frames.');
      }
      


      
      const renderFrame = async (frameIndex: number) => {
        if (isCancelled) return null;

        const targetTime = frameIndex / exportFps;
        if (activeSignal?.aborted) {
          throw activeSignal.reason instanceof Error
            ? activeSignal.reason
            : new Error('Export cancelled.');
        }

        // Export owns media seeking. React's playback effects are explicitly
        // disabled while exporting, so there is exactly one seek authority.
        await seekActiveVideoClips(
          scopedTracks,
          targetTime,
          exportMediaRegistryRef.current ?? new Map(),
          activeSignal ?? undefined,
        );

        if (isCancelled) return null;
        if (activeSignal?.aborted) {
          throw activeSignal.reason instanceof Error
            ? activeSignal.reason
            : new Error('Export cancelled.');
        }

        // Export overlays and captions are rendered directly into the
        // full-resolution export canvas. The React preview DOM is never
        // rasterized into the export frame.
        exportRendererRef.current!.render(
          canvas,
          ctx,
          width,
          height,
          targetTime,
          {
            state: renderState,
            imageCache: exportOverlayImageCacheRef.current,
            mediaByClipId: exportMediaRegistryRef.current ?? new Map(),
          },
        );

        return canvas;
      };

      try {
        const exportSettings: ExportJob['settings'] = activeSettings;

        const blob = await exportVideoWebCodecs(
          exportSettings,
          totalFrames,
          finalAudioBuffer,
          renderFrame,
          (progress) => setExportProgress(progress.percentage),
          activeSignal ?? undefined
        );
        if (isCancelled) return;
        
        setExportProgress(100);
        const fileName = `${projectName.toLowerCase().replace(/\s+/g, '_')}_render.${activeSettings.format}`;
        const objectUrl = URL.createObjectURL(blob);
        
        setRenderedBlobUrl(objectUrl);
        setRenderedFileName(fileName);

        const queuedJobId = [...queueResolversRef.current.keys()].find(id => queueResolversRef.current.get(id)?.signal === activeSignal);
        if (queuedJobId) {
          queueResolversRef.current.get(queuedJobId)?.resolve(blob);
          queueResolversRef.current.delete(queuedJobId);
        }
        
        try {
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (err) {
          console.warn("Auto-download trigger blocked", err);
        }
        showToast("🎉 ویدیو با موفقیت از طریق GPU سیستم شما رندر و دانلود شد! (Hardware-Accelerated Render Complete!)");
      } catch (err: any) {
        const queuedJobId = [...queueResolversRef.current.keys()].find(id => queueResolversRef.current.get(id)?.signal === activeSignal);
        if (queuedJobId) {
          queueResolversRef.current.get(queuedJobId)?.reject(err instanceof Error ? err : new Error(String(err)));
          queueResolversRef.current.delete(queuedJobId);
        }
        showToast(`❌ خطا در رندر و مونتاژ ویدیو: ${err.message}`);
        console.error("WebCodecs export error:", err);
      }
      } catch (outerErr: any) {
        console.error("Pipeline error:", outerErr);
      } finally {
        clearExportOverlayImageCache();
        exportMediaRegistryRef.current = null;
        setIsExporting(false);
        activeExportSignalRef.current = null;
        activeExportSettingsRef.current = null;
        activeExportProjectSnapshotRef.current = null;
        activeExportProjectNameRef.current = null;
        pendingExportClipIdsRef.current = undefined;
        // Restore active states
        liveStore.setIsPlaying(false);
        liveStore.setCurrentTime(0);
        getAudioMixController().setMasterMuted(false);
      }
    };

    runRenderPipeline();

    return () => {
      isCancelled = true;
      // Reset isPlaying
      const store = useProjectStore.getState();
      store.setIsPlaying(false);
      store.setCurrentTime(0);
      getAudioMixController().setMasterMuted(false);
    };
  }, [isExporting]);

  const renderPanel = (panelId: PanelId) => {
    switch (panelId) {
      case 'media':
        return <ResourceSidebar onAddClip={handleAddAssetToTimeline} />;
      case 'preview':
        return <VideoPlayer safeAreaGrid={true} initialScript={initialScript} isExporting={isExporting} />;
      case 'inspector':
        return <InspectorEngine />;
      case 'timeline':
        return <VirtualizedTimeline projectName={projectName} />;
      default:
        return null;
    }
  };

  return (
    <VideoStudioShellView
      projectName={projectName}
      theme={theme}
      toastMessage={toastMessage}
      isExporting={isExporting}
      exportProgress={exportProgress}
      exportQuality={exportQuality}
      exportFps={exportFps}
      exportFormat={exportFormat}
      renderedBlobUrl={renderedBlobUrl}
      renderedFileName={renderedFileName}
      canUndo={canUndo}
      canRedo={canRedo}
      showExportModal={showExportModal}
      showQueueModal={showQueueModal}
      renderPanel={renderPanel}
      onBack={onBack}
      onUndo={undo}
      onRedo={redo}
      onSave={handleSave}
      onToggleTheme={() => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        showToast(newTheme === 'light' ? '☀️ حالت روشن فعال شد' : '🌙 حالت تاریک فعال شد');
      }}
      onShowQueue={() => setShowQueueModal(true)}
      onShowExport={() => setShowExportModal(true)}
      onCloseQueue={() => setShowQueueModal(false)}
      onCloseExport={() => setShowExportModal(false)}
      onStartExport={(settings) => {
        beginExport({
          ...settings,
          clipIds: pendingExportClipIdsRef.current,
        });
        pendingExportClipIdsRef.current = undefined;
      }}
      onCloseExportProgress={() => {
        setIsExporting(false);
        setExportProgress(0);
      }}
      getProgressStatusMessage={getProgressStatusMessage}
    />
  );
}
