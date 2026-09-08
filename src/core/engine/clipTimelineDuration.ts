/**
 * Canonical Timeline duration calculation for a single clip.
 *
 * A Clip's declared timeline duration may not exceed the source range exposed
 * by trim.in/trim.out after playback-rate mapping.
 *
 * This module is intentionally dependency-light so Project Duration, Preview,
 * Playback, Audio and Export can all use the same duration rule without
 * creating a feature/core import cycle.
 */

const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.0625;
const MAX_SPEED = 16;

type ClipLike = {
  duration: number;
  trim?: { in?: number; out?: number } | null;
  properties?: {
    speed?: unknown;
    imageUrl?: unknown;
    videoUrl?: unknown;
    audioUrl?: unknown;
    textContent?: unknown;
    timelineLaneRole?: unknown;
    sourceMediaDuration?: unknown;
    mediaDuration?: unknown;
    sourceDuration?: unknown;
  } | null;
};

export function getCanonicalClipPlaybackRate(clip: ClipLike): number {
  const raw = Number(clip.properties?.speed);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, raw));
}

export function getCanonicalClipSourceDuration(clip: ClipLike): number | null {
  // Static visual assets like images, text, stickers, shapes, etc. have no finite source media duration limit.
  if (clip.properties?.imageUrl) return null;
  if (clip.properties?.textContent !== undefined) return null;

  // Project persistence can retain the media metadata even when the live media
  // URL is unavailable (for example during a cold reload or an export snapshot).
  // The resize service already treats these persisted durations as authoritative;
  // canonical duration must use the same source of truth.
  const persistedSourceDuration = [
    clip.properties?.sourceMediaDuration,
    clip.properties?.mediaDuration,
    clip.properties?.sourceDuration,
  ]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  if (persistedSourceDuration !== undefined) {
    const start = Number.isFinite(clip.trim?.in) ? Math.max(0, Number(clip.trim?.in)) : 0;
    return persistedSourceDuration > start ? persistedSourceDuration - start : null;
  }

  const hasVideo = typeof clip.properties?.videoUrl === 'string' && clip.properties.videoUrl.trim().length > 0;
  const hasAudio = typeof clip.properties?.audioUrl === 'string' && clip.properties.audioUrl.trim().length > 0;
  if (!hasVideo && !hasAudio) {
    return null;
  }
  const start = Number.isFinite(clip.trim?.in) ? Math.max(0, Number(clip.trim?.in)) : 0;
  const rawEnd = Number.isFinite(clip.trim?.out) ? Number(clip.trim?.out) : NaN;
  if (!Number.isFinite(rawEnd) || rawEnd <= start) return null;
  return Math.max(0, rawEnd - start);
}

export function getCanonicalClipTimelineDuration(clip: ClipLike): number {
  const declaredDuration = Math.max(0, Number.isFinite(clip.duration) ? clip.duration : 0);
  const sourceDuration = getCanonicalClipSourceDuration(clip);
  if (sourceDuration === null) return declaredDuration;

  return Math.min(
    declaredDuration,
    sourceDuration / getCanonicalClipPlaybackRate(clip),
  );
}
