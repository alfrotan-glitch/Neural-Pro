import type { PlaybackDirection } from './playbackDirection';

const DEFAULT_FPS = 30;
const MIN_FPS = 1;
const MAX_FPS = 240;
const EPSILON = 1e-9;

export interface ReverseFrameSchedulerOptions {
  fps?: number;
}

/**
 * Deterministic project-frame scheduler used by reverse media presentation.
 * It never mutates transport or media; it only derives the next frame target.
 */
export class ReverseFrameScheduler {
  readonly fps: number;
  readonly frameDurationSeconds: number;

  constructor(options: ReverseFrameSchedulerOptions = {}) {
    const fps = Number(options.fps);
    this.fps = Number.isFinite(fps)
      ? Math.min(MAX_FPS, Math.max(MIN_FPS, fps))
      : DEFAULT_FPS;
    this.frameDurationSeconds = 1 / this.fps;
  }

  frameIndexAt(projectTime: number): number {
    if (!Number.isFinite(projectTime) || projectTime <= 0) return 0;
    return Math.max(0, Math.round(projectTime * this.fps));
  }

  frameTime(frameIndex: number): number {
    const safeIndex = Math.max(0, Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0);
    return safeIndex / this.fps;
  }

  nextTarget(projectTime: number, direction: PlaybackDirection): number {
    const safeTime = Math.max(0, Number.isFinite(projectTime) ? projectTime : 0);
    const frameIndex = direction < 0
      ? Math.max(0, Math.ceil(safeTime * this.fps - EPSILON) - 1)
      : Math.floor(safeTime * this.fps + EPSILON) + 1;
    return this.frameTime(frameIndex);
  }

  snap(projectTime: number, direction: PlaybackDirection): number {
    const safeTime = Math.max(0, Number.isFinite(projectTime) ? projectTime : 0);
    const rawIndex = safeTime * this.fps;
    const frameIndex = direction < 0
      ? Math.max(0, Math.floor(rawIndex + EPSILON))
      : Math.max(0, Math.round(rawIndex));
    return this.frameTime(frameIndex);
  }
}

export function createReverseFrameScheduler(fps?: number): ReverseFrameScheduler {
  return new ReverseFrameScheduler({ fps });
}
