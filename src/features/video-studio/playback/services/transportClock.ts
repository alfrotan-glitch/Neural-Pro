import { PlaybackIntentEpoch } from './playbackIntentEpoch';
import { PlaybackTransitionStateMachine } from './playbackTransitionStateMachine';
import { advancePlaybackTime, isPlaybackBoundaryReached, type PlaybackDirection } from './playbackDirection';

export type TransportClockListener = (time: number) => void;

/**
 * Central playback clock for the Video Studio preview.
 *
 * Responsibilities:
 * - Own elapsed-time progression while playing.
 * - Keep a single authoritative playback position for the preview runtime.
 * - Publish UI-facing time at a bounded cadence instead of forcing every
 *   consumer to maintain its own requestAnimationFrame loop.
 * - Support seek/pause/play without React state being used as the clock.
 */
export class TransportClock {
  private time = 0;
  private duration = 0;
  private playing = false;
  private direction: PlaybackDirection = 1;
  private rafId: number | null = null;
  private lastNow: number | null = null;
  private lastPublishedTime = 0;
  private publishAccumulator = 0;
  private readonly seekEpoch = new PlaybackIntentEpoch();
  private readonly transitionMachine = new PlaybackTransitionStateMachine();
  private readonly publishIntervalMs: number;
  private readonly listeners = new Set<TransportClockListener>();

  constructor(options: { publishFps?: number } = {}) {
    const publishFps = Math.max(10, Math.min(60, options.publishFps ?? 30));
    this.publishIntervalMs = 1000 / publishFps;
  }

  get currentTime(): number {
    return this.time;
  }

  get totalDuration(): number {
    return this.duration;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get playbackDirection(): PlaybackDirection {
    return this.direction;
  }

  /** Changes only on explicit seek/re-anchor intents, not normal frame progression. */
  get currentSeekRevision(): number {
    return this.seekEpoch.current;
  }

  get currentTransitionRevision(): number {
    return this.transitionMachine.revision;
  }

  setDuration(duration: number): void {
    this.duration = Math.max(0, Number.isFinite(duration) ? duration : 0);
    if (this.time > this.duration) {
      this.time = this.duration;
      this.publish(true);
    }
  }

  setTime(time: number, publish = true): void {
    const next = this.clampTime(time);
    const changed = Math.abs(next - this.time) > 0.0001;
    this.time = next;

    if (changed && publish) {
      this.publish(true);
    }
  }

  play(): void {
    if (this.playing || this.duration <= 0) return;
    this.transitionMachine.transition(this.direction < 0 ? 'reverse' : 'forward', this.direction);

    if (this.direction < 0 && this.time <= 0) {
      this.time = this.duration;
      this.publish(true);
    } else if (this.direction > 0 && this.time >= this.duration) {
      this.time = 0;
      this.publish(true);
    }

    this.playing = true;
    this.lastNow = performance.now();
    this.publish(true);
    this.scheduleFrame();
  }

  playReverse(): void {
    this.direction = -1;
    if (this.playing) {
      this.transitionMachine.playReverse();
      this.lastNow = performance.now();
      return;
    }
    this.play();
  }

  playForward(): void {
    this.direction = 1;
    if (this.playing) {
      this.transitionMachine.playForward();
      this.lastNow = performance.now();
      return;
    }
    this.play();
  }

  setPlaybackDirection(direction: PlaybackDirection): void {
    const next = direction < 0 ? -1 : 1;
    if (this.direction === next) return;
    this.direction = next;
    this.transitionMachine.transition(this.playing ? (next < 0 ? 'reverse' : 'forward') : 'paused', next);
    this.lastNow = this.playing ? performance.now() : null;
  }

  pause(): void {
    this.transitionMachine.pause();
    this.playing = false;
    this.lastNow = null;
    this.cancelFrame();
    this.publish(true);
  }

  seek(time: number): void {
    this.seekEpoch.advance();
    this.transitionMachine.seek();
    this.time = this.clampTime(time);
    this.lastNow = this.playing ? performance.now() : null;
    this.publish(true);
  }

  /**
   * Re-anchor the internal transport position to a media frame without
   * forcing a React/Zustand publication on every decoded video frame.
   * The normal bounded publication cadence remains responsible for UI state.
   */
  syncFromMediaFrame(time: number, correctionThresholdSeconds = 0.02): boolean {
    const next = this.clampTime(time);
    const correction = next - this.time;
    if (Math.abs(correction) < correctionThresholdSeconds) {
      this.time = next;
      return false;
    }

    this.time = next;
    this.lastNow = this.playing ? performance.now() : null;
    return true;
  }

  subscribe(listener: TransportClockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.pause();
    this.listeners.clear();
  }

  /** Used by integration code to avoid feeding the clock's own publication back into seek. */
  isApproximatelyAt(time: number, toleranceSeconds = 0.05): boolean {
    return Math.abs(this.time - time) <= toleranceSeconds;
  }

  private scheduleFrame(): void {
    if (this.rafId !== null || !this.playing) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tick = (now: number): void => {
    this.rafId = null;
    if (!this.playing) return;

    const last = this.lastNow ?? now;
    const elapsedSeconds = Math.max(0, Math.min(0.25, (now - last) / 1000));
    this.lastNow = now;
    this.publishAccumulator += elapsedSeconds * 1000;
    this.time = advancePlaybackTime(this.time, elapsedSeconds, this.duration, this.direction);

    if (isPlaybackBoundaryReached(this.time, this.duration, this.direction)) {
      this.time = this.direction < 0 ? 0 : this.duration;
      this.playing = false;
      this.lastNow = null;
      this.publish(true);
      return;
    }

    if (this.publishAccumulator >= this.publishIntervalMs) {
      this.publishAccumulator %= this.publishIntervalMs;
      this.publish(false);
    }

    this.scheduleFrame();
  };

  private publish(force: boolean): void {
    if (!force && Math.abs(this.time - this.lastPublishedTime) < 0.0001) {
      return;
    }

    this.lastPublishedTime = this.time;
    for (const listener of this.listeners) {
      listener(this.time);
    }
  }

  private clampTime(time: number): number {
    if (!Number.isFinite(time)) return 0;
    return Math.min(this.duration, Math.max(0, time));
  }
}
