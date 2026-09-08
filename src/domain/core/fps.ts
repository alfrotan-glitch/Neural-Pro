import { DomainInvariantError } from './errors';

/**
 * Canonical FPS authority.
 *
 * INV-013 requires exactly one fps authority per render pass. Before this
 * kernel, three existed:
 *   1. `ProjectState.metadata.fps`            (composition / UI)
 *   2. `ExportJob.settings.fps`               (encoder)
 *   3. `DEFAULT_CAPTION_FPS = 30` in
 *      `features/video-studio/captions/services/captionTimecodeService.ts:4`
 *
 * This module does not delete them; it defines the **single resolution rule**
 * they must all consume:
 *
 *      render fps = explicit export fps  >  project fps  >  DEFAULT_FPS
 *
 * and states that caption timecodes are derived from the resolved render fps,
 * never from their own constant.
 */

/** Frames per second. Must be finite and within [`MIN_FPS`, `MAX_FPS`]. */
export type Fps = number;

export const DEFAULT_FPS: Fps = 30;
export const MIN_FPS: Fps = 1;
export const MAX_FPS: Fps = 240;

/** Source of a resolved fps — carried in the result so callers can report it. */
export type FpsSource = 'export' | 'project' | 'default';

export interface ResolvedFps {
  readonly fps: Fps;
  readonly source: FpsSource;
}

export function isFinitePositiveFps(value: unknown): value is Fps {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Coerce an unknown fps to a usable one.
 *
 * Invalid input falls back to `fallback` (never to a silent `0`), then the
 * result is clamped into [`MIN_FPS`, `MAX_FPS`]. Clamping is explicit because
 * the encoder contract requires a positive, finite framerate.
 */
export function normalizeFps(value: unknown, fallback: Fps = DEFAULT_FPS): Fps {
  const safeFallback = isFinitePositiveFps(fallback) ? fallback : DEFAULT_FPS;
  if (!isFinitePositiveFps(value)) return clampFps(safeFallback);
  return clampFps(value);
}

function clampFps(value: Fps): Fps {
  return Math.min(MAX_FPS, Math.max(MIN_FPS, value));
}

export function assertFps(value: unknown, field = 'fps'): Fps {
  if (!isFinitePositiveFps(value)) {
    throw new DomainInvariantError('DOMAIN_INVALID_FPS', field, `must be a finite number > 0 (received ${String(value)})`);
  }
  return clampFps(value);
}

/**
 * The single fps resolution rule (INV-013).
 *
 * @param exportFps  explicit encoder/export fps — highest precedence
 * @param projectFps composition fps — used when no explicit export fps exists
 */
export function resolveRenderFps(exportFps?: unknown, projectFps?: unknown): ResolvedFps {
  if (isFinitePositiveFps(exportFps)) return { fps: clampFps(exportFps), source: 'export' };
  if (isFinitePositiveFps(projectFps)) return { fps: clampFps(projectFps), source: 'project' };
  return { fps: DEFAULT_FPS, source: 'default' };
}

/**
 * Caption timecode fps. Captions must be frame-aligned to the render pass, so
 * there is no independent caption framerate: this always returns the resolved
 * render fps.
 */
export function resolveCaptionFps(renderFps: unknown): Fps {
  return normalizeFps(renderFps, DEFAULT_FPS);
}

/** Duration of exactly one frame at `fps`, in seconds. */
export function frameDuration(fps: unknown): number {
  return 1 / normalizeFps(fps);
}
