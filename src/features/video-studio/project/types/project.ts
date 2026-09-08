import type { UUID } from '../../shared/types/identity';
import type { ProjectCanvas, CanvasElement } from '../../canvas/types/canvas';
import type { MediaAsset } from '../../media/types/media';
import type { Timeline, TimelineViewport } from '../../timeline/types/timeline';
import type { CaptionSegment } from '../../captions/types/caption';
import type { AudioConfiguration } from '../../audio/types/audio';
import type { ElementAnimation, KeyframeClipboard } from '../../animation/types/animation';

export interface ProjectState {
  projectId: UUID;
  metadata: {
    title: string;
    resolution: { width: number; height: number };
    fps: number;
  };
  currentTime: number;
  totalDuration: number;
  tracks: Track[];
  selectedNodeIds: UUID[];
  /** Shared keyframe selection across Timeline and Graph Editor. */
  selectedKeyframeIds?: string[];
  isPlaying: boolean;
  /** Optional canonical transform animation tracks. */
  animations?: ElementAnimation[];
}

export type TimelineTrackLaneRole =
  | 'video'
  | 'image'
  | 'audio'
  | 'text'
  | 'caption'
  | 'element'
  | 'overlay'
  | 'subscribe'
  | 'effect'
  | 'sticker'
  | 'transition'
  | 'filter'
  | 'adjustment';

export interface Track {
  id: UUID;
  type: 'video' | 'audio' | 'text' | 'effect';
  /** Semantic lane role used for dedicated timeline rows without breaking the existing render-capability type. */
  laneRole?: TimelineTrackLaneRole;
  name?: string;
  isLocked: boolean;
  isMuted: boolean;
  isVisible: boolean;
  isCollapsed?: boolean;
  clips: ClipNode[];
}

export interface ClipNode {
  id: UUID;
  sourceId: UUID;
  startAt: number;
  duration: number;
  trim: { in: number; out: number };
  transform: {
    x: number;
    y: number;
    scale: number;
    /** Optional independent axis multipliers (percent). Defaults to 100 for backward compatibility. */
    scaleX?: number;
    scaleY?: number;
    rotation: number;
    opacity?: number;
  };
  properties: Record<string, any>;
}

export interface VideoStudioProject {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  canvas: ProjectCanvas;
  duration: number;
  fps: number;
  assets: MediaAsset[];
  timeline: Timeline;
  elements: CanvasElement[];
  captions: CaptionSegment[];
  audio: AudioConfiguration;
  animations?: ElementAnimation[];
  composition?: VideoComposition;
  scenes?: VideoScene[];
  transitions?: SceneTransition[];
}

export interface VideoComposition {
  id: string;
  sceneIds: string[];
}

export type SceneBackground =
  | { type: 'video'; assetId: string; fit: 'cover' | 'contain' | 'fill'; sourceOffset: number }
  | { type: 'image'; assetId: string; fit: 'cover' | 'contain' | 'fill' }
  | { type: 'color'; color: string };

export interface VideoScene {
  id: string;
  name: string;
  duration: number;
  background?: SceneBackground;
  elementIds: string[];
  captionTrackIds?: string[];
  audioClipIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type SceneTransitionType =
  | 'cut' | 'fade' | 'cross-dissolve' | 'dip-to-black' | 'dip-to-white'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'push-left' | 'push-right' | 'push-up' | 'push-down'
  | 'zoom-in' | 'zoom-out' | 'blur-dissolve'
  | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down';

export type TransitionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

export interface SceneTransition {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  type: SceneTransitionType;
  duration: number;
  easing: TransitionEasing;
  direction?: TransitionDirection;
  enabled: boolean;
}

export { type TimelineViewport } from '../../timeline/types/timeline';

export type { KeyframeClipboard } from '../../animation/types/animation';

export interface ProjectEditorState {
  selectedTrackId: string | null;
  selectedClipId: string | null;
  selectedElementId: string | null;
  timelineViewport: TimelineViewport;
  selectedKeyframeIds?: string[];
  expandedAnimationElementIds?: string[];
  autoKeyframeEnabled?: boolean;
  animationClipboard?: KeyframeClipboard | null;
}


export type { UUID } from '../../shared/types/identity';
