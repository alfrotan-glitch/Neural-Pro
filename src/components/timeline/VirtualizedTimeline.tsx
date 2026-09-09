import React, { useRef, useState, useEffect } from 'react';
import { useTimelineClipInteraction } from "../../features/video-studio/timeline/controllers/useTimelineClipInteraction";
import { useTimelineDragExecution } from "../../features/video-studio/timeline/controllers/useTimelineDragExecution";
import { createTrackSnapshotCommand as createTracksSnapshotCommand } from '../../features/video-studio/project/commands';
import { getEffectiveClipEnd } from '../../features/video-studio/project/time/clipBounds';
import { useProjectStore } from '../../store/useProjectStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { ClipNode, Track } from '../../features/video-studio/project/types/project';
import { 
  Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, 
  Trash2, Scissors, ZoomIn, ZoomOut, Magnet, Workflow,
  SkipBack, SkipForward, Undo2, Redo2, HelpCircle,
  Keyboard, Search, X, Layers, Copy, Clipboard, Link, Activity,
  ChevronDown, ChevronRight, Video, Music, Type, Sparkles,
  MousePointer2, Plus, Link2, Unlink, Crop, Replace, MoreHorizontal,
  RotateCcw, SlidersHorizontal, Download, Wand2, ListVideo, Shield,
  AudioWaveform, ChevronsUpDown, Flag, Rows3, SquareDashedMousePointer
} from 'lucide-react';
import { defaultKeymap, isActionMatched } from '../../config/keymap';

import { resolveRippleTrack, resolveOverwriteTrack } from '../../features/video-studio/timeline/services/timelineService';
import { buildTimelineClipboard, materializeTimelineClipboard } from '../../features/video-studio/timeline/services/timelineClipboardService';
import { toggleDeactivated, toggleMirrored, toggleVariableSpeedAnimation, separateAudioFromVideoAsync, recoverAudioFromVideoAsync, convertImageToVideo, splitVideoIntoScenes, syncVideoAndAudio, splitTimelineClips, deleteSelectedTimelineClips, rippleDeleteTimelineClips } from '../../features/video-studio/timeline/services';
import { TimelineContextMenu, type TimelineContextAction } from '../../features/video-studio/timeline/components';
import { resolveClipSelection, resolveLinkedSelection } from '../../features/video-studio/shared/services/selectionInteractionService';
import { createTimelineGeometry, getVisibleTimeRange, pixelToTime, timeToPixel, TIMELINE_HEADER_WIDTH, getTimelineContentViewportWidth, clientXToTimelinePixel } from '../../features/video-studio/timeline/geometry';

import { TimelineToolbar } from '../../features/video-studio/timeline/components/TimelineToolbar';
import { TimelineWorkspace } from '../../features/video-studio/timeline/components/TimelineWorkspace';
import { TimelineShortcutsModal } from '../../features/video-studio/timeline/components/TimelineShortcutsModal';
import type { ActiveDrag } from '../../features/video-studio/timeline/components/timelineInteractionTypes';
import { saveCurrentProject } from '../../features/video-studio/project/services/projectSaveController';
import { relinkClipMedia } from '../../features/video-studio/project/services/projectPersistenceService';
import { addAssetToTracks } from '../../features/video-studio/project/services/projectService';
import { normalizeCyberpunkSubscribeProperties } from '../../core/engine/cyberpunkSubscribeModel';

export interface VirtualizedTimelineProps {
  projectName: string;
}

export const VirtualizedTimeline: React.FC<VirtualizedTimelineProps> = ({ projectName }) => {
  const {
    tracks,
    currentTime,
    totalDuration,
    selectedNodeIds,
    rippleMode,
    timelineEditMode,
    setTimelineEditMode,
    magneticSnapping,
    timelineZoom,
    setCurrentTime,
    setSelectedNodeIds,
    setRippleMode,
    setMagneticSnapping,
    setTimelineZoom,
    toggleTrackState,
    executeCommand,
    showToast,
    markIn,
    markOut,
    setMarkIn,
    setMarkOut,
    activeTool,
    setActiveTool,
    clipboard,
    setClipboard,
    hoverTime,
    setHoverTime
  } = useProjectStore();

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState<boolean>(false);
  
  // High-frequency dragging state
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [professionalTrimTool, setProfessionalTrimTool] = useState<'none' | 'roll' | 'slip'>('none');

  // Direct text editing state
  const [editingTextClipId, setEditingTextClipId] = useState<string | null>(null);

  // Virtualization state
  const [visibleTimeRange, setVisibleTimeRange] = useState<{ start: number; end: number }>({ start: 0, end: totalDuration });

  // Centralized timeline geometry. Surface width is never smaller than the viewport.
  const basePixelsPerSecond = 35;
  const geometry = createTimelineGeometry(
    totalDuration,
    basePixelsPerSecond,
    timelineZoom,
    getTimelineContentViewportWidth(viewportWidth),
  );
  const pixelsPerSecond = geometry.pixelsPerSecond;
  const timelineWidth = geometry.surfaceWidth;

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;

    const updateViewportWidth = () => {
      setViewportWidth(element.clientWidth);
    };

    updateViewportWidth();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateViewportWidth)
      : null;

    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  // Keep virtualization geometry synchronized whenever zoom or viewport size changes.
  // Scroll events alone are insufficient: changing timeline zoom changes the pixel/time
  // mapping without changing scrollLeft, so a stale visibleTimeRange can render the
  // wrong clip window until the user scrolls/zooms again.
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const nextRange = getVisibleTimeRange(
      workspace.scrollLeft,
      workspace.clientWidth,
      pixelsPerSecond
    );
    setVisibleTimeRange(prev => {
      if (Math.abs(prev.start - nextRange.start) < 0.001 && Math.abs(prev.end - nextRange.end) < 0.001) {
        return prev;
      }
      return nextRange;
    });
  }, [pixelsPerSecond, viewportWidth]);

  // Active scrubber states for Continuous Keydown Hold (Arrow Right/Left)
  const activeScrubRef = useRef<'left' | 'right' | null>(null);
  const scrubSpeedRef = useRef<number>(1);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // --- Advanced Audio-Captioning Pipeline States ---
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoEnd, setLassoEnd] = useState<{ x: number; y: number } | null>(null);
  const [isLassoing, setIsLassoing] = useState<boolean>(false);
  const [lassoFilters, setLassoFilters] = useState({ video: true, audio: true, text: true, effect: true });
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const isLassoingRef = useRef(isLassoing);
  const lassoFiltersRef = useRef(lassoFilters);
  selectedNodeIdsRef.current = selectedNodeIds;
  isLassoingRef.current = isLassoing;
  lassoFiltersRef.current = lassoFilters;

  const [hoverScrubEnabled, setHoverScrubEnabled] = useState<boolean>(true);

  const [snapLineTime, setSnapLineTime] = useState<number | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clipId?: string;
    trackId?: string;
    time?: number;
  } | null>(null);
  const [contextSubmenu, setContextSubmenu] = useState<'edit' | 'range' | 'render' | 'separate' | null>(null);
  const [linkedSelectionEnabled, setLinkedSelectionEnabled] = useState(true);
  const [trackMenuId, setTrackMenuId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const linkMediaInputRef = useRef<HTMLInputElement>(null);
  const pendingFileActionRef = useRef<'replace' | 'link' | null>(null);

  // Timeline parity state: attribute clipboard and transient preset metadata.
  const [attributesClipboard, setAttributesClipboard] = useState<Record<string, unknown> | null>(null);

  // Find & Replace State
  const [showFindReplace, setShowFindReplace] = useState<boolean>(false);
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [searchMatches, setSearchMatches] = useState<{ clipId: string; textContent: string }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);

  // Find & Replace Search & indexing logic
  const escapeRegExp = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const performTextSearch = (query: string) => {
    if (!query) {
      setSearchMatches([]);
      return;
    }
    const textTrack = tracks.find(t => t.type === 'text');
    if (!textTrack) return;
    
    const matches = textTrack.clips
      .filter(c => c.properties?.textContent?.toLowerCase().includes(query.toLowerCase()))
      .map(c => ({ clipId: c.id, textContent: c.properties?.textContent || '' }));
    
    setSearchMatches(matches);
    setCurrentMatchIndex(0);
  };

  const handleFindNext = () => {
    if (searchMatches.length === 0) {
      showToast('⚠️ No matches found');
      return;
    }
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIdx);
    
    const match = searchMatches[nextIdx];
    if (!match) return;
    setSelectedNodeIds([match.clipId]);
    
    // Jump playhead to focused clip start
    const allClips = tracks.flatMap(t => t.clips);
    const clip = allClips.find(c => c.id === match.clipId);
    if (clip) {
      setCurrentTime(clip.startAt + (getEffectiveClipEnd(clip) - clip.startAt) / 2);
    }
  };

  const handleReplaceCurrent = () => {
    if (searchMatches.length === 0) return;
    const match = searchMatches[currentMatchIndex];
    if (!match) return;
    
    const initialTracks = structuredClone(tracks);
    const nextTracks = tracks.map(t => {
      if (t.type === 'text') {
        return {
          ...t,
          clips: t.clips.map(c => {
            if (c.id === match.clipId) {
              const textVal = c.properties?.textContent || '';
              const updatedContent = textVal.replace(
                new RegExp(escapeRegExp(findText), 'gi'),
                replaceText
              );
              return {
                ...c,
                properties: { ...c.properties, textContent: updatedContent, name: updatedContent }
              };
            }
            return c;
          })
        };
      }
      return t;
    });

    const cmd = createTracksSnapshotCommand('Replace Text Content', initialTracks, nextTracks);
    executeCommand(cmd);
    showToast('✍️ Text replaced!');
    performTextSearch(findText);
  };

  const handleReplaceAll = () => {
    if (searchMatches.length === 0) return;
    
    const initialTracks = structuredClone(tracks);
    const nextTracks = tracks.map(t => {
      if (t.type === 'text') {
        return {
          ...t,
          clips: t.clips.map(c => {
            const textVal = c.properties?.textContent || '';
            if (textVal.toLowerCase().includes(findText.toLowerCase())) {
              const updatedContent = textVal.replace(
                new RegExp(escapeRegExp(findText), 'gi'),
                replaceText
              );
              return {
                ...c,
                properties: { ...c.properties, textContent: updatedContent, name: updatedContent }
              };
            }
            return c;
          })
        };
      }
      return t;
    });

    const cmd = createTracksSnapshotCommand('Replace All Text Content', initialTracks, nextTracks);
    executeCommand(cmd);
    showToast(`✍️ Replaced all ${searchMatches.length} occurrences!`);
    performTextSearch(findText);
  };

  const getClipById = (clipId: string): { clip: ClipNode; track: Track } | null => {
    for (const track of useProjectStore.getState().tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) return { clip, track };
    }
    return null;
  };

  const commitClipPropertyPatch = (
    clipIds: string[],
    patch: Record<string, unknown>,
    commandName: string,
  ) => {
    const store = useProjectStore.getState();
    const initialTracks = structuredClone(store.tracks);
    const nextTracks = store.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clipIds.includes(clip.id)
          ? {
              ...clip,
              properties: {
                ...clip.properties,
                ...patch,
              },
            }
          : clip,
      ),
    }));

    const command = createTracksSnapshotCommand(
      commandName,
      initialTracks,
      nextTracks,
    );
    store.executeCommand(command);
  };

  const handleCopyAttributes = () => {
    const store = useProjectStore.getState();
    const clip = store.tracks
      .flatMap((track) => track.clips)
      .find((candidate) => store.selectedNodeIds.includes(candidate.id));

    if (!clip) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    setAttributesClipboard(structuredClone(clip.properties));
    store.showToast('📋 Clip attributes copied');
  };

  const handlePasteAttributes = () => {
    const store = useProjectStore.getState();
    if (!attributesClipboard || store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Copy attributes first and select target clips');
      return;
    }

    const initialTracks = structuredClone(store.tracks);
    const nextTracks = store.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        store.selectedNodeIds.includes(clip.id)
          ? {
              ...clip,
              properties: {
                ...clip.properties,
                ...structuredClone(attributesClipboard),
              },
            }
          : clip,
      ),
    }));

    store.executeCommand(
      createTracksSnapshotCommand(
        'Paste Clip Attributes',
        initialTracks,
        nextTracks,
      ),
    );
    store.showToast('📋 Clip attributes pasted');
  };

  const handleGroupSelected = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length < 2) {
      store.showToast('⚠️ Select at least 2 clips to group');
      return;
    }

    commitClipPropertyPatch(
      store.selectedNodeIds,
      { groupId: crypto.randomUUID() },
      'Group Clips',
    );
    store.showToast('🔗 Clips grouped');
  };

  const handleUngroupSelected = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select grouped clips first');
      return;
    }

    const initialTracks = structuredClone(store.tracks);
    const nextTracks = store.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (!store.selectedNodeIds.includes(clip.id)) return clip;
        const properties = { ...clip.properties };
        delete properties.groupId;
        return { ...clip, properties };
      }),
    }));

    store.executeCommand(
      createTracksSnapshotCommand('Ungroup Clips', initialTracks, nextTracks),
    );
    store.showToast('🔓 Clips ungrouped');
  };

  const handleDeactivateSelected = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    const result = toggleDeactivated(store, store.selectedNodeIds);
    store.executeCommand(
      createTracksSnapshotCommand(
        'Toggle Clip Active State',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.showToast('⏯️ Clip active state toggled');
  };

  const handleMirrorSelected = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    const result = toggleMirrored(store, store.selectedNodeIds);
    store.executeCommand(
      createTracksSnapshotCommand(
        'Mirror Clips',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.showToast('↔️ Mirror state toggled');
  };

  const handleVariableSpeedAnimation = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    const result = toggleVariableSpeedAnimation(store, store.selectedNodeIds);
    store.executeCommand(
      createTracksSnapshotCommand(
        'Toggle Variable Speed Animation',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.showToast('⏱️ Variable speed animation toggled');
  };

  const handleSeparateAudio = async () => {
    const store = useProjectStore.getState();
    const result = await separateAudioFromVideoAsync(store, store.selectedNodeIds);
    if (result.affectedClipIds.length === 0) {
      store.showToast(`⚠️ ${result.message ?? 'Audio separation unavailable'}`);
      return;
    }

    store.executeCommand(
      createTracksSnapshotCommand(
        'Separate Audio',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.setSelectedNodeIds(result.affectedClipIds);
    store.showToast(`🔊 ${result.message}`);
  };

  const handleRecoverAudio = async () => {
    const store = useProjectStore.getState();
    const result = await recoverAudioFromVideoAsync(store, store.selectedNodeIds);
    if (result.affectedClipIds.length === 0) {
      store.showToast(`⚠️ ${result.message ?? 'Audio recovery unavailable'}`);
      return;
    }

    store.executeCommand(
      createTracksSnapshotCommand(
        'Recover Audio',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.setSelectedNodeIds(result.affectedClipIds);
    store.showToast(`🎧 ${result.message}`);
  };

  const handleImageToVideo = () => {
    const store = useProjectStore.getState();
    const result = convertImageToVideo(store, store.selectedNodeIds);
    if (result.affectedClipIds.length === 0) {
      store.showToast(`⚠️ ${result.message ?? 'Image-to-video conversion unavailable'}`);
      return;
    }

    store.executeCommand(
      createTracksSnapshotCommand(
        'Convert Image to Video',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.setSelectedNodeIds(result.affectedClipIds);
    store.showToast(`🎬 ${result.message}`);
  };

  const handleSplitScenes = async () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select a video clip for scene detection');
      return;
    }

    store.showToast('🔎 Detecting scene changes...');
    try {
      const before = structuredClone(store.tracks);
      const result = await splitVideoIntoScenes(
        store,
        store.selectedNodeIds,
      );

      if (result.affectedClipIds.length === 0) {
        store.showToast(`ℹ️ ${result.message ?? 'No scene changes detected'}`);
        return;
      }

      store.executeCommand(
        createTracksSnapshotCommand(
          'Split Scenes',
          before,
          result.tracks,
        ),
      );
      store.setSelectedNodeIds(result.affectedClipIds);
      store.showToast(`🎬 ${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.showToast(`❌ Scene detection failed: ${message}`);
    }
  };

  const handleSyncVideoAudio = () => {
    const store = useProjectStore.getState();
    const result = syncVideoAndAudio(store, store.selectedNodeIds);
    if (result.affectedClipIds.length === 0) {
      store.showToast(`⚠️ ${result.message ?? 'Unable to synchronize clips'}`);
      return;
    }

    store.executeCommand(
      createTracksSnapshotCommand(
        'Sync Video and Audio',
        structuredClone(store.tracks),
        result.tracks,
      ),
    );
    store.showToast(`🔗 ${result.message}`);
  };

  const handleTrimToPlayhead = (clipId: string) => {
    const store = useProjectStore.getState();
    const found = getClipById(clipId);
    if (!found) return;

    const { clip, track } = found;
    if (track.isLocked) {
      store.showToast('🔒 Track is locked');
      return;
    }

    if (store.currentTime <= clip.startAt || store.currentTime >= getEffectiveClipEnd(clip)) {
      store.showToast('⚠️ Place the playhead inside the clip to trim');
      return;
    }

    const newDuration = store.currentTime - clip.startAt;
    if (newDuration < 0.05) return;

    const initialTracks = structuredClone(store.tracks);
    const nextTracks = store.tracks.map((candidateTrack) =>
      candidateTrack.id !== track.id
        ? candidateTrack
        : {
            ...candidateTrack,
            clips: candidateTrack.clips.map((candidateClip) =>
              candidateClip.id !== clip.id
                ? candidateClip
                : {
                    ...candidateClip,
                    duration: newDuration,
                    trim: {
                      ...candidateClip.trim,
                      out: (candidateClip.trim?.in || 0) + newDuration,
                    },
                  },
            ),
          },
    );

    store.executeCommand(
      createTracksSnapshotCommand('Trim Clip to Playhead', initialTracks, nextTracks),
    );
    store.showToast('✂️ Clip trimmed to playhead');
  };

  const handleSavePreset = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    const clips = store.tracks
      .flatMap((track) => track.clips)
      .filter((clip) => store.selectedNodeIds.includes(clip.id));

    const preset = {
      version: 1,
      createdAt: new Date().toISOString(),
      clips: clips.map((clip) => ({
        properties: structuredClone(clip.properties),
        transform: structuredClone(clip.transform),
      })),
    };

    const key = `video-studio.timeline.preset.${Date.now()}`;
    localStorage.setItem(key, JSON.stringify(preset));
    store.showToast('💾 Timeline preset saved');
  };

  const handleOpenFileLocation = (clipId: string) => {
    const found = getClipById(clipId);
    if (!found) return;
    const url =
      found.clip.properties.fileUrl ||
      found.clip.properties.sourceUrl ||
      found.clip.properties.videoUrl ||
      found.clip.properties.audioUrl;

    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    showToast('ℹ️ The browser does not expose the original local file path.');
  };

  const handleContextAction = (action: TimelineContextAction) => {
    const store = useProjectStore.getState();
    const clipId = contextMenu?.clipId;
    if (clipId) {
      store.setSelectedNodeIds([clipId]);
    }

    switch (action) {
      case 'copy':
        handleCopyNode();
        break;
      case 'cut':
        handleCutNode();
        break;
      case 'copy-attributes':
        handleCopyAttributes();
        break;
      case 'paste-attributes':
        handlePasteAttributes();
        break;
      case 'split':
        handleSplitNode();
        break;
      case 'trim':
      case 'trim-end':
        if (clipId) handleTrimToPlayhead(clipId);
        break;
      case 'trim-start':
        handleTrimBeforePlayhead();
        break;
      case 'image-to-video':
        handleImageToVideo();
        break;
      case 'split-scenes':
        void handleSplitScenes();
        break;
      case 'transcribe':
        dispatchTimelineAction('transcribe', clipId ? [clipId] : []);
        showToast('📝 Transcript started');
        break;
      case 'recover-audio':
        handleRecoverAudio();
        break;
      case 'sync-audio-video':
        handleSyncVideoAudio();
        break;
      case 'separate-audio':
        handleSeparateAudio();
        break;
      case 'compound':
        handleCompoundClips();
        break;
      case 'multi-camera':
        showToast('ℹ️ Multi-camera clips are not available in the current browser runtime.');
        break;
      case 'save-preset':
        handleSavePreset();
        break;
      case 'group':
        handleGroupSelected();
        break;
      case 'ungroup':
        handleUngroupSelected();
        break;
      case 'mirror':
        handleMirrorSelected();
        break;
      case 'deactivate':
        handleDeactivateSelected();
        break;
      case 'replace':
        pendingFileActionRef.current = 'replace';
        replaceInputRef.current?.click();
        break;
      case 'link-media':
        pendingFileActionRef.current = 'link';
        linkMediaInputRef.current?.click();
        break;
      case 'open-file-location':
        if (clipId) handleOpenFileLocation(clipId);
        break;
      case 'edit-effects':
        handleOpenEditEffects();
        break;
      case 'variable-speed':
        handleVariableSpeedAnimation();
        break;
      case 'export-selected':
        dispatchTimelineAction('export-selected', store.selectedNodeIds);
        break;
      case 'render-selected':
        dispatchTimelineAction('render-selected', store.selectedNodeIds);
        break;
      case 'range-in':
        handleTimelineRangeAction('in');
        break;
      case 'range-out':
        handleTimelineRangeAction('out');
        break;
      case 'range-clear':
        handleTimelineRangeAction('clear');
        break;
      case 'delete':
        handleDeleteNode();
        break;
      case 'ripple-delete':
        handleRippleDeleteNode();
        break;
    }
    setContextSubmenu(null);
  };

  const selectedContextClip = contextMenu?.clipId
    ? tracks.flatMap((candidateTrack) => candidateTrack.clips).find((candidateClip) => candidateClip.id === contextMenu.clipId)
    : undefined;
  const selectedContextTrack = contextMenu?.trackId
    ? tracks.find((candidateTrack) => candidateTrack.id === contextMenu.trackId)
    : undefined;
  const selectedContextClips = tracks
    .flatMap((candidateTrack) => candidateTrack.clips)
    .filter((candidateClip) => selectedNodeIds.includes(candidateClip.id));
  const contextHasVideo = selectedContextClips.some((candidateClip) => {
    const track = tracks.find((candidateTrack) => candidateTrack.clips.some((item) => item.id === candidateClip.id));
    return track?.type === 'video' || typeof candidateClip.properties.videoUrl === 'string';
  });
  const contextHasAudio = selectedContextClips.some((candidateClip) => {
    const track = tracks.find((candidateTrack) => candidateTrack.clips.some((item) => item.id === candidateClip.id));
    return track?.type === 'audio' || typeof candidateClip.properties.audioUrl === 'string';
  });

  const getSelectedClipIdsForToolbar = () =>
    useProjectStore.getState().selectedNodeIds;

  const handleTrimBeforePlayhead = () => {
    const store = useProjectStore.getState();
    const selectedIds = store.selectedNodeIds;
    if (selectedIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    const initialTracks = structuredClone(store.tracks);
    const targetTime = store.currentTime;
    const nextTracks = store.tracks.map((track) => {
      if (track.isLocked) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => {
          if (!selectedIds.includes(clip.id)) return clip;
          const end = clip.startAt + clip.duration;
          if (targetTime <= clip.startAt || targetTime >= end) return clip;
          const removed = targetTime - clip.startAt;
          return {
            ...clip,
            startAt: targetTime,
            duration: clip.duration - removed,
            trim: {
              ...clip.trim,
              in: (clip.trim?.in ?? 0) + removed,
            },
          };
        }),
      };
    });

    store.executeCommand(createTracksSnapshotCommand('Trim Clip Start to Playhead', initialTracks, nextTracks));
    store.showToast('✂️ Start trimmed to playhead');
  };

  const handleSplitClipAtTime = (clipId: string, trackId: string, splitTime: number) => {
    const store = useProjectStore.getState();
    const track = store.tracks.find((candidateTrack) => candidateTrack.id === trackId);
    const clip = track?.clips.find((candidateClip) => candidateClip.id === clipId);
    if (!track || !clip) return;
    if (track.isLocked) {
      store.showToast('🔒 Track is locked');
      return;
    }

    const result = splitTimelineClips(store.tracks, [clipId], splitTime);
    if (!result.changed) {
      store.showToast('⚠️ Place the blade inside the clip');
      return;
    }

    store.executeCommand(createTracksSnapshotCommand('Blade Split Clip', store.tracks, result.tracks));
    store.setSelectedNodeIds([...result.affectedClipIds]);
    store.showToast('✂️ Clip split at blade position');
  };

  const handleTrimAfterPlayhead = () => {
    const store = useProjectStore.getState();
    const selectedIds = store.selectedNodeIds;
    if (selectedIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }

    const initialTracks = structuredClone(store.tracks);
    const targetTime = store.currentTime;
    const nextTracks = store.tracks.map((track) => {
      if (track.isLocked) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => {
          if (!selectedIds.includes(clip.id)) return clip;
          const end = clip.startAt + clip.duration;
          if (targetTime <= clip.startAt || targetTime >= end) return clip;
          const newDuration = targetTime - clip.startAt;
          return {
            ...clip,
            duration: Math.max(0.05, newDuration),
            trim: {
              ...clip.trim,
              out: (clip.trim?.in ?? 0) + Math.max(0.05, newDuration),
            },
          };
        }),
      };
    });

    store.executeCommand(createTracksSnapshotCommand('Trim Clip End to Playhead', initialTracks, nextTracks));
    store.showToast('✂️ End trimmed to playhead');
  };

  /**
   * Link/Replace clip media.
   *
   * The bytes go into the asset store and the clip is rewritten to reference an
   * AssetId; the object URL is minted by the registry (and tracked for
   * revocation) instead of leaking an untracked `createObjectURL` into the
   * project document, which is what used to die on reload.
   */
  const handleLinkOrReplaceMediaFile = (file: File, mode: 'replace' | 'link') => {
    const store = useProjectStore.getState();
    const selectedIds = store.selectedNodeIds;
    if (selectedIds.length === 0) {
      store.showToast('⚠️ Select a media clip first');
      return;
    }

    void (async () => {
      try {
        const initialTracks = structuredClone(store.tracks);
        const result = await relinkClipMedia({
          clipIds: selectedIds,
          file,
          fileName: file.name,
          mimeType: file.type,
          tracks: store.tracks,
        });
        const nextTracks = result.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            selectedIds.includes(clip.id)
              ? { ...clip, properties: { ...clip.properties, mediaLinkMode: mode } }
              : clip,
          ),
        }));

        store.executeCommand(
          createTracksSnapshotCommand(
            mode === 'replace' ? 'Replace Clip Media' : 'Link Clip Media',
            initialTracks,
            nextTracks,
          ),
        );
        store.showToast(
          mode === 'replace'
            ? `🔄 Replaced media with ${file.name}`
            : `🔗 Linked ${file.name}`,
        );
      } catch (error) {
        store.showToast(`❌ Could not store ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  const handleOpenEditEffects = () => {
    const store = useProjectStore.getState();
    if (store.selectedNodeIds.length === 0) {
      store.showToast('⚠️ Select a clip first');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('video-studio:timeline:edit-effects', {
        detail: { clipIds: store.selectedNodeIds, time: store.currentTime },
      }),
    );
    store.showToast('✨ Effects editor opened');
  };

  const handleSetActiveTool = (tool: 'select' | 'split' | 'rate-stretch') => {
    const store = useProjectStore.getState();
    store.setActiveTool(tool);
    const label = tool === 'select' ? 'Selection' : tool === 'split' ? 'Blade / Split' : 'Rate Stretch';
    store.showToast(`🎯 ${label} tool selected`);
  };

  const handleFitTimeline = () => {
    const store = useProjectStore.getState();
    const computedZoom = Math.max(0.01, Math.min(20.0, 900 / Math.max(1, totalDuration * basePixelsPerSecond)));
    store.setTimelineZoom(computedZoom);
    store.showToast('🔎 Timeline fitted to view');
  };

  const handleToggleLinkedSelection = () => {
    setLinkedSelectionEnabled((current) => !current);
    showToast(`🔗 Linked selection ${linkedSelectionEnabled ? 'disabled' : 'enabled'}`);
  };

  const handleTimelineRangeAction = (action: 'in' | 'out' | 'clear') => {
    const store = useProjectStore.getState();
    if (action === 'in') {
      store.setMarkIn(store.currentTime);
      showToast(`📥 In: ${store.currentTime.toFixed(2)}s`);
    } else if (action === 'out') {
      store.setMarkOut(store.currentTime);
      showToast(`📤 Out: ${store.currentTime.toFixed(2)}s`);
    } else {
      store.setMarkIn(null);
      store.setMarkOut(null);
      showToast('🧹 Range cleared');
    }
  };

  const handleAddTrack = (type: Track['type']) => {
    const store = useProjectStore.getState();
    const nextIndex = store.tracks.filter((track) => track.type === type).length + 1;
    const newTrack: Track = {
      id: crypto.randomUUID(),
      type,
      isLocked: false,
      isMuted: false,
      isVisible: true,
      clips: [],
    };

    store.executeCommand(createTracksSnapshotCommand('Add Timeline Track', store.tracks, [...store.tracks, newTrack]));
    store.showToast(`➕ ${type} track ${nextIndex} added`);
  };


  const handleTimelineAssetDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/json');
    if (!raw) return;

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload?.type !== 'asset' || !payload.asset) return;

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const horizontalOffset = clientXToTimelinePixel({
      clientX: event.clientX,
      workspaceRectLeft: rect.left,
      scrollLeft: workspace.scrollLeft,
      pixelsPerSecond,
    });
    const dropTime = Math.max(0, pixelToTime(horizontalOffset, pixelsPerSecond));
    const asset = payload.asset;
    const state = useProjectStore.getState();
    const result = addAssetToTracks(
      state.tracks,
      asset,
      dropTime,
      { ...normalizeCyberpunkSubscribeProperties() },
    );

    state.executeCommand(createTracksSnapshotCommand(`Drop Asset: ${asset.name}`, state.tracks, result.tracks));
    state.setSelectedNodeIds([result.clipId]);
    state.showToast(`➕ Added ${asset.name} at ${dropTime.toFixed(2)}s on new ${result.laneRole} track`);
  };

  const handleDuplicateTrack = (trackId: string) => {
    const store = useProjectStore.getState();
    const source = store.tracks.find((track) => track.id === trackId);
    if (!source) return;
    const clone = structuredClone(source);
    clone.id = crypto.randomUUID();
    clone.clips = clone.clips.map((clip) => ({ ...clip, id: crypto.randomUUID() }));
    const index = store.tracks.findIndex((track) => track.id === trackId);
    const nextTracks = [...store.tracks];
    nextTracks.splice(index + 1, 0, clone);
    store.executeCommand(createTracksSnapshotCommand('Duplicate Timeline Track', store.tracks, nextTracks));
    store.showToast(`📑 ${source.type} track duplicated`);
  };

  const handleRenameTrack = (trackId: string) => {
    const store = useProjectStore.getState();
    const source = store.tracks.find((track) => track.id === trackId);
    if (!source) return;
    const currentName = String(source.name ?? `${source.type} track`);
    const nextName = window.prompt('Track name', currentName);
    if (!nextName || nextName.trim() === currentName) return;
    const initialTracks = structuredClone(store.tracks);
    const nextTracks = store.tracks.map((track) => track.id === trackId ? { ...track, name: nextName.trim() } : track);
    store.executeCommand(createTracksSnapshotCommand('Rename Timeline Track', initialTracks, nextTracks));
  };

  const handleDeleteTrack = (trackId: string) => {
    const store = useProjectStore.getState();
    const source = store.tracks.find((track) => track.id === trackId);
    if (!source) return;
    if (source.clips.length > 0) {
      const confirmed = window.confirm('This track contains clips. Delete the track and all its clips?');
      if (!confirmed) return;
    }
    const nextTracks = store.tracks.filter((track) => track.id !== trackId);
    store.executeCommand(createTracksSnapshotCommand('Delete Timeline Track', store.tracks, nextTracks));
    store.setSelectedNodeIds(store.selectedNodeIds.filter((clipId) => !source.clips.some((clip) => clip.id === clipId)));
  };

  const dispatchTimelineAction = (type: string, clipIds: string[] = []) => {
    window.dispatchEvent(
      new CustomEvent(`video-studio:timeline:${type}`, {
        detail: {
          clipIds,
          time: useProjectStore.getState().currentTime,
        },
      }),
    );
  };

  // Dynamic Compound Types
  const handleCompoundClips = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, executeCommand, setSelectedNodeIds, showToast } = store;

    if (selectedNodeIds.length < 2) {
      showToast('⚠️ Select at least 2 clips to combine!');
      return;
    }

    const selectedClips: { clip: ClipNode, track: Track }[] = [];
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (selectedNodeIds.includes(clip.id)) {
          selectedClips.push({ clip, track });
        }
      });
    });

    if (selectedClips.length < 2) return;

    let hasAudio = false;
    let hasVisual = false;

    selectedClips.forEach(({ track }) => {
      if (track.type === 'audio') hasAudio = true;
      if (track.type === 'video' || track.type === 'text' || track.type === 'effect') hasVisual = true;
    });

    let compoundType = '';
    let trackTypeTarget: 'video' | 'audio' | 'text' | 'effect' = 'video';
    
    if (hasAudio && !hasVisual) {
      compoundType = 'AudioSubmixNode';
      trackTypeTarget = 'audio';
    } else if (hasVisual && !hasAudio) {
      compoundType = 'VisualPrecompNode';
      trackTypeTarget = 'video';
    } else {
      compoundType = 'HybridCompoundNode';
      trackTypeTarget = 'video'; // Hybrid occupies visual by default, but linked
    }

    const minStart = Math.min(...selectedClips.map(c => c.clip.startAt));
    const maxEnd = Math.max(...selectedClips.map(c => c.clip.startAt + c.clip.duration));
    const mergedDuration = maxEnd - minStart;

    const firstSelected = selectedClips[0];
    if (!firstSelected) return;
    const firstClip = firstSelected.clip;

    const compoundClip: ClipNode = {
      ...firstClip,
      id: `compound_${Date.now()}`,
      startAt: minStart,
      duration: mergedDuration,
      trim: { in: 0, out: mergedDuration },
      properties: {
        ...firstClip.properties,
        name: `Compound (${compoundType})`,
        compoundType,
        subNodes: selectedClips.map(c => ({ clip: c.clip, originalTrackId: c.track.id, originalTrackType: c.track.type }))
      }
    };

    const initialTracks = structuredClone(tracks);
    let nextTracks = [...initialTracks];

    // Remove old clips
    nextTracks = nextTracks.map(t => ({
      ...t,
      clips: t.clips.filter(c => !selectedNodeIds.includes(c.id))
    }));

    // Find target track (create one if necessary or place on the top-most visual/audio track)
    let targetTrack = nextTracks.find(t => t.type === trackTypeTarget);
    if (!targetTrack) {
      const newTrackId = crypto.randomUUID();
      targetTrack = {
        id: newTrackId,
        type: trackTypeTarget,
        isLocked: false,
        isMuted: false,
        isVisible: true,
        clips: []
      };
      nextTracks.push(targetTrack);
    }
    
    // Actually we should place it on the track of the first selected clip if the type matches
    const firstSelectedTrack = selectedClips[0]?.track;
    const idealTrack = firstSelectedTrack
      ? nextTracks.find(t => t.id === firstSelectedTrack.id && t.type === trackTypeTarget)
      : undefined;
    if (idealTrack) {
      targetTrack = idealTrack;
    }

    targetTrack.clips.push(compoundClip);

    const cmd = createTracksSnapshotCommand('Combine Clips', initialTracks, nextTracks);
    executeCommand(cmd);
    setSelectedNodeIds([compoundClip.id]);
    showToast(`📦 Created ${compoundType} successfully!`);
  };

  const handleDeconstructCompound = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, executeCommand, setSelectedNodeIds, showToast } = store;

    if (selectedNodeIds.length !== 1) return;

    let targetTrack: Track | null = null;
    let compoundClip: ClipNode | null = null;

    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === selectedNodeIds[0]);
      if (clip && clip.properties.compoundType) {
        targetTrack = track;
        compoundClip = clip;
        break;
      }
    }

    if (!compoundClip || !targetTrack) {
      showToast('⚠️ Select a valid Compound Node to uncombine!');
      return;
    }

    const subNodes = compoundClip.properties.subNodes as { clip: ClipNode, originalTrackId: string, originalTrackType: 'video'|'audio'|'text'|'effect' }[];
    if (!subNodes || subNodes.length === 0) return;

    const initialTracks = structuredClone(tracks);
    let nextTracks = [...initialTracks];

    // Remove compound clip
    nextTracks = nextTracks.map(t => {
      if (t.id === targetTrack!.id) {
        return { ...t, clips: t.clips.filter(c => c.id !== compoundClip!.id) };
      }
      return t;
    });

    const newClipIds: string[] = [];

    // Smart Uncombine Routing
    subNodes.forEach(({ clip, originalTrackId, originalTrackType }) => {
      let destTrack = nextTracks.find(t => t.id === originalTrackId);
      
      const isOccupied = (track: Track) => {
        return track.clips.some(c => 
          (clip.startAt < c.startAt + c.duration) && (clip.startAt + clip.duration > c.startAt)
        );
      };

      if (!destTrack || isOccupied(destTrack)) {
        // Auto-generate new track
        const trackType = destTrack ? destTrack.type : (originalTrackType || 'video');
        const newTrackId = crypto.randomUUID();
        destTrack = {
          id: newTrackId,
          type: trackType,
          isLocked: false,
          isMuted: false,
          isVisible: true,
          clips: []
        };
        // Try to insert it near the original track if possible, or at the end
        const originalIndex = nextTracks.findIndex(t => t.id === originalTrackId);
        if (originalIndex !== -1) {
          nextTracks.splice(originalIndex + 1, 0, destTrack);
        } else {
          nextTracks.push(destTrack);
        }
      }

      destTrack.clips.push(clip);
      newClipIds.push(clip.id);
    });

    const cmd = createTracksSnapshotCommand('Deconstruct Compound', initialTracks, nextTracks);
    executeCommand(cmd);
    setSelectedNodeIds(newClipIds);
    showToast('🧩 Deconstructed compound clip successfully!');
  };

  // Global mouse handlers for Lasso Select & Click-to-Jump
  const handleWorkspaceMouseDown = (e: React.MouseEvent, trackId: string) => {
    if (e.button !== 0) return; // Left click only

    const target = e.target as HTMLElement;
    const clickedClip = target.closest<HTMLElement>('[data-clip-id]');

    // A plain click on empty timeline space must clear the current selection.
    // Modifier-clicks keep the existing selection so marquee selection can add/subtract.
    if (!clickedClip && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      setSelectedNodeIds([]);
    }
    
    const active = document.activeElement;
    if (active && active instanceof HTMLElement) {
      const tag = active.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && active.getAttribute('contenteditable') !== 'true') {
        active.blur();
      }
    }

    const startX = e.clientX;
    const startY = e.clientY;

    setLassoStart({ x: startX, y: startY });
    setLassoEnd({ x: startX, y: startY });
    setIsLassoing(false);
  };

  useEffect(() => {
    if (!lassoStart) return;

    const cachedClipRects = Array.from(
      document.querySelectorAll<HTMLElement>('[data-clip-id]'),
    ).map((elem) => ({
      id: elem.getAttribute('data-clip-id'),
      trackType: elem.getAttribute('data-track-type'),
      rect: elem.getBoundingClientRect(),
    }));

    let pendingEvent: MouseEvent | null = null;
    let rafId: number | null = null;

    const processLassoMove = () => {
      rafId = null;
      const event = pendingEvent;
      pendingEvent = null;
      if (!event || !lassoStart) return;

      const dx = event.clientX - lassoStart.x;
      const dy = event.clientY - lassoStart.y;

      if (!isLassoingRef.current && Math.sqrt(dx * dx + dy * dy) > 5) {
        isLassoingRef.current = true;
        setIsLassoing(true);
      }

      if (!isLassoingRef.current) return;

      setLassoEnd({ x: event.clientX, y: event.clientY });

      const left = Math.min(lassoStart.x, event.clientX);
      const right = Math.max(lassoStart.x, event.clientX);
      const top = Math.min(lassoStart.y, event.clientY);
      const bottom = Math.max(lassoStart.y, event.clientY);
      const filters = lassoFiltersRef.current;

      const intersectedIds: string[] = [];
      cachedClipRects.forEach(({ id, trackType, rect }) => {
        if (
          (trackType === 'video' && !filters.video) ||
          (trackType === 'audio' && !filters.audio) ||
          (trackType === 'text' && !filters.text) ||
          (trackType === 'effect' && !filters.effect)
        ) {
          return;
        }

        const overlaps = !(
          rect.right < left ||
          rect.left > right ||
          rect.bottom < top ||
          rect.top > bottom
        );

        if (overlaps && id) intersectedIds.push(id);
      });

      if (event.ctrlKey || event.metaKey) {
        setSelectedNodeIds(
          Array.from(
            new Set([
              ...selectedNodeIdsRef.current,
              ...intersectedIds,
            ]),
          ),
        );
      } else {
        setSelectedNodeIds(intersectedIds);
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      pendingEvent = e;
      if (rafId === null) {
        rafId = requestAnimationFrame(processLassoMove);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingEvent = null;
      if (!isLassoingRef.current && lassoStart) {
        if (workspaceRef.current) {
          const rect = workspaceRef.current.getBoundingClientRect();
          const clickedTime = Math.max(0, Math.min(totalDuration, pixelToTime(clientXToTimelinePixel({ clientX: e.clientX, workspaceRectLeft: rect.left, scrollLeft: workspaceRef.current.scrollLeft, pixelsPerSecond }), pixelsPerSecond)));
          setCurrentTime(clickedTime);
        }
      }
      setLassoStart(null);
      setLassoEnd(null);
      isLassoingRef.current = false;
      setIsLassoing(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [lassoStart, timelineWidth, totalDuration]);

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    if (activeDrag || isDraggingPlayhead || isLassoing) {
      setHoverTime(null);
      return;
    }
    const workspaceElement = workspaceRef.current;
    if (!workspaceElement) return;
    const rect = workspaceElement.getBoundingClientRect();
    const relativeX = clientXToTimelinePixel({ clientX: e.clientX, workspaceRectLeft: rect.left, scrollLeft: workspaceElement.scrollLeft, pixelsPerSecond });
    const visibleClientLeft = rect.left + TIMELINE_HEADER_WIDTH;
    if (e.clientX >= visibleClientLeft) {
      const time = Math.max(0, Math.min(totalDuration, pixelToTime(relativeX, pixelsPerSecond)));
      if (hoverScrubEnabled) {
        setHoverTime(time);
      } else {
        setHoverTime(null);
      }
    } else {
      setHoverTime(null);
    }
  };

  const handleWorkspaceMouseLeave = () => {
    setHoverTime(null);
  };


  // Split active node - immune to stale closures by querying the latest store state
  // Split selected clips at the project playhead using one canonical transaction.
  // With no selection, all clips under the playhead on unlocked tracks are split.
  const handleSplitNode = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, currentTime, executeCommand, setSelectedNodeIds, showToast } = store;

    const targetIds = selectedNodeIds.length > 0
      ? selectedNodeIds
      : tracks.flatMap((track) => track.isLocked
        ? []
        : track.clips
          .filter((clip) => currentTime > clip.startAt && currentTime < clip.startAt + clip.duration)
          .map((clip) => clip.id));

    if (targetIds.length === 0) {
      showToast('⚠️ نشانگر پخش روی کلیپی قرار ندارد تا برش داده شود!');
      return;
    }

    const result = splitTimelineClips(tracks, targetIds, currentTime);
    if (!result.changed) {
      showToast('⚠️ کلیپ قابل برش پیدا نشد؛ لایه ممکن است قفل باشد یا نشانگر روی لبه قرار گرفته باشد.');
      return;
    }

    executeCommand(createTracksSnapshotCommand(
      selectedNodeIds.length > 0 ? 'Split Clip(s)' : 'Split All Clips',
      tracks,
      result.tracks,
    ));
    setSelectedNodeIds([...result.affectedClipIds]);
    showToast(`✂️ ${result.affectedClipIds.length / 2} clip split operation(s) completed`);
  };

  // Select all clips across all tracks
  const handleSelectAll = () => {
    const store = useProjectStore.getState();
    const { tracks, setSelectedNodeIds, showToast } = store;
    const allClipIds: string[] = [];
    tracks.forEach(t => t.clips.forEach(c => allClipIds.push(c.id)));
    if (allClipIds.length > 0) {
      setSelectedNodeIds(allClipIds);
      showToast('✨ تمام کلیپ‌های تایملاین انتخاب شدند!');
    } else {
      showToast('⚠️ کلیپی در تایملاین وجود ندارد!');
    }
  };

  // Copy selected clips to the timeline clipboard. Preserves multi-clip relative timing and source tracks.
  const handleCopyNode = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, setClipboard, showToast } = store;
    const result = buildTimelineClipboard(tracks, selectedNodeIds);
    if (!result) {
      showToast('⚠️ ابتدا حداقل یک کلیپ را جهت کپی انتخاب کنید!');
      return;
    }
    setClipboard(result.clipboard);
    showToast(`📋 ${result.count} کلیپ کپی شد`);
  };

  // Cut selected clips to the timeline clipboard and delete them atomically.
  const handleCutNode = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, setClipboard, executeCommand, setSelectedNodeIds, showToast } = store;
    const result = buildTimelineClipboard(tracks, selectedNodeIds);
    if (!result) {
      showToast('⚠️ ابتدا حداقل یک کلیپ را جهت برش انتخاب کنید!');
      return;
    }

    const nextTracks = tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => !selectedNodeIds.includes(clip.id)),
    }));

    setClipboard(result.clipboard);
    executeCommand(createTracksSnapshotCommand('Cut Clips', tracks, nextTracks));
    setSelectedNodeIds([]);
    showToast(`✂️ ${result.count} کلیپ بریده شد`);
  };

  // Paste all clipboard items at the current playhead while preserving relative offsets.
  const handlePasteNode = () => {
    const store = useProjectStore.getState();
    const { clipboard, tracks, currentTime, executeCommand, setSelectedNodeIds, showToast } = store;
    if (!clipboard) {
      showToast('⚠️ حافظه کپی خالی است!');
      return;
    }

    const materialized = materializeTimelineClipboard(clipboard, tracks, currentTime);
    if (!materialized) {
      showToast('⚠️ برای جایگذاری کلیپ‌ها Track مناسب و قفل‌نشده پیدا نشد!');
      return;
    }

    executeCommand(createTracksSnapshotCommand('Paste Clips', tracks, materialized.tracks));
    setSelectedNodeIds(materialized.pastedIds);
    showToast(`📋 ${materialized.pastedIds.length} کلیپ جایگذاری شد`);
  };

  /**
   * Durable save (IndexedDB). The controller owns the messaging so this entry
   * point cannot report a success that the storage layer did not deliver.
   */
  const handleSaveProject = () => {
    void saveCurrentProject(projectName);
  };

  // Delete active node - immune to stale closures by querying the latest store state
  const handleDeleteNode = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, executeCommand, setSelectedNodeIds, showToast } = store;
    if (selectedNodeIds.length === 0) return;

    const result = deleteSelectedTimelineClips(tracks, selectedNodeIds);
    if (!result.changed) {
      showToast('❌ کلیپ انتخاب‌شده در لایه قفل‌شده قرار دارد یا قابل حذف نیست.');
      return;
    }

    executeCommand(createTracksSnapshotCommand('Delete Clip(s)', tracks, result.tracks));
    setSelectedNodeIds([]);
    showToast(`🗑️ ${result.affectedClipIds.length} clip(s) deleted`);
  };

  const handleRippleDeleteNode = () => {
    const store = useProjectStore.getState();
    const { selectedNodeIds, tracks, executeCommand, setSelectedNodeIds, showToast } = store;
    if (selectedNodeIds.length === 0) {
      showToast('⚠️ لطفا ابتدا کلیپ‌های مورد نظر را در تایملاین انتخاب کنید!');
      return;
    }

    const result = rippleDeleteTimelineClips(tracks, selectedNodeIds);
    if (!result.changed) {
      showToast('❌ کلیپ‌های انتخاب‌شده در لایه قفل‌شده هستند یا قابل حذف نیستند.');
      return;
    }

    executeCommand(createTracksSnapshotCommand('Ripple Delete Clip(s)', tracks, result.tracks));
    setSelectedNodeIds([]);
    showToast('💥 Ripple Delete completed on the affected lanes');
  };

  // Continuous Keydown Smooth Scrubber hold logic
  useEffect(() => {
    let animationFrameId: number;
    let lastTick = performance.now();
    
    const scrubLoop = () => {
      const direction = activeScrubRef.current;
      if (direction) {
        const store = useProjectStore.getState();
        const fps = store.metadata.fps || 30;
        const now = performance.now();
        if (now - lastTick >= 33.3) {
          const delta = scrubSpeedRef.current === 10 ? (10 / fps) : (1 / fps);
          if (direction === 'right') {
            store.setCurrentTime(Math.min(store.totalDuration, store.currentTime + delta));
          } else {
            store.setCurrentTime(Math.max(0, store.currentTime - delta));
          }
          lastTick = now;
        }
      }
      animationFrameId = requestAnimationFrame(scrubLoop);
    };
    
    animationFrameId = requestAnimationFrame(scrubLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Keyboard Shortcuts Bindings (Zero Re-binding architecture)
  useEffect(() => {
    const isUserTyping = () => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (active.getAttribute('contenteditable') === 'true') return true;
      const role = active.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUserTyping()) return;
      
      // Shift + Z (Fit to Screen)
      if (e.key.toLowerCase() === 'z' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const store = useProjectStore.getState();
        const { totalDuration, setTimelineZoom } = store;
        const workspace = workspaceRef.current;
        if (workspace && totalDuration > 0) {
          const availableWidth = workspace.clientWidth - 160 - 40; // 160 for track headers, 40 for padding
          const targetPixelsPerSecond = availableWidth / totalDuration;
          const newZoom = Math.max(0.01, Math.min(20.0, targetPixelsPerSecond / basePixelsPerSecond));
          setTimelineZoom(newZoom);
          if (workspaceRef.current) {
            setVisibleTimeRange(getVisibleTimeRange(
              workspaceRef.current.scrollLeft,
              workspaceRef.current.clientWidth,
              basePixelsPerSecond * newZoom
            ));
          }
        }
        return;
      }
      
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleSplitNode();
        return;
      }

      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          handleDeconstructCompound();
        } else {
          handleCompoundClips();
        }
        return;
      }
      
      const action = defaultKeymap.find(act => isActionMatched(act, e));
      if (!action) return;
      
      e.preventDefault();
      
      const store = useProjectStore.getState();
      const { 
        tracks, currentTime, totalDuration, 
        timelineZoom, setTimelineZoom, setCurrentTime,
        isPlaying, setIsPlaying, showToast,
        setMarkIn, setMarkOut, setActiveTool
      } = store;

      switch (action.id) {
        case 'select_all':
          handleSelectAll();
          break;
        case 'copy':
          handleCopyNode();
          break;
        case 'paste':
          handlePasteNode();
          break;
        case 'cut':
          handleCutNode();
          break;
        case 'save_project':
          handleSaveProject();
          break;
        case 'split':
          handleSplitNode();
          break;
        case 'delete':
          handleDeleteNode();
          break;
        case 'ripple_delete':
          handleRippleDeleteNode();
          break;
        case 'tool_retiming':
          setActiveTool('rate-stretch');
          showToast('⏱️ ابزار تغییر سرعت (Retiming Tool) فعال شد');
          break;
        case 'tool_selection':
          setActiveTool('select');
          showToast('🎯 ابزار انتخاب (Selection Tool) فعال شد');
          break;
        case 'undo':
          useHistoryStore.getState().undo();
          showToast('↩️ Undo');
          break;
        case 'redo':
          useHistoryStore.getState().redo();
          showToast('↪️ Redo');
          break;
        case 'play_pause':
          setIsPlaying(!isPlaying);
          showToast(!isPlaying ? '▶️ پخش ویدیو' : '⏸️ توقف ویدیو');
          break;
        case 'frame_forward':
          if (!e.repeat) {
            activeScrubRef.current = 'right';
            scrubSpeedRef.current = 1;
          }
          break;
        case 'frame_backward':
          if (!e.repeat) {
            activeScrubRef.current = 'left';
            scrubSpeedRef.current = 1;
          }
          break;
        case 'ten_frames_forward':
          if (!e.repeat) {
            activeScrubRef.current = 'right';
            scrubSpeedRef.current = 10;
          }
          break;
        case 'ten_frames_backward':
          if (!e.repeat) {
            activeScrubRef.current = 'left';
            scrubSpeedRef.current = 10;
          }
          break;
        case 'jump_prev_cut': {
          const cuts = new Set<number>([0]);
          tracks.forEach(t => t.clips.forEach(c => {
            cuts.add(c.startAt);
            cuts.add(c.startAt + c.duration);
          }));
          const sorted = Array.from(cuts).sort((a, b) => a - b);
          const prev = sorted.reverse().find(c => c < currentTime - 0.05);
          if (prev !== undefined) {
            setCurrentTime(prev);
            showToast('⏮️ پرش به کات قبلی');
          } else {
            setCurrentTime(0);
          }
          break;
        }
        case 'jump_next_cut': {
          const cuts = new Set<number>([0]);
          tracks.forEach(t => t.clips.forEach(c => {
            cuts.add(c.startAt);
            cuts.add(c.startAt + c.duration);
          }));
          const sorted = Array.from(cuts).sort((a, b) => a - b);
          const next = sorted.find(c => c > currentTime + 0.05);
          if (next !== undefined) {
            setCurrentTime(next);
            showToast('⏭️ پرش به کات بعدی');
          } else {
            setCurrentTime(totalDuration);
          }
          break;
        }
        case 'set_in_point':
          setMarkIn(currentTime);
          showToast(`📥 نقطه ورود ثبت شد: ${currentTime.toFixed(1)}s`);
          break;
        case 'set_out_point':
          setMarkOut(currentTime);
          showToast(`📤 نقطه خروج ثبت شد: ${currentTime.toFixed(1)}s`);
          break;
        case 'zoom_in':
          setTimelineZoom(Math.min(20.0, parseFloat((timelineZoom * 1.35).toFixed(3))));
          break;
        case 'zoom_out':
          setTimelineZoom(Math.max(0.01, parseFloat((timelineZoom / 1.35).toFixed(3))));
          break;
        case 'zoom_fit': {
          const computedZoom = Math.max(0.01, Math.min(20.0, 900 / (totalDuration * basePixelsPerSecond)));
          setTimelineZoom(computedZoom);
          showToast('🔍 بزرگنمایی هم‌اندازه صفحه (Fit View)');
          break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.code ? e.code.toLowerCase() : e.key.toLowerCase();
      if (key === 'arrowright' || key === 'arrowleft') {
        activeScrubRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Ctrl + MouseWheel Horizontal Zooming inside timeline workspace
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (!workspaceRef.current) return;
        
        const workspace = workspaceRef.current;
        const rect = workspace.getBoundingClientRect();
        const mouseX = e.clientX - rect.left + workspace.scrollLeft - 160;
        
        if (mouseX < 0) return;
        
        const store = useProjectStore.getState();
        const { timelineZoom, setTimelineZoom, totalDuration } = store;
        
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newZoom = Math.max(0.01, Math.min(20.0, timelineZoom * zoomFactor));
        
        if (newZoom !== timelineZoom) {
          const timeUnderCursor = pixelToTime(mouseX, pixelsPerSecond);
          
          setTimelineZoom(newZoom);
          
          requestAnimationFrame(() => {
            if (workspaceRef.current) {
              const newPixelsPerSecond = basePixelsPerSecond * newZoom;
              const newMouseX = timeToPixel(timeUnderCursor, newPixelsPerSecond);
              workspaceRef.current.scrollLeft = Math.max(0, newMouseX + 160 - (e.clientX - rect.left));
              
              setVisibleTimeRange(getVisibleTimeRange(
                workspaceRef.current.scrollLeft,
                workspaceRef.current.clientWidth,
                newPixelsPerSecond
              ));
            }
          });
        }
      }
    };

    workspace.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      workspace.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Timeline mouse events to update playhead position (Scroll-Aware)
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLButtonElement) return;

    // Blur any active element (like focused buttons or non-text elements) to focus window keyboard events
    const active = document.activeElement;
    if (active && active instanceof HTMLElement) {
      const tag = active.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && active.getAttribute('contenteditable') !== 'true') {
        active.blur();
      }
    }

    setIsDraggingPlayhead(true);
    updatePlayheadPosition(e);
  };

  const updatePlayheadPosition = (e: React.MouseEvent | MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    setCurrentTime(Math.max(0, Math.min(totalDuration, pixelToTime(clickX, pixelsPerSecond))));
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      updatePlayheadPosition(e);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead]);


  const { handleClipMouseDown, handleClipDoubleClick } = useTimelineClipInteraction({
    activeTool,
    professionalTrimTool,
    linkedSelectionEnabled,
    totalDuration,
    pixelsPerSecond,
    workspaceRef,
    setActiveDrag,
    setEditingTextClipId,
    handleSplitClipAtTime,
  });

  // Document-level Timeline drag execution (move / trim / rate stretch).
  useTimelineDragExecution({
    activeDrag,
    magneticSnapping,
    rippleMode,
    timelineEditMode,
    currentTime,
    pixelsPerSecond,
    workspaceRef,
    setActiveDrag,
    setSnapLineTime,
  });

  // Audio waveform rendering deterministic pseudo-data
  const getWaveformData = (clip: ClipNode) => {
    if (clip.properties.waveformData) return clip.properties.waveformData;
    const peaks = [];
    const seed = clip.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    for (let i = 0; i < 35; i++) {
      const val = Math.abs(Math.sin(seed + i * 0.95)) * 70 + 15;
      peaks.push(val);
    }
    return peaks;
  };

  const getClipBgClass = (type: string, isSelected: boolean) => {
    const selected = isSelected
      ? 'ring-1 ring-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] z-20'
      : 'hover:brightness-110';

    switch (type) {
      case 'text':
        return `bg-[#d99124] border-[#f2b94b] text-[#fff4d9] ${selected}`;
      case 'audio':
        return `bg-[#0b4f69] border-[#146a8a] text-[#dff7ff] ${selected}`;
      case 'effect':
        return `bg-[#b85c34] border-[#d98357] text-[#fff0e8] ${selected}`;
      default: // video / image / visual clips
        return `bg-[#0b6b72] border-[#118a92] text-[#e9ffff] ${selected}`;
    }
  };

  const getClipPreviewSource = (clip: ClipNode): string | null => {
    const value = [
      clip.properties?.thumbnailUrl,
      clip.properties?.thumbnail,
      clip.properties?.imageUrl,
      clip.properties?.videoThumbnail,
      clip.properties?.videoUrl,
    ].find((candidate) =>
      typeof candidate === 'string' &&
      /^(blob:|data:|https?:\/\/|file:)/i.test(candidate),
    );

    return typeof value === 'string' ? value : null;
  };

  const getClipDisplayName = (clip: ClipNode): string => {
    return String(
      clip.properties?.name ||
      clip.properties?.textContent ||
      'Untitled Clip',
    );
  };

  const formatTimelineTimecode = (seconds: number): string => {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleContextMenu = (e: React.MouseEvent, clipId?: string, trackId?: string) => {
    e.preventDefault();

    if (clipId) {
      const currentSelection = useProjectStore.getState().selectedNodeIds;

      const nextSelection = resolveClipSelection({
        selectedIds: currentSelection,
        allClips: tracks.flatMap((track) => track.clips),
        clickedClipId: clipId,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      });

      const shouldApplyLinkedSelection =
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey;

      setSelectedNodeIds(
        resolveLinkedSelection(
          tracks,
          nextSelection,
          shouldApplyLinkedSelection && linkedSelectionEnabled,
        ),
      );
    }

    let clickedTime = 0;
    if (workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const relativeX = clientXToTimelinePixel({ clientX: e.clientX, workspaceRectLeft: rect.left, scrollLeft: workspaceRef.current.scrollLeft, pixelsPerSecond });
      if (e.clientX >= rect.left + TIMELINE_HEADER_WIDTH) {
        clickedTime = Math.max(0, Math.min(totalDuration, pixelToTime(relativeX, pixelsPerSecond)));
      }
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      clipId,
      trackId,
      time: clickedTime
    });
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setTrackMenuId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0b0c10] text-gray-200 select-none font-sans">
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        accept="video/*,audio/*,image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const mode = pendingFileActionRef.current;
          pendingFileActionRef.current = null;
          event.currentTarget.value = '';
          if (file && mode) handleLinkOrReplaceMediaFile(file, mode);
        }}
      />
      <input
        ref={linkMediaInputRef}
        type="file"
        className="hidden"
        accept="video/*,audio/*,image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const mode = pendingFileActionRef.current;
          pendingFileActionRef.current = null;
          event.currentTarget.value = '';
          if (file && mode) handleLinkOrReplaceMediaFile(file, mode);
        }}
      />
      <TimelineToolbar
        handleAddTrack={handleAddTrack}
        activeTool={activeTool}
        handleSetActiveTool={handleSetActiveTool}
        handleSelectAll={handleSelectAll}
        handleCopyNode={handleCopyNode}
        handleCutNode={handleCutNode}
        handlePasteNode={handlePasteNode}
        handleSplitNode={handleSplitNode}
        handleTrimBeforePlayhead={handleTrimBeforePlayhead}
        handleTrimAfterPlayhead={handleTrimAfterPlayhead}
        handleDeleteNode={handleDeleteNode}
        handleRippleDeleteNode={handleRippleDeleteNode}
        handleCompoundClips={handleCompoundClips}
        handleDeconstructCompound={handleDeconstructCompound}
        handleMirrorSelected={handleMirrorSelected}
        handleVariableSpeedAnimation={handleVariableSpeedAnimation}
        hoverScrubEnabled={hoverScrubEnabled}
        setHoverScrubEnabled={setHoverScrubEnabled}
        magneticSnapping={magneticSnapping}
        setMagneticSnapping={setMagneticSnapping}
        rippleMode={rippleMode}
        timelineEditMode={timelineEditMode}
        setTimelineEditMode={setTimelineEditMode}
        setRippleMode={setRippleMode}
        linkedSelectionEnabled={linkedSelectionEnabled}
        handleToggleLinkedSelection={handleToggleLinkedSelection}
        handleFitTimeline={handleFitTimeline}
        timelineZoom={timelineZoom}
        setTimelineZoom={setTimelineZoom}
        professionalTrimTool={professionalTrimTool}
        setProfessionalTrimTool={(value) => {
          setProfessionalTrimTool(value);
          showToast(value === 'roll' ? '↔️ Roll Edit tool' : value === 'slip' ? '↔️ Slip Edit tool' : '🖱️ Standard Edit tool');
        }}
        showFindReplace={showFindReplace}
        setShowFindReplace={setShowFindReplace}
        findText={findText}
        setFindText={setFindText}
        replaceText={replaceText}
        setReplaceText={setReplaceText}
        searchMatches={searchMatches}
        currentMatchIndex={currentMatchIndex}
        handleFindNext={handleFindNext}
        handleReplaceCurrent={handleReplaceCurrent}
        handleReplaceAll={handleReplaceAll}
        setShowShortcutsModal={setShowShortcutsModal}
        lassoFilters={lassoFilters}
        setLassoFilters={setLassoFilters}
        showToast={showToast}
        performTextSearch={performTextSearch}
        setSearchMatches={setSearchMatches}
      />

      <TimelineWorkspace
        workspaceRef={workspaceRef}
        timelineRef={timelineRef}
        timelineWidth={timelineWidth}
        basePixelsPerSecond={basePixelsPerSecond}
        timelineZoom={timelineZoom}
        totalDuration={totalDuration}
        currentTime={currentTime}
        hoverTime={hoverTime}
        hoverScrubEnabled={hoverScrubEnabled}
        snapLineTime={snapLineTime}
        markIn={markIn}
        markOut={markOut}
        visibleTimeRange={visibleTimeRange}
        setVisibleTimeRange={setVisibleTimeRange}
        setHoverTime={setHoverTime}
        handleTimelineMouseDown={handleTimelineMouseDown}
        handleWorkspaceMouseDown={handleWorkspaceMouseDown}
        handleWorkspaceMouseMove={handleWorkspaceMouseMove}
        activeDrag={activeDrag}
        editingTextClipId={editingTextClipId}
        setEditingTextClipId={setEditingTextClipId}
        trackMenuId={trackMenuId}
        setTrackMenuId={setTrackMenuId}
        handleContextMenu={handleContextMenu}
        handleClipMouseDown={handleClipMouseDown}
        handleClipDoubleClick={handleClipDoubleClick}
        handleRenameTrack={handleRenameTrack}
        handleDuplicateTrack={handleDuplicateTrack}
        handleAddTrack={handleAddTrack}
        handleDeleteTrack={handleDeleteTrack}
        handleAssetDrop={handleTimelineAssetDrop}
      />

      {/* Visual Lasso Selection Box overlay */}
      {isLassoing && lassoStart && lassoEnd && (
        <div 
          style={{
            left: Math.min(lassoStart.x, lassoEnd.x),
            top: Math.min(lassoStart.y, lassoEnd.y),
            width: Math.abs(lassoStart.x - lassoEnd.x),
            height: Math.abs(lassoStart.y - lassoEnd.y)
          }}
          className="fixed border border-purple-400 bg-purple-500/10 pointer-events-none z-[90] rounded-sm shadow-[0_0_8px_rgba(168,85,247,0.2)]"
        />
      )}

      {/* Context Menu Component */}
      {/* Context Menu — Screenshot parity / real actions */}
      {contextMenu && (
        <TimelineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          clip={selectedContextClip}
          track={selectedContextTrack}
          hasClipboard={Boolean(clipboard)}
          hasAttributesClipboard={Boolean(attributesClipboard)}
          selectedCount={selectedNodeIds.length}
          canPaste={Boolean(clipboard)}
          canSplit={Boolean(selectedContextClip && contextMenu.time !== undefined)}
          canTrim={Boolean(selectedContextClip && contextMenu.time !== undefined)}
          canSeparateAudio={contextHasVideo}
          canRecoverAudio={contextHasVideo}
          canSyncAudio={contextHasVideo && contextHasAudio}
          canImageToVideo={Boolean(selectedContextClip?.properties.imageUrl)}
          canSplitScenes={contextHasVideo}
          canGroup={selectedNodeIds.length >= 2}
          canUngroup={selectedContextClips.some((candidateClip) => typeof candidateClip.properties.groupId === 'string')}
          canExport={selectedNodeIds.length > 0}
          canRender={selectedNodeIds.length > 0}
          onAction={handleContextAction}
          onClose={() => {
            setContextMenu(null);
            setContextSubmenu(null);
          }}
        />
      )}
      {/* Visual Lasso Selection Box Overlay */}
      {isLassoing && lassoStart && lassoEnd && (
        <div 
          style={{
            position: 'fixed',
            left: Math.min(lassoStart.x, lassoEnd.x),
            top: Math.min(lassoStart.y, lassoEnd.y),
            width: Math.abs(lassoStart.x - lassoEnd.x),
            height: Math.abs(lassoStart.y - lassoEnd.y),
            pointerEvents: 'none',
            zIndex: 9999
          }}
          className="border border-purple-500 bg-purple-500/10 rounded-sm shadow-[0_0_12px_rgba(168,85,247,0.3)] animate-pulse"
        />
      )}

      {/* Keyboard Shortcuts Persian Modal */}
      <TimelineShortcutsModal isOpen={showShortcutsModal} onClose={() => setShowShortcutsModal(false)} />
    </div>
  );
};
