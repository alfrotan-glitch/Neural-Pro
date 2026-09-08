import type { ClipId, SourceId } from './identity';
import type { Seconds } from './time';
import type { TimeInterval } from './time';
import type { TransformInput } from './transform';
import { canonicalTransform, type CanonicalTransform } from './transform';
import { getClipTimelineInterval, getTimelineDuration, isClipActiveAt } from './duration';

/**
 * Canonical clip.
 *
 * Two shapes are deliberate and must not be collapsed:
 *
 *  - **`PersistedClip`** is the loose shape stored in a project document. It is
 *    structurally compatible with today's `ClipNode`, so the entire executing
 *    codebase can adopt the core with **zero edits**.
 *  - **`CanonicalClip`** is the strict, normalised shape consumed by render,
 *    export and validation. Every numeric field is finite and every transform
 *    is normalised.
 *
 * `normalizeClip` is the only bridge and is total: it never throws and never
 * produces a non-finite value.
 */

/** Trim window in source-media seconds. `out` must be `> in` to be meaningful. */
export interface ClipTrim {
  readonly in: Seconds;
  readonly out: Seconds;
}

export interface PersistedClip {
  readonly id: ClipId;
  readonly sourceId: SourceId;
  readonly startAt: Seconds;
  /** DECLARED timeline duration. The effective duration is derived — see `duration.ts`. */
  readonly duration: Seconds;
  readonly trim: ClipTrim | null;
  readonly transform: TransformInput | null;
  readonly properties: Readonly<Record<string, unknown>> | null;
}

export interface CanonicalClip {
  readonly id: ClipId;
  readonly sourceId: SourceId;
  readonly startAt: Seconds;
  readonly duration: Seconds;
  readonly trim: ClipTrim | null;
  readonly transform: CanonicalTransform;
  readonly properties: Readonly<Record<string, unknown>>;
  /** Derived — never stored independently. */
  readonly effectiveDuration: Seconds;
}

function safeSeconds(value: unknown): Seconds {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeTrim(
  trim: ClipTrim | null | undefined,
  declaredDuration: Seconds,
): ClipTrim | null {
  if (!trim) return null;
  const rawIn = Number(trim.in);
  const rawOut = Number(trim.out);
  const inPoint = Number.isFinite(rawIn) ? Math.max(0, rawIn) : 0;
  const outPoint = Number.isFinite(rawOut) && rawOut > inPoint ? rawOut : inPoint + declaredDuration;
  return { in: inPoint, out: outPoint };
}

/**
 * Total normalisation: `PersistedClip` (or today's `ClipNode`) → `CanonicalClip`.
 *
 * Missing transform ⇒ identity. Missing properties ⇒ `{}`. Non-finite
 * `startAt`/`duration` ⇒ `0`. An invalid trim (missing, or `out <= in`) is
 * reconstructed from the declared duration rather than dropped, so a damaged
 * document degrades instead of vanishing.
 */
export function normalizeClip(clip: PersistedClip): CanonicalClip {
  const declaredDuration = safeSeconds(clip.duration);
  const properties: Readonly<Record<string, unknown>> =
    clip.properties && typeof clip.properties === 'object' ? clip.properties : {};

  return {
    id: clip.id,
    sourceId: clip.sourceId,
    startAt: safeSeconds(clip.startAt),
    duration: declaredDuration,
    trim: normalizeTrim(clip.trim, declaredDuration),
    transform: canonicalTransform(clip.transform),
    properties,
    effectiveDuration: getTimelineDuration({
      startAt: clip.startAt,
      duration: declaredDuration,
      trim: clip.trim,
      properties,
    }),
  };
}

export function normalizeClips(clips: readonly PersistedClip[]): CanonicalClip[] {
  return clips.map(normalizeClip);
}

/**
 * Half-open timeline interval `[startAt, startAt + effectiveDuration)`.
 *
 * Delegates to `duration.getClipTimelineInterval` so the interval rule exists
 * once. Both agree by construction: a canonical clip's `effectiveDuration` is
 * `getTimelineDuration` of its own fields.
 */
export function clipInterval(clip: CanonicalClip): TimeInterval {
  return getClipTimelineInterval(clip);
}

export function isActiveAt(clip: CanonicalClip, projectTime: Seconds): boolean {
  return isClipActiveAt(
    { startAt: clip.startAt, duration: clip.duration, trim: clip.trim, properties: clip.properties },
    projectTime,
  );
}

/**
 * Media kind, resolved from the properties bag.
 *
 * This makes an *implicit* rule explicit. Executing evidence
 * (`clipTimelineDuration.getCanonicalClipSourceDuration`):
 *   `imageUrl` present ⇒ image (unbounded duration)
 *   `textContent` defined ⇒ text (unbounded duration)
 *   `videoUrl` present ⇒ video
 *   `audioUrl` present ⇒ audio
 * Precedence above is the executing precedence and is preserved.
 */
export type MediaKind = 'video' | 'audio' | 'image' | 'text' | 'unknown';

export function resolveMediaKind(properties: Readonly<Record<string, unknown>> | null | undefined): MediaKind {
  if (!properties) return 'unknown';
  if (properties['imageUrl']) return 'image';
  if (properties['textContent'] !== undefined) return 'text';
  if (properties['videoUrl']) return 'video';
  if (properties['audioUrl']) return 'audio';
  return 'unknown';
}

export function clipMediaKind(clip: CanonicalClip): MediaKind {
  return resolveMediaKind(clip.properties);
}
