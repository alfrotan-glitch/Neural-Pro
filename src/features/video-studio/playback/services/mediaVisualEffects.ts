/**
 * Canonical visual effects shared by Preview DOM and Canvas Export.
 *
 * The Inspector currently exposes this finite set of blend modes. Keeping the
 * accepted values centralized prevents Preview and Export from interpreting
 * persisted project properties differently.
 */
export const MEDIA_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const;
export type MediaBlendMode = (typeof MEDIA_BLEND_MODES)[number];

export interface MediaVisualEffectsInput {
  brightness?: unknown;
  contrast?: unknown;
  saturation?: unknown;
  blendMode?: unknown;
}

export interface MediaVisualEffects {
  cssFilter: string;
  canvasFilter: string;
  cssBlendMode: MediaBlendMode;
  canvasCompositeOperation: GlobalCompositeOperation;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeMediaBlendMode(value: unknown): MediaBlendMode {
  return MEDIA_BLEND_MODES.includes(value as MediaBlendMode) ? value as MediaBlendMode : 'normal';
}

export function getMediaVisualEffects(input: MediaVisualEffectsInput): MediaVisualEffects {
  const brightness = finiteNumber(input.brightness, 0);
  const contrast = finiteNumber(input.contrast, 0);
  const saturation = finiteNumber(input.saturation, 0);
  const blendMode = normalizeMediaBlendMode(input.blendMode);

  const filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`;

  return {
    cssFilter: filter,
    canvasFilter: filter,
    cssBlendMode: blendMode,
    // Canvas does not type every CSS blend mode in all TS lib versions.
    // Keep Preview/Export semantics explicit and fall back safely.
    canvasCompositeOperation: blendMode === 'normal' ? 'source-over' : (blendMode as GlobalCompositeOperation),
  };
}
