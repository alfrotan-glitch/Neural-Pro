import { create } from 'zustand';
import { ProjectState, Track, ClipNode, UUID } from '../features/video-studio/project/types/project';
import { useHistoryStore } from './useHistoryStore';
import { Command } from '../core/commands/types';
import { buildPropertySnapshots, UpdateClipPropertiesCommand, UpdateTrackStateCommand } from '../features/video-studio/project/commands';
import { assertValidProjectState, normalizeSelectedNodeIds, assertNoLockedTrackContentMutation } from '../features/video-studio/project/validation';
import { deriveTrackStates } from '../features/video-studio/project/services/trackStateService';
import { calculateProjectDuration, clampProjectTime } from '../core/engine/projectDuration';
import type { TimelineClipboard } from '../features/video-studio/timeline/services/timelineClipboardService';
import type { SetAnimationKeyframeInput } from '../features/video-studio/animation/commands';
import { AutoKeyframeTransformCommand, SetAnimationKeyframeCommand } from '../features/video-studio/animation/commands';

interface ProjectStore extends ProjectState {
  /** Compatibility cache derived from Track model. Track fields are the source of truth. */
  trackStates: Record<string, { visible: boolean; locked: boolean; muted: boolean; collapsed?: boolean }>;
  rippleMode: boolean;
  timelineEditMode: 'normal' | 'ripple' | 'overwrite';
  magneticSnapping: boolean;
  timelineZoom: number;
  markIn: number | null;
  markOut: number | null;
  activeTool: 'select' | 'rate-stretch' | 'split';
  clipboard: TimelineClipboard | null;
  hoverTime: number | null;
  toastMessage: string | null;
  theme: 'dark' | 'light';

  // Actions
  setCurrentTime: (time: number) => void;
  setTotalDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedNodeIds: (ids: UUID[]) => void;
  setSelectedKeyframeIds: (ids: string[]) => void;
  updateNodeProperty: (id: UUID, path: string, value: unknown) => void;
  updateNodesProperty: (ids: UUID[], path: string, value: unknown) => void;
  setAnimationKeyframe: (input: SetAnimationKeyframeInput) => void;
  autoKeyframeEnabled: boolean;
  setAutoKeyframeEnabled: (enabled: boolean) => void;
  executeCommand: (command: Command) => void;
  setRippleMode: (val: boolean) => void;
  setTimelineEditMode: (mode: 'normal' | 'ripple' | 'overwrite') => void;
  setMagneticSnapping: (val: boolean) => void;
  setTimelineZoom: (val: number) => void;
  setMarkIn: (val: number | null) => void;
  setMarkOut: (val: number | null) => void;
  setActiveTool: (val: 'select' | 'rate-stretch' | 'split') => void;
  setClipboard: (val: TimelineClipboard | null) => void;
  setHoverTime: (val: number | null) => void;
  setToastMessage: (msg: string | null) => void;
  showToast: (msg: string) => void;
  toggleTrackState: (trackId: string, property: 'visible' | 'locked' | 'muted' | 'collapsed') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  
  /** Apply persisted/imported project state without creating an editing-history entry.
   *  This is intentionally limited to hydration/recovery flows, not user edits.
   */
  hydrateTracks: (tracks: Track[]) => void;
  hydrateProject: (project: ProjectState) => void;
}

export const EMPTY_ANIMATIONS: any[] = [];
export const EMPTY_STRING_ARRAY: string[] = [];

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projectId: 'proj_default_capcut',
  metadata: {
    title: 'Croissant Masterclass Recipe',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
  },
  currentTime: 0,
  totalDuration: 0,
  isPlaying: false,
  autoKeyframeEnabled: false,
  selectedNodeIds: ['t1'],
  selectedKeyframeIds: EMPTY_STRING_ARRAY,
  animations: EMPTY_ANIMATIONS,
  tracks: [
    {
      id: 'track_text_captions',
      type: 'text',
      isLocked: false,
      isMuted: false,
      isVisible: true,
      clips: [
        {
          id: 't1',
          sourceId: 't1_src',
          startAt: 2.0,
          duration: 8.0,
          trim: { in: 0, out: 8.0 },
          transform: { x: 0, y: 65, scale: 120, rotation: 0, opacity: 100 },
          properties: {
            name: 'Welcome Text overlay',
            textContent: 'How to Bake the Perfect Croissant 🥐',
            fontFamily: 'Inter',
            fontSize: 24,
            textColor: '#ffffff',
            color: 'from-indigo-600 to-indigo-500'
          }
        },
        {
          id: 't2',
          sourceId: 't2_src',
          startAt: 12.05,
          duration: 4.15,
          trim: { in: 0, out: 4.15 },
          transform: { x: 0, y: 65, scale: 100, rotation: 0, opacity: 100 },
          properties: {
            name: 'Instruction text overlay',
            textContent: "Noticing means paying attention. That's simple, isn't it?",
            fontFamily: 'Inter',
            fontSize: 22,
            textColor: '#ffff00',
            color: 'from-pink-600 to-pink-500',
            words: [
              { word: "Noticing", start: 12.05, end: 12.50 },
              { word: "means", start: 12.55, end: 13.10 },
              { word: "paying", start: 13.15, end: 13.50 },
              { word: "attention.", start: 13.55, end: 14.10 },
              { word: "That's", start: 14.20, end: 14.60 },
              { word: "simple,", start: 14.65, end: 15.00 },
              { word: "isn't", start: 15.05, end: 15.15 },
              { word: "it?", start: 15.18, end: 16.20 }
            ]
          }
        }
      ]
    },
    {
      id: 'track_effects',
      type: 'effect',
      isLocked: false,
      isMuted: false,
      isVisible: true,
      clips: []
    },
    {
      id: 'track_video_main',
      type: 'video',
      isLocked: false,
      isMuted: false,
      isVisible: true,
      clips: [
        {
          id: 'v1_clip',
          sourceId: 'v1',
          startAt: 0.0,
          duration: 18.5,
          trim: { in: 0, out: 18.5 },
          transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 },
          properties: { 
            name: 'cooking_baking_process.mp4', 
            color: 'from-amber-600 to-yellow-500', 
            thumbnail: '🎬',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
          }
        },
        {
          id: 'v2_clip',
          sourceId: 'v2',
          startAt: 18.5,
          duration: 12.0,
          trim: { in: 0, out: 12.0 },
          transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 },
          properties: { 
            name: 'asmr_close_up_mixing.mp4', 
            color: 'from-orange-600 to-red-500', 
            thumbnail: '🎬',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
          }
        },
        {
          id: 'v3_clip',
          sourceId: 'v3',
          startAt: 30.5,
          duration: 14.5,
          trim: { in: 0, out: 14.5 },
          transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 },
          properties: { 
            name: 'aesthetic_kitchen_lighting.mp4', 
            color: 'from-teal-600 to-blue-500', 
            thumbnail: '🎬',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
          }
        }
      ],
    },
    {
      id: 'track_audio_bg',
      type: 'audio',
      isLocked: false,
      isMuted: false,
      isVisible: true,
      clips: [
        {
          id: 'a1_bg',
          sourceId: 'a1',
          startAt: 0.0,
          duration: 45.0,
          trim: { in: 0, out: 45.0 },
          transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 80 },
          properties: { 
            name: 'lofi_ambient_vibes.mp3', 
            color: 'from-purple-600 to-pink-500', 
            thumbnail: '🎵',
            audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            levelDb: 0,
            pan: 0,
            noiseReduction: false,
            enhanceVoice: false,
            waveformData: [12, 24, 45, 18, 30, 15, 48, 60, 32, 14, 25, 40, 20, 33, 52, 12, 18, 44, 55, 30, 22, 15, 38, 48, 32, 20, 42, 58, 28, 12, 14, 33, 40]
          }
        }
      ],
    }
  ],
  trackStates: {
    'track_video_main': { visible: true, locked: false, muted: false },
    'track_audio_bg': { visible: true, locked: false, muted: false },
    'track_text_captions': { visible: true, locked: false, muted: false },
    'track_effects': { visible: true, locked: false, muted: false }
  },
  rippleMode: false,
  timelineEditMode: 'normal',
  magneticSnapping: true,
  timelineZoom: 1.0,
  markIn: null,
  markOut: null,
  activeTool: 'select',
  clipboard: null,
  hoverTime: null,
  toastMessage: null,
  theme: 'dark',

  setCurrentTime: (time: number) => {
    const duration = get().totalDuration;
    const clamped = clampProjectTime(time, duration);
    if (Math.abs(get().currentTime - clamped) < 0.0001) return;
    set({ currentTime: clamped });
  },
  setTotalDuration: (_duration: number) => {
    const state = get();
    const totalDuration = calculateProjectDuration(state.tracks);
    const clampedTime = clampProjectTime(state.currentTime, totalDuration);
    if (Math.abs(state.totalDuration - totalDuration) < 0.0001 && Math.abs(state.currentTime - clampedTime) < 0.0001) return;
    set({
      totalDuration,
      currentTime: clampedTime,
    });
  },
  setIsPlaying: (isPlaying: boolean) => {
    if (get().isPlaying === isPlaying) return;
    set({ isPlaying });
  },
  setSelectedNodeIds: (ids: UUID[]) => {
    const state = get();
    const normalized = normalizeSelectedNodeIds(state.tracks, ids);
    if (
      normalized.length === state.selectedNodeIds.length &&
      normalized.every((id, idx) => id === state.selectedNodeIds[idx])
    ) {
      return;
    }
    set({ selectedNodeIds: normalized });
  },
  setSelectedKeyframeIds: (ids: string[]) => {
    const unique = [...new Set(ids)];
    const current = get().selectedKeyframeIds || [];
    if (
      unique.length === current.length &&
      unique.every((id, idx) => id === current[idx])
    ) {
      return;
    }
    set({ selectedKeyframeIds: unique });
  },
  setRippleMode: (val: boolean) => {
    if (get().rippleMode === val && get().timelineEditMode === (val ? 'ripple' : 'normal')) return;
    set({ rippleMode: val, timelineEditMode: val ? 'ripple' : 'normal' });
  },
  setTimelineEditMode: (mode) => {
    const isRipple = mode === 'ripple';
    if (get().timelineEditMode === mode && get().rippleMode === isRipple) return;
    set({ timelineEditMode: mode, rippleMode: isRipple });
  },
  setMagneticSnapping: (val: boolean) => {
    if (get().magneticSnapping === val) return;
    set({ magneticSnapping: val });
  },
  setTimelineZoom: (val: number) => {
    if (Math.abs(get().timelineZoom - val) < 0.0001) return;
    set({ timelineZoom: val });
  },
  setMarkIn: (val: number | null) => {
    if (get().markIn === val) return;
    set({ markIn: val });
  },
  setMarkOut: (val: number | null) => {
    if (get().markOut === val) return;
    set({ markOut: val });
  },
  setActiveTool: (val: 'select' | 'rate-stretch' | 'split') => {
    if (get().activeTool === val) return;
    set({ activeTool: val });
  },
  setClipboard: (val) => set({ clipboard: val }),
  setHoverTime: (val: number | null) => {
    if (get().hoverTime === val) return;
    set({ hoverTime: val });
  },
  setToastMessage: (msg: string | null) => {
    if (get().toastMessage === msg) return;
    set({ toastMessage: msg });
  },
  setTheme: (theme: 'dark' | 'light') => {
    if (get().theme === theme) return;
    set({ theme });
  },

  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 2500);
  },

  hydrateTracks: (tracks: Track[]) => {
    const totalDuration = calculateProjectDuration(tracks);
    const state = get();
    const hydrated: ProjectState = {
      ...state,
      tracks: structuredClone(tracks),
      totalDuration,
      currentTime: clampProjectTime(state.currentTime, totalDuration),
      isPlaying: false,
      selectedNodeIds: normalizeSelectedNodeIds(tracks, state.selectedNodeIds),
    };
    assertValidProjectState(hydrated);
    set({
      ...hydrated,
      trackStates: deriveTrackStates(hydrated.tracks),
    });
  },

  hydrateProject: (project: ProjectState) => {
    const totalDuration = calculateProjectDuration(project.tracks);
    const hydrated: ProjectState = {
      ...structuredClone(project),
      totalDuration,
      currentTime: clampProjectTime(project.currentTime, totalDuration),
      isPlaying: false,
      selectedNodeIds: normalizeSelectedNodeIds(project.tracks, project.selectedNodeIds),
    };
    assertValidProjectState(hydrated);
    useHistoryStore.getState().resetHistory();
    set({ ...hydrated, trackStates: deriveTrackStates(hydrated.tracks) });
  },

  toggleTrackState: (trackId: string, property: 'visible' | 'locked' | 'muted' | 'collapsed') => {
    const state = get();
    const track = state.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;

    const currentValue = property === 'visible'
      ? track.isVisible
      : property === 'locked'
        ? track.isLocked
        : property === 'muted'
          ? track.isMuted
          : Boolean(track.isCollapsed);

    get().executeCommand(
      new UpdateTrackStateCommand(
        trackId,
        property,
        currentValue,
        !currentValue,
      ),
    );
  },

  updateNodeProperty: (id: UUID, path: string, value: unknown) => {
    const state = get();
    const clip = state.tracks
      .flatMap((track) => track.clips)
      .find((candidate) => candidate.id === id);

    if (!clip) return;

    const { previous, next } = buildPropertySnapshots(
      [clip],
      path,
      value,
    );

    const command = new UpdateClipPropertiesCommand(
      path,
      previous,
      next,
    );

    if (command.isNoop) return;
    if (path.startsWith('transform.') && get().autoKeyframeEnabled) {
      get().executeCommand(new AutoKeyframeTransformCommand({
        previousTracks: state.tracks,
        nextTracks: command.execute(state).tracks,
        previousAnimations: state.animations,
        elementIds: [id],
        projectTime: state.currentTime,
      }));
      return;
    }
    get().executeCommand(command);
  },

  setAnimationKeyframe: (input: SetAnimationKeyframeInput) => {
    const state = get();
    get().executeCommand(new SetAnimationKeyframeCommand(input, state.animations));
  },

  setAutoKeyframeEnabled: (enabled: boolean) => set({ autoKeyframeEnabled: Boolean(enabled) }),

  updateNodesProperty: (ids: UUID[], path: string, value: unknown) => {
    const state = get();
    if (ids.length === 0) return;

    const requestedIds = new Set(ids);
    const clips = state.tracks
      .flatMap((track) => track.clips)
      .filter((clip) => requestedIds.has(clip.id));

    if (clips.length === 0) return;

    const { previous, next } = buildPropertySnapshots(
      clips,
      path,
      value,
    );

    const command = new UpdateClipPropertiesCommand(
      path,
      previous,
      next,
    );

    if (command.isNoop) return;
    if (path.startsWith('transform.') && get().autoKeyframeEnabled) {
      get().executeCommand(new AutoKeyframeTransformCommand({
        previousTracks: state.tracks,
        nextTracks: command.execute(state).tracks,
        previousAnimations: state.animations,
        elementIds: ids,
        projectTime: state.currentTime,
      }));
      return;
    }
    get().executeCommand(command);
  },

  executeCommand: (command: Command) => {
    const currentState = get();
    const nextState = command.execute(currentState);
    assertNoLockedTrackContentMutation(currentState.tracks, nextState.tracks);
    const totalDuration = calculateProjectDuration(nextState.tracks);
    const normalizedState: ProjectState = {
      ...nextState,
      totalDuration,
      currentTime: clampProjectTime(nextState.currentTime, totalDuration),
      // Reconcile selection before invariant validation so commands that remove
      // selected clips cannot leave a transient invalid ProjectState.
      selectedNodeIds: normalizeSelectedNodeIds(nextState.tracks, nextState.selectedNodeIds),
      selectedKeyframeIds: (() => {
        const ids = nextState.selectedKeyframeIds ?? currentState.selectedKeyframeIds ?? [];
        const live = new Set((nextState.animations ?? []).flatMap(a => (a.tracks ?? []).flatMap(t => (t.keyframes ?? []).map(k => k.id))));
        return ids.filter(id => live.has(id));
      })(),
    };
    assertValidProjectState(normalizedState);
    set({
      ...normalizedState,
      autoKeyframeEnabled: currentState.autoKeyframeEnabled,
      trackStates: deriveTrackStates(normalizedState.tracks),
    });
    useHistoryStore.getState().addCommand(command);
  }
}));

// Initialize the persisted duration from the actual clip timeline.
useProjectStore.setState((state) => ({
  totalDuration: calculateProjectDuration(state.tracks),
}));
