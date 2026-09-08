export type CaptionAnimationPreset = 'fade' | 'slide' | 'zoom' | 'bounce' | 'blur' | 'pop' | 'scale' | 'none';

export interface CaptionAnimationState {
  opacity: number;
  scale: number;
  x: number;
  y: number;
  rotate: number;
  blurPx: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Canonical frame-based word animation shared by Preview and Canvas Export.
 * The state is derived only from project time/word progress, never from DOM
 * or animation-library history, which makes export deterministic.
 */
export function resolveCaptionAnimationState(input: {
  preset?: unknown;
  progress?: unknown;
  active?: boolean;
}): CaptionAnimationState {
  const preset = String(input.preset ?? 'fade') as CaptionAnimationPreset;
  const active = input.active === true;
  const p = clamp(finite(input.progress, active ? 1 : 0));

  if (!active) {
    switch (preset) {
      case 'fade': return { opacity: 0.5, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 0 };
      case 'slide': return { opacity: 0.6, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 0 };
      case 'zoom': return { opacity: 0.6, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 0 };
      case 'blur': return { opacity: 0.5, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 1 };
      case 'pop': return { opacity: 0.7, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 0 };
      case 'bounce':
      case 'scale':
      case 'none':
      default: return { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 0 };
    }
  }

  switch (preset) {
    case 'fade':
      return { opacity: 0.3 + 0.7 * p, scale: 0.95 + 0.10 * p, x: 0, y: 0, rotate: 0, blurPx: 0 };
    case 'slide':
      return { opacity: 0.4 + 0.6 * p, scale: 1, x: 0, y: 6 - 10 * p, rotate: 0, blurPx: 0 };
    case 'zoom':
      return { opacity: 0.4 + 0.6 * p, scale: 0.8 + 0.45 * p, x: 0, y: 0, rotate: 0, blurPx: 0 };
    case 'bounce':
      return { opacity: 1, scale: 1, x: 0, y: -10 * p, rotate: 0, blurPx: 0 };
    case 'blur':
      return { opacity: 0.3 + 0.7 * p, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 3 * (1 - p) };
    case 'pop':
      return { opacity: 0.5 + 0.5 * p, scale: 0.9 + 0.4 * p, x: 0, y: 0, rotate: 0, blurPx: 0 };
    case 'scale':
      return { opacity: 1, scale: 1 + 0.15 * p, x: 0, y: 0, rotate: 0, blurPx: 0 };
    case 'none':
    default:
      return { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, blurPx: 0 };
  }
}
