import type { ClipNode } from '../../project/types/project';
import { getClipPlaybackRate, getClipSourceRange, getEffectiveClipTimelineDuration } from '../../playback/services/mediaTimeMapper';

export interface ResolvedClipAudioMix {
  muted: boolean;
  levelDb: number;
  gain: number;
  pan: number;
  fadeGain: number;
  playbackRate: number;
  trimIn: number;
  trimOut: number | null;
  timelineStart: number;
  timelineEnd: number;
}

const MIN_DB = -80;
const MAX_DB = 24;
const MIN_FADE = 0;
const MAX_PAN = 1;

export function dbToGain(levelDb: number): number {
  const bounded = Number.isFinite(levelDb)
    ? Math.max(MIN_DB, Math.min(MAX_DB, levelDb))
    : 0;
  return Math.pow(10, bounded / 20);
}

export function clampPan(pan: number): number {
  return Number.isFinite(pan) ? Math.max(-MAX_PAN, Math.min(MAX_PAN, pan)) : 0;
}

export function clampFadeSeconds(value: unknown, duration: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= MIN_FADE) return 0;
  return Math.min(Math.max(0, duration), raw);
}

export function resolveFadeGain(
  clip: ClipNode,
  projectTime: number,
): number {
  const effectiveDuration = getEffectiveClipTimelineDuration(clip);
  if (projectTime < clip.startAt || projectTime >= clip.startAt + effectiveDuration) return 0;

  const localTime = Math.max(0, projectTime - clip.startAt);
  const fadeIn = clampFadeSeconds(clip.properties?.fadeIn, effectiveDuration);
  const fadeOut = clampFadeSeconds(clip.properties?.fadeOut, effectiveDuration);
  const fadeInGain = fadeIn > 0 ? Math.min(1, localTime / fadeIn) : 1;
  const remaining = Math.max(0, effectiveDuration - localTime);
  const fadeOutGain = fadeOut > 0 ? Math.min(1, remaining / fadeOut) : 1;

  return Math.max(0, Math.min(1, Math.min(fadeInGain, fadeOutGain)));
}

export function resolveClipAudioMix(
  clip: ClipNode,
  trackMuted: boolean,
  projectTime?: number,
): ResolvedClipAudioMix {
  const playbackRate = getClipPlaybackRate(clip);
  const { start: trimIn, end: trimOut } = getClipSourceRange(clip);
  const levelDb = Number.isFinite(Number(clip.properties?.levelDb))
    ? Number(clip.properties.levelDb)
    : 0;
  const pan = clampPan(Number(clip.properties?.pan ?? 0));
  const muted = Boolean(trackMuted || clip.properties?.muted || clip.properties?.isMuted);
  const fadeGain = projectTime === undefined ? 1 : resolveFadeGain(clip, projectTime);

  return {
    muted,
    levelDb,
    gain: dbToGain(levelDb),
    pan,
    fadeGain,
    playbackRate,
    trimIn,
    trimOut,
    timelineStart: clip.startAt,
    timelineEnd: clip.startAt + getEffectiveClipTimelineDuration(clip),
  };
}

export function getOfflineAudioSourceDuration(clip: ClipNode): number {
  const { start, end } = getClipSourceRange(clip);
  const playbackRate = getClipPlaybackRate(clip);
  const timelineDuration = getEffectiveClipTimelineDuration(clip);
  const maxSourceDuration = timelineDuration * playbackRate;
  if (end === null) return maxSourceDuration;
  return Math.min(Math.max(0, end - start), maxSourceDuration);
}
