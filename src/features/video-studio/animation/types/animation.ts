export type AnimatableProperty =
  | 'transform.x'
  | 'transform.y'
  | 'transform.scaleX'
  | 'transform.scaleY'
  | 'transform.rotation'
  | 'transform.opacity';

export type KeyframeInterpolation = 'linear' | 'bezier' | 'hold';

export interface BezierHandle {
  x: number;
  y: number;
}

export interface KeyframeBezierControls {
  in?: BezierHandle;
  out?: BezierHandle;
}

export type AnimationEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'back-in'
  | 'back-out'
  | 'back-in-out'
  | 'elastic-out'
  | 'bounce-out';

export interface AnimationKeyframe {
  id: string;
  time: number;
  value: number;
  interpolation: KeyframeInterpolation;
  easing: AnimationEasing;
  bezier?: KeyframeBezierControls;
}

export interface PropertyAnimationTrack {
  id: string;
  property: AnimatableProperty;
  enabled: boolean;
  keyframes: AnimationKeyframe[];
}

export interface ElementAnimation {
  id: string;
  elementId: string;
  tracks: PropertyAnimationTrack[];
}

export interface KeyframeClipboard {
  sourceElementId: string;
  entries: {
    property: AnimatableProperty;
    relativeTime: number;
    value: number;
    interpolation: KeyframeInterpolation;
    easing: AnimationEasing;
    bezier?: KeyframeBezierControls;
  }[];
}

export interface VideoStudioEditorState {
  selectedTrackId: string | null;
  selectedClipId: string | null;
  selectedElementId: string | null;
  timelineViewport: import('../../timeline/types/timeline').TimelineViewport;
  selectedKeyframeIds?: string[];
  expandedAnimationElementIds?: string[];
  autoKeyframeEnabled?: boolean;
  animationClipboard?: KeyframeClipboard | null;
}


export const ANIMATABLE_TRANSFORM_PROPERTIES: readonly AnimatableProperty[] = [
  'transform.x',
  'transform.y',
  'transform.scaleX',
  'transform.scaleY',
  'transform.rotation',
  'transform.opacity',
] as const;
