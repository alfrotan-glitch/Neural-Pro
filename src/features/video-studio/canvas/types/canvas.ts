export type ProjectAspectRatio = '16:9' | '9:16' | '1:1';

export interface ProjectCanvas {
  width: number;
  height: number;
  aspectRatio: ProjectAspectRatio;
  backgroundColor: string;
}

export const CANVAS_PRESETS: Record<ProjectAspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

export type CanvasElementType = 'text' | 'image' | 'subscribe' | 'visualizer' | 'shape' | 'sticker' | 'lower-third' | 'sound-wave';

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  name: string;
  transform: Transform;
  opacity: number;
  isVisible: boolean;
  isLocked: boolean;
  properties?: Record<string, any>;
}
