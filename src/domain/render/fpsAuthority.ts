export interface RenderFpsOptions {
  settingsFps?: number | null;
  projectFps?: number | null;
  fallbackFps?: number;
}

export const DEFAULT_CANONICAL_FPS = 30;

/**
 * Single authority for FPS across the entire rendering and export pipeline (D-020).
 * Threads a single resolved FPS value into frame counts, encoder configurations,
 * frame presentation timestamps, and caption timecode conversions.
 */
export class RenderFpsAuthority {
  static resolveFps(options?: RenderFpsOptions | number): number {
    if (typeof options === 'number') {
      return Number.isFinite(options) && options > 0 ? Math.round(options) : DEFAULT_CANONICAL_FPS;
    }
    const settingsFps = options?.settingsFps;
    if (Number.isFinite(settingsFps) && Number(settingsFps) > 0) {
      return Math.round(Number(settingsFps));
    }
    const projectFps = options?.projectFps;
    if (Number.isFinite(projectFps) && Number(projectFps) > 0) {
      return Math.round(Number(projectFps));
    }
    const fallbackFps = options?.fallbackFps;
    if (Number.isFinite(fallbackFps) && Number(fallbackFps) > 0) {
      return Math.round(Number(fallbackFps));
    }
    return DEFAULT_CANONICAL_FPS;
  }

  static getFrameCount(durationSeconds: number, fps: number): number {
    const validFps = this.resolveFps(fps);
    const validDuration = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 0);
    return Math.ceil(validDuration * validFps);
  }

  static getFrameTime(frameIndex: number, fps: number): number {
    const validFps = this.resolveFps(fps);
    return Math.max(0, frameIndex) / validFps;
  }

  static getFrameTimestampUs(frameIndex: number, fps: number): number {
    const validFps = this.resolveFps(fps);
    return Math.round((Math.max(0, frameIndex) / validFps) * 1_000_000);
  }

  static formatTimecode(seconds: number, fps: number): string {
    const validFps = this.resolveFps(fps);
    const totalSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds - Math.floor(totalSeconds)) * validFps);

    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}:${pad(frames)}`;
  }
}
