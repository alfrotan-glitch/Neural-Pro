export type ExportAssetType = 'video' | 'audio' | 'image';

export interface ExportAsset {
  id: string;
  type: ExportAssetType;
  name: string;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
}

export type ExportEffectType = 'transform' | 'opacity' | 'transition' | 'filter' | 'sound-wave' | 'subscribe';

export interface ExportEffect {
  id: string;
  type: ExportEffectType;
  properties: {
    name?: string;
    intensity?: number;
    duration?: number;
    easing?: string;
    style?: Record<string, any>;
    [key: string]: any;
  };
}

export interface ExportClip {
  id: string;
  assetId?: string;
  startAt: number;
  duration: number;
  trim: { in: number; out: number };
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
  };
  effects: ExportEffect[];
  properties: {
    name?: string;
    color?: string;
    thumbnail?: string;
    volume?: number;
    pan?: number;
    textContent?: string;
    fontFamily?: string;
    fontSize?: number;
    textColor?: string;
    textAlignment?: 'left' | 'center' | 'right';
    isMuted?: boolean;
    videoUrl?: string;
    audioUrl?: string;
    imageUrl?: string;
    [key: string]: any;
  };
}

export interface ExportCaptionWord {
  word: string;
  start: number;
  end: number;
}

export interface ExportCaption {
  id: string;
  startAt: number;
  duration: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  words?: ExportCaptionWord[];
}

export interface ExportTrack {
  id: string;
  type: 'video' | 'audio' | 'text' | 'effect';
  order: number;
  isMuted: boolean;
  clips: ExportClip[];
}

export interface ExportProject {
  projectId: string;
  title: string;
  resolution: { width: number; height: number };
  fps: number;
  duration: number;
  assets: ExportAsset[];
  tracks: ExportTrack[];
  captions: ExportCaption[];
}
