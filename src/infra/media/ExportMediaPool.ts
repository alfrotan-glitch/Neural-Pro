import type { MediaSourceRequest } from '../../domain/export/resolveMediaForClip';
import { seekMediaElement } from '../../core/engine/mediaSeek';

export interface MediaFrameSource {
  readonly clipId: string;
  readonly ready: Promise<void>;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly element: HTMLVideoElement | HTMLImageElement | null;
  seek(sourceTime: number, signal?: AbortSignal): Promise<void>;
}

export class MediaPrepareError extends Error {
  readonly code = 'MEDIA_PREPARE_FAILED';
  readonly clipId: string;

  constructor(clipId: string, message: string, cause?: unknown) {
    super(`MEDIA_PREPARE_FAILED for clip "${clipId}": ${message}`);
    this.name = 'MediaPrepareError';
    this.clipId = clipId;
    if (cause) {
      this.cause = cause;
    }
  }
}

export class ExportMediaPool {
  private readonly sources = new Map<string, MediaFrameSource>();
  private readonly videoElements = new Map<string, HTMLVideoElement>();
  private readonly imageElements = new Map<string, HTMLImageElement>();
  private readonly trackedUrls = new Set<string>();
  private isDisposed = false;

  public async prepare(
    requests: readonly MediaSourceRequest[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.isDisposed) {
      throw new Error('ExportMediaPool has already been disposed.');
    }

    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error('ExportMediaPool prepare cancelled.');
    }

    await Promise.all(
      requests.map(async (req) => {
        if (signal?.aborted) {
          throw signal.reason instanceof Error
            ? signal.reason
            : new Error('ExportMediaPool prepare cancelled.');
        }

        if (req.kind === 'video') {
          await this.prepareVideo(req, signal);
        } else if (req.kind === 'image') {
          await this.prepareImage(req, signal);
        }
      }),
    );
  }

  private async prepareVideo(req: MediaSourceRequest, signal?: AbortSignal): Promise<void> {
    const url = req.url;
    if (!url) {
      throw new MediaPrepareError(req.clipId, 'Missing video source URL or unresolvable AssetId.');
    }

    if (typeof document === 'undefined') {
      // Running in headless Node environment without DOM
      const fakeSource: MediaFrameSource = {
        clipId: req.clipId,
        ready: Promise.resolve(),
        width: 1920,
        height: 1080,
        duration: 60,
        element: null,
        seek: async () => {},
      };
      this.sources.set(req.clipId, fakeSource);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const loadPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutMs = 15_000;
      let timer: any = null;

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('canplay', onLoaded);
        video.removeEventListener('error', onError);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
      };

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve();
      };

      const onLoaded = () => finish();
      const onError = () => {
        const detail = video.error?.message || 'unknown playback/decode error';
        finish(new MediaPrepareError(req.clipId, `Video failed to load: ${detail}`));
      };
      const onAbort = () => {
        finish(signal?.reason instanceof Error ? signal.reason : new Error('Media preparation aborted.'));
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('canplay', onLoaded);
      video.addEventListener('error', onError);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      timer = setTimeout(() => {
        finish(new MediaPrepareError(req.clipId, `Video metadata loading timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      if (video.readyState >= 1) {
        finish();
        return;
      }

      video.src = url;
      video.load();
    });

    try {
      await loadPromise;
    } catch (err) {
      this.releaseVideoElement(video);
      throw err;
    }

    this.videoElements.set(req.clipId, video);

    const frameSource: MediaFrameSource = {
      clipId: req.clipId,
      ready: loadPromise,
      get width() { return video.videoWidth || 0; },
      get height() { return video.videoHeight || 0; },
      get duration() { return video.duration || 0; },
      element: video,
      seek: async (sourceTime: number, seekSignal?: AbortSignal) => {
        await seekMediaElement(video, sourceTime, { timeoutMs: 15_000, toleranceSeconds: 0.001 }, seekSignal);
      },
    };

    this.sources.set(req.clipId, frameSource);
  }

  private async prepareImage(req: MediaSourceRequest, signal?: AbortSignal): Promise<void> {
    const url = req.url;
    if (!url) {
      throw new MediaPrepareError(req.clipId, 'Missing image source URL or unresolvable AssetId.');
    }

    if (typeof document === 'undefined') {
      const fakeSource: MediaFrameSource = {
        clipId: req.clipId,
        ready: Promise.resolve(),
        width: 1920,
        height: 1080,
        duration: 0,
        element: null,
        seek: async () => {},
      };
      this.sources.set(req.clipId, fakeSource);
      return;
    }

    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';

    const loadPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutMs = 15_000;
      let timer: any = null;

      const cleanup = () => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
      };

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve();
      };

      const onLoad = () => finish();
      const onError = () => {
        finish(new MediaPrepareError(req.clipId, 'Image failed to load.'));
      };
      const onAbort = () => {
        finish(signal?.reason instanceof Error ? signal.reason : new Error('Image preparation aborted.'));
      };

      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      timer = setTimeout(() => {
        finish(new MediaPrepareError(req.clipId, `Image loading timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      if (img.complete && img.naturalWidth > 0) {
        finish();
        return;
      }

      img.src = url;
    });

    try {
      await loadPromise;
    } catch (err) {
      img.src = '';
      throw err;
    }

    this.imageElements.set(req.clipId, img);

    const frameSource: MediaFrameSource = {
      clipId: req.clipId,
      ready: loadPromise,
      get width() { return img.naturalWidth || 0; },
      get height() { return img.naturalHeight || 0; },
      duration: 0,
      element: img,
      seek: async () => {},
    };

    this.sources.set(req.clipId, frameSource);
  }

  public get(clipId: string): MediaFrameSource | undefined {
    return this.sources.get(clipId);
  }

  public getVideoElement(clipId: string): HTMLVideoElement | undefined {
    return this.videoElements.get(clipId);
  }

  public getImageElement(clipId: string): HTMLImageElement | undefined {
    return this.imageElements.get(clipId);
  }

  public getVideoMap(): ReadonlyMap<string, HTMLVideoElement> {
    return this.videoElements;
  }

  public getImageMap(): ReadonlyMap<string, HTMLImageElement> {
    return this.imageElements;
  }

  private releaseVideoElement(video: HTMLVideoElement): void {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // Ignore cleanup error
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const video of this.videoElements.values()) {
      this.releaseVideoElement(video);
    }
    this.videoElements.clear();

    for (const img of this.imageElements.values()) {
      try {
        img.removeAttribute('src');
      } catch {
        // Ignore
      }
    }
    this.imageElements.clear();
    this.sources.clear();

    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const url of this.trackedUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore
        }
      }
    }
    this.trackedUrls.clear();
  }
}
