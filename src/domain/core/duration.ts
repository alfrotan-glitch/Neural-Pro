import type { Fps } from './fps';
import type { Seconds } from './time';
import { clampToDuration } from './time';

/**
 * Canonical duration kernel.
 *
 * Port of the executing authority `src/core/engine/clipTimelineDuration.ts`
 * (which exists only to dodge a `core → features` import cycle — violation V4)
 * merged with the source-range mapping in
 * `features/video-studio/playback/services/mediaTimeMapper.ts`.
 *
 * The merge matters: today `clipTimelineDuration.getCanonicalClipPlaybackRate`
 * and `mediaTimeMapper.getClipPlaybackRate` are byte-identical duplicates with
 * different names. There is now exactly one.
 *
 * **Behaviour is preserved bit-for-bit.** Two semantic quirks of the executing
 * code are pinned by tests and documented rather than silently "fixed":
 *
 *  Q1  When a persisted duration exists (`sourceMediaDuration` /
 *      `mediaDuration` / `sourceDuration`), source duration is
 *      `persisted - trim.in` — i.e. "media remaining after the in-point".
 *      When it does not exist, source duration is `trim.out - trim.in` — i.e.
 *      "the trim window". The two branches answer different questions.
 *      Reconciling them is WP-11's decision (INV-011), not this kernel's.
 *
 *  Q2  `getCanonicalClipSourceDuration` returns `null` (unbounded) for images
 *      and text, which is why `timelineDuration` falls back to the declared
 *      duration for those kinds.
 */

export const DEFAULT_PLAYBACK_RATE = 1;
export const MIN_PLAYBACK_RATE = 0.0625;
export const MAX_PLAYBACK_RATE = 16;

/**
 * Structural clip input.
 *
 * Deliberately structural so the existing `ClipNode` (and any future canonical
 * clip) is assignable with zero migration. Only the fields the duration rules
 * actually read are named.
 */
export interface ClipDurationInput {
  /** Timeline position in seconds. */
  readonly startAt?: Seconds;
  /** DECLARED timeline duration in seconds. */
  readonly duration: number;
  readonly trim?: { readonly in?: number; readonly out?: number } | null;
  readonly properties?: Readonly<Record<string, unknown>> | null;
}

/** A track as seen by the duration rules. */
export interface TrackDurationInput {
  readonly clips: readonly ClipDurationInput[];
}

function propertyNumber(properties: Readonly<Record<string, unknown>> | null | undefined, key: string): number {
  return Number(properties?.[key]);
}

function trimIn(clip: ClipDurationInput): number {
  const raw = Number(clip.trim?.in);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

// ---------------------------------------------------------------------------
// Playback rate
// ---------------------------------------------------------------------------

/** The single playback-rate normaliser. Clamped to [`MIN`, `MAX`], default 1. */
export function getPlaybackRate(clip: ClipDurationInput): number {
  const raw = propertyNumber(clip.properties, 'speed');
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PLAYBACK_RATE;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, raw));
}

// ---------------------------------------------------------------------------
// Source range
// ---------------------------------------------------------------------------

export interface ClipSourceRange {
  /** Source-media in-point, seconds. */
  readonly start: Seconds;
  /** Source-media out-point, seconds; `null` when the clip exposes no valid bound. */
  readonly end: Seconds | null;
}

/**
 * The source-media interval a clip represents.
 *
 * A `null` end is meaningful: the kernel must not invent an out-point.
 */
export function getClipSourceRange(clip: ClipDurationInput): ClipSourceRange {
  const start = trimIn(clip);
  const rawEnd = Number(clip.trim?.out);
  const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : null;
  return { start, end };
}

/** Source duration derived from the trim window only (`Q1` branch 2). */
export function getClipSourceDuration(clip: ClipDurationInput): Seconds | null {
  const { start, end } = getClipSourceRange(clip);
  return end === null ? null : Math.max(0, end - start);
}

/**
 * Canonical source duration: how much source media this clip may consume.
 *
 * `null` means **unbounded** (images, text, and any clip whose media is not
 * currently resolvable) — in that case the declared timeline duration wins.
 */
export function getSourceDuration(clip: ClipDurationInput): Seconds | null {
  const properties = clip.properties;

  // Static visual assets have no finite source-media duration limit.
  if (properties?.['imageUrl']) return null;
  if (properties?.['textContent'] !== undefined) return null;

  // Persisted media metadata remains authoritative across a cold reload or an
  // export snapshot, where the live media handle is unavailable.
  const persisted = ['sourceMediaDuration', 'mediaDuration', 'sourceDuration']
    .map((key) => propertyNumber(properties, key))
    .find((value) => Number.isFinite(value) && value > 0);

  if (persisted !== undefined) {
    const start = trimIn(clip);
    return persisted > start ? persisted - start : null;
  }

  const hasVideo = typeof properties?.['videoUrl'] === 'string' && properties['videoUrl'].trim().length > 0;
  const hasAudio = typeof properties?.['audioUrl'] === 'string' && properties['audioUrl'].trim().length > 0;
  if (!hasVideo && !hasAudio) return null;

  const { start, end } = getClipSourceRange(clip);
  if (end === null) return null;
  return Math.max(0, end - start);
}

// ---------------------------------------------------------------------------
// Timeline duration
// ---------------------------------------------------------------------------

/**
 * The timeline duration a clip actually occupies.
 *
 * `min(declaredDuration, sourceDuration / rate)`, and `declaredDuration` when
 * the source is unbounded. Never negative.
 */
export function getTimelineDuration(clip: ClipDurationInput): Seconds {
  const declared = Math.max(0, Number.isFinite(clip.duration) ? clip.duration : 0);
  const sourceDuration = getSourceDuration(clip);
  if (sourceDuration === null) return declared;
  return Math.min(declared, sourceDuration / getPlaybackRate(clip));
}

/** The half-open timeline interval a clip occupies: `[startAt, startAt + timelineDuration)`. */
export function getClipTimelineInterval(clip: ClipDurationInput & { readonly startAt: Seconds }) {
  const startAt = Number.isFinite(clip.startAt) ? Math.max(0, clip.startAt) : 0;
  return { start: startAt, end: startAt + getTimelineDuration(clip) };
}

/** Timeline end of a clip: `startAt + canonical timeline duration`. */
export function getClipTimelineEnd(clip: ClipDurationInput & { readonly startAt: Seconds }): Seconds {
  return getClipTimelineInterval(clip).end;
}

/**
 * Project duration: the furthest effective clip endpoint across every track.
 *
 * INV-001 — this is the only authority. `ProjectState.totalDuration` is a
 * derived value and is never written independently.
 */
export function calculateProjectDuration(tracks: readonly TrackDurationInput[]): Seconds {
  let duration = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const startAt = Number(clip.startAt);
      if (!Number.isFinite(startAt) || !Number.isFinite(clip.duration)) continue;
      const end = Math.max(0, startAt) + getTimelineDuration(clip);
      duration = Math.max(0, Math.max(duration, end));
    }
  }
  return duration;
}

// ---------------------------------------------------------------------------
// Project time <-> source time
// ---------------------------------------------------------------------------

/** Project/timeline time to source-media time, clamped to the trim out-point. */
export function projectTimeToSourceTime(
  clip: ClipDurationInput & { readonly startAt: Seconds },
  projectTime: unknown,
): Seconds {
  const safeProjectTime = Number.isFinite(projectTime) ? Number(projectTime) : 0;
  const rate = getPlaybackRate(clip);
  const { start, end } = getClipSourceRange(clip);
  const elapsed = Math.max(0, safeProjectTime - (Number.isFinite(clip.startAt) ? clip.startAt : 0));
  const sourceTime = start + elapsed * rate;
  return end === null ? sourceTime : Math.min(sourceTime, end);
}

/** Source-media time to project/timeline time, clamped to the clip's timeline end. */
export function sourceTimeToProjectTime(
  clip: ClipDurationInput & { readonly startAt: Seconds },
  sourceTime: unknown,
): Seconds {
  const startAt = Number.isFinite(clip.startAt) ? Math.max(0, clip.startAt) : 0;
  const rate = getPlaybackRate(clip);
  const { start, end } = getClipSourceRange(clip);
  const raw = Number.isFinite(sourceTime) ? Number(sourceTime) : start;
  const boundedSource = end === null ? Math.max(start, raw) : Math.min(end, Math.max(start, raw));
  const projectTime = startAt + Math.max(0, (boundedSource - start) / rate);
  const projectEnd = startAt + getTimelineDuration(clip);
  return Math.min(projectEnd, projectTime);
}

/**
 * Is the clip active at `projectTime`?
 *
 * `properties.deactivated === true` removes a clip from every plan without
 * deleting it — already the executing rule in `mediaTimeMapper.isClipActiveAt`.
 */
export function isClipActiveAt(
  clip: ClipDurationInput & { readonly startAt: Seconds },
  projectTime: unknown,
): boolean {
  if (clip.properties?.['deactivated'] === true) return false;
  if (!Number.isFinite(projectTime) || !Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) {
    return false;
  }
  const interval = getClipTimelineInterval(clip);
  const time = Number(projectTime);
  return time >= interval.start && time < interval.end;
}

/** Clamp a playhead position into a project of the given duration. */
export function clampProjectTime(time: unknown, duration: unknown): Seconds {
  if (!Number.isFinite(time)) return 0;
  return clampToDuration(time, duration);
}

/** Total frames of a project at `fps`. Uses the canonical frame projection. */
export function projectFrameCount(duration: unknown, fps: Fps): number {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, Number(duration)) : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  return Math.max(0, Math.ceil(safeDuration * safeFps - 1e-6));
}
