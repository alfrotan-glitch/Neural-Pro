import type { ClipNode } from '../../project/types/project';
import {
  getSegmentedWords,
  isCaptionTheme,
  type CaptionTheme,
  type CaptionTimelineState,
  type CaptionWord,
} from '../../../../core/engine/captionRenderModel';

export interface CaptionRenderInput {
  clipId: string;
  startAt: number;
  duration: number;
  transform?: { x?: number; y?: number; scale?: number; scaleX?: number; scaleY?: number; rotation?: number; opacity?: number };
  properties?: Record<string, unknown>;
}


export interface CaptionCanvasPlacement {
  centerX: number;
  centerY: number;
  bottomMargin: number;
}

/**
 * Canonical caption anchor shared by Preview and Canvas Export. The anchor is
 * intentionally independent of the Preview DOM wrapper so a user-edited
 * transform is applied from the same base position in both render paths.
 */
export function getCaptionCanvasPlacement(
  canvasWidth: number,
  canvasHeight: number,
  containerHeight: number,
  transformY = 0,
): CaptionCanvasPlacement {
  const safeHeight = Math.max(1, finite(canvasHeight, 1));
  const safeWidth = Math.max(1, finite(canvasWidth, 1));
  const scale = safeHeight / 720;
  const bottomMargin = 80 * scale;
  const centerX = safeWidth / 2;
  const centerY = safeHeight - bottomMargin - Math.max(0, containerHeight) / 2 + finite(transformY, 0);
  return { centerX, centerY, bottomMargin };
}

export interface CaptionRenderPlan {
  clipId: string;
  theme: CaptionTheme;
  displayMode: 'phrase' | 'sentence';
  textContent: string;
  words: CaptionWord[];
  timeline: CaptionTimelineState;
  clipStart: number;
  clipEnd: number;
  duration: number;
  transform: {
    x: number;
    y: number;
    scale: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
  };
  style: Record<string, unknown>;
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function createCaptionRenderPlan(
  clip: CaptionRenderInput | ClipNode,
  currentTime: number,
): CaptionRenderPlan {
  const props = clip.properties ?? {};
  const clipStart = Math.max(0, finite(clip.startAt, 0));
  const duration = Math.max(0, finite(clip.duration, 0));
  const clipEnd = clipStart + duration;
  const requestedTheme = props.captionTheme;
  const theme: CaptionTheme = isCaptionTheme(requestedTheme) ? requestedTheme : 'karaoke';
  const displayMode = props.captionDisplayMode === 'sentence' ? 'sentence' : 'phrase';
  const textContent = String(props.textContent ?? '');
  const words = Array.isArray(props.words) ? props.words as CaptionWord[] : [];

  return {
    clipId: 'id' in clip ? clip.id : clip.clipId,
    theme,
    displayMode,
    textContent,
    words,
    timeline: getSegmentedWords(
      words,
      textContent,
      displayMode,
      currentTime,
      clipStart,
      duration,
      clipEnd,
    ),
    clipStart,
    clipEnd,
    duration,
    transform: {
      x: finite(clip.transform?.x, 0),
      y: finite(clip.transform?.y, 0),
      scale: finite(clip.transform?.scale, 100),
      scaleX: finite(clip.transform?.scaleX, 100),
      scaleY: finite(clip.transform?.scaleY, 100),
      rotation: finite(clip.transform?.rotation, 0),
      opacity: finite(clip.transform?.opacity, 100),
    },
    style: { ...props },
  };
}
