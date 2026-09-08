export type TimelineTrackType = 'background' | 'voice' | 'music' | 'sfx' | 'caption' | 'element' | 'intro' | 'outro';

export interface BaseTimelineClip {
  id: string;
  trackId: string;
  type: TimelineTrackType;
  startTime: number;
  duration: number;
  label: string;
  color?: string;
}

export interface VideoTimelineClip extends BaseTimelineClip {
  type: 'background' | 'intro' | 'outro';
  assetId: string;
  sourceStartTime: number;
  playbackRate: number;
  opacity: number;
}

export interface AudioTimelineClip extends BaseTimelineClip {
  type: 'voice' | 'music' | 'sfx';
  assetId: string;
  sourceStartTime: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
}

export interface CaptionTimelineClip extends BaseTimelineClip {
  type: 'caption';
  captionSegmentId: string;
}

export interface ElementTimelineClip extends BaseTimelineClip {
  type: 'element';
  elementId: string;
}

export type TimelineClip = VideoTimelineClip | AudioTimelineClip | CaptionTimelineClip | ElementTimelineClip;

export interface TimelineTrack {
  id: string;
  type: TimelineTrackType;
  name: string;
  order: number;
  isLocked: boolean;
  isMuted: boolean;
  isVisible: boolean;
  isSolo?: boolean;
  clips: TimelineClip[];
}

export interface Timeline {
  tracks: TimelineTrack[];
}

export interface TimelineViewport {
  pixelsPerSecond: number;
  scrollLeft: number;
  verticalScroll: number;
}
