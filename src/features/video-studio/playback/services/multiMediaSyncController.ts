import type { ClipNode } from '../../project/types/project';
import { syncMediaElementToClip, type MediaSyncOptions } from './mediaSyncController';
import type { PlaybackDirection } from './playbackDirection';
import { createReverseFrameScheduler } from './reverseFrameScheduler';

export interface MediaSyncSessionState {
  clip: ClipNode;
  projectTime: number;
  isPlaying: boolean;
  playbackDirection?: PlaybackDirection;
  playbackFps?: number;
  playbackSessionId?: string;
  playbackSessionRevision?: number;
}

export interface MediaSyncSessionOptions extends MediaSyncOptions {
  correctionIntervalMs?: number;
  targetUpdateThresholdSeconds?: number;
  reconcile?: typeof syncMediaElementToClip;
}

export type MediaSyncReconcile = NonNullable<MediaSyncSessionOptions['reconcile']>;

/**
 * Keeps one HTMLMediaElement synchronized with the shared transport without
 * creating a new AbortController/promise chain on every React render.
 *
 * The session is deliberately imperative. React only publishes the latest
 * transport/config snapshot; this class owns the media-boundary scheduling.
 */
export class MediaSyncSession {
  private state: MediaSyncSessionState | null = null;
  private rafId: number | null = null;
  private abortController: AbortController | null = null;
  private reconcileInFlight = false;
  private lastReconciledProjectTime = Number.NaN;
  private lastReconcileAt = 0;
  private dirty = false;
  private disposed = false;
  private generation = 0;
  private lastTransitionSignature = '';
  private reverseScheduler = createReverseFrameScheduler(30);
  private lastReverseTarget = Number.NaN;

  private readonly correctionIntervalMs: number;
  private readonly targetUpdateThresholdSeconds: number;
  private readonly reconcile: MediaSyncReconcile;

  constructor(
    private readonly media: HTMLMediaElement,
    options: MediaSyncSessionOptions = {},
  ) {
    this.correctionIntervalMs = Math.max(50, options.correctionIntervalMs ?? 120);
    this.targetUpdateThresholdSeconds = Math.max(
      0.01,
      options.targetUpdateThresholdSeconds ?? 0.04,
    );
    this.reconcile = options.reconcile ?? syncMediaElementToClip;
  }

  update(state: MediaSyncSessionState): void {
    if (this.disposed) return;

    const previous = this.state;
    this.state = state;
    this.generation += 1;
    const transitionSignature = `${state.isPlaying ? 'playing' : 'paused'}:${state.playbackDirection ?? 1}`;
    if (transitionSignature !== this.lastTransitionSignature) {
      this.lastTransitionSignature = transitionSignature;
      this.abortController?.abort();
      this.reconcileInFlight = false;
      this.lastReverseTarget = Number.NaN;
      this.dirty = true;
    }
    if ((state.playbackDirection ?? 1) < 0) {
      this.reverseScheduler = createReverseFrameScheduler(state.playbackFps ?? 30);
    }

    const timeChanged =
      !previous ||
      Math.abs(previous.projectTime - state.projectTime) >= this.targetUpdateThresholdSeconds;
    const modeChanged = !previous || previous.isPlaying !== state.isPlaying;
    this.dirty = this.dirty || timeChanged || modeChanged;

    this.schedule();
  }

  forceSync(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.lastReconciledProjectTime = Number.NaN;
    this.lastReverseTarget = Number.NaN;
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.state = null;
    this.lastReverseTarget = Number.NaN;
    this.cancelFrame();
    this.abortController?.abort();
    this.abortController = null;
  }

  private schedule(): void {
    if (this.rafId !== null || this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.rafId = null;
    if (this.disposed || !this.state) return;

    const elapsed = now - this.lastReconcileAt;
    const targetDelta = Math.abs(
      this.state.projectTime - this.lastReconciledProjectTime,
    );

    const shouldReconcile =
      this.dirty ||
      !Number.isFinite(this.lastReconciledProjectTime) ||
      targetDelta >= this.targetUpdateThresholdSeconds ||
      elapsed >= this.correctionIntervalMs;

    if (shouldReconcile && !this.reconcileInFlight) {
      void this.reconcileNow(now);
    }

    if (!this.disposed && this.state && (this.state.isPlaying || this.dirty || this.reconcileInFlight)) {
      this.schedule();
    }
  };

  private async reconcileNow(now: number): Promise<void> {
    if (this.reconcileInFlight || this.disposed || !this.state) return;

    const snapshot = this.state;
    const generation = this.generation;
    const sessionId = snapshot.playbackSessionId;
    const sessionRevision = snapshot.playbackSessionRevision;
    const reverse = snapshot.isPlaying && (snapshot.playbackDirection ?? 1) < 0;
    const targetProjectTime = reverse
      ? this.reverseScheduler.snap(snapshot.projectTime, -1)
      : snapshot.projectTime;
    if (reverse && Number.isFinite(this.lastReverseTarget) && Math.abs(targetProjectTime - this.lastReverseTarget) < this.reverseScheduler.frameDurationSeconds * 0.5) {
      this.reconcileInFlight = false;
      this.dirty = false;
      return;
    }
    if (reverse) this.lastReverseTarget = targetProjectTime;
    const controller = new AbortController();
    this.abortController?.abort();
    this.abortController = controller;
    this.reconcileInFlight = true;
    this.dirty = false;

    try {
      await this.reconcile(
        this.media,
        snapshot.clip,
        targetProjectTime,
        snapshot.isPlaying,
        {
          driftToleranceSeconds: 0.18,
          timeoutMs: 15_000,
          playbackDirection: snapshot.playbackDirection ?? 1,
        },
        controller.signal,
      );
      if (controller.signal.aborted || this.disposed || this.state !== snapshot || this.generation !== generation) return;
      if (sessionId && snapshot.playbackSessionId !== sessionId) return;
      if (sessionRevision !== undefined && snapshot.playbackSessionRevision !== sessionRevision) return;
      this.lastReconciledProjectTime = snapshot.projectTime;
      this.lastReconcileAt = now;
    } catch {
      if (!controller.signal.aborted && !this.disposed) {
        // Media error/recovery is owned by MediaHealthController. Sync failure
        // must not surface as an unhandled promise rejection here.
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
      this.reconcileInFlight = false;
      if (!this.disposed && this.state && (this.state.isPlaying || this.dirty)) {
        this.schedule();
      }
    }
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export function createMediaSyncSession(
  media: HTMLMediaElement,
  options: MediaSyncSessionOptions = {},
): MediaSyncSession {
  return new MediaSyncSession(media, options);
}
