import type { ClipNode, Track } from '../../project/types/project';

const EPSILON = 1e-7;
const DEFAULT_MIN_DURATION = 0.05;
const DEFAULT_SPEED = 1;

export type ProfessionalTrimMode =
  | 'normal-left'
  | 'normal-right'
  | 'ripple-left'
  | 'ripple-right'
  | 'roll';

export interface ProfessionalTrimOptions {
  deltaTime: number;
  minimumDuration?: number;
  mediaDuration?: number | null;
}

export interface ProfessionalTrimResult {
  tracks: Track[];
  changed: boolean;
  affectedClipIds: readonly string[];
  appliedDeltaTime: number;
  rejectedReason?: 'locked' | 'missing-clip' | 'invalid-delta' | 'no-adjacent-edit' | 'source-boundary';
}

function cloneTracks(tracks: readonly Track[]): Track[] {
  return structuredClone(tracks) as Track[];
}

function clipEnd(clip: Pick<ClipNode, 'startAt' | 'duration'>): number {
  return clip.startAt + clip.duration;
}

function speedOf(clip: ClipNode): number {
  const speed = Number(clip.properties?.speed);
  return Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_SPEED;
}

function trimInOf(clip: ClipNode): number {
  const value = Number(clip.trim?.in);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function trimOutOf(clip: ClipNode): number {
  const value = Number(clip.trim?.out);
  return Number.isFinite(value) && value >= trimInOf(clip)
    ? value
    : trimInOf(clip) + clip.duration * speedOf(clip);
}

function setTimelineAndTrim(clip: ClipNode, startAt: number, duration: number, trimIn: number): ClipNode {
  const next = structuredClone(clip);
  const safeDuration = Math.max(0, duration);
  const safeTrimIn = Math.max(0, trimIn);
  next.startAt = Math.max(0, startAt);
  next.duration = safeDuration;
  next.trim = {
    ...next.trim,
    in: safeTrimIn,
    out: safeTrimIn + safeDuration * speedOf(next),
  };
  return next;
}

function isInfiniteStaticAsset(clip: ClipNode): boolean {
  if (clip.properties?.imageUrl) return true;
  if (clip.properties?.textContent !== undefined) return true;
  const laneRole = clip.properties?.timelineLaneRole;
  if (laneRole === 'image' || laneRole === 'text' || laneRole === 'caption' || laneRole === 'effect' || laneRole === 'sticker' || laneRole === 'subtitle') return true;
  const hasVideo = typeof clip.properties?.videoUrl === 'string' && clip.properties.videoUrl.trim().length > 0;
  const hasAudio = typeof clip.properties?.audioUrl === 'string' && clip.properties.audioUrl.trim().length > 0;
  if (!hasVideo && !hasAudio) {
    return true;
  }
  return false;
}

function sourceDurationOf(clip: ClipNode, explicit?: number | null): number | null {
  if (isInfiniteStaticAsset(clip)) return null;
  if (explicit !== undefined) {
    return Number.isFinite(Number(explicit)) && Number(explicit) > 0 ? Number(explicit) : null;
  }
  const values = [clip.properties?.sourceMediaDuration, clip.properties?.mediaDuration, clip.properties?.sourceDuration]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length > 0 ? (values[0] ?? null) : null;
}

function normalizeMinimumDuration(value: number | undefined): number {
  return Math.max(DEFAULT_MIN_DURATION, Number.isFinite(value) ? Number(value) : DEFAULT_MIN_DURATION);
}

function resizeRightClip(
  clip: ClipNode,
  requestedDelta: number,
  minimumDuration: number,
  mediaDuration?: number | null,
): { clip: ClipNode; appliedDelta: number; rejected?: ProfessionalTrimResult['rejectedReason'] } {
  const targetDuration = Math.max(minimumDuration, clip.duration + requestedDelta);
  const sourceIn = trimInOf(clip);
  const speed = speedOf(clip);
  const sourceDuration = sourceDurationOf(clip, mediaDuration);
  let boundedDuration = targetDuration;

  if (sourceDuration !== null) {
    const remainingTimeline = Math.max(0, (sourceDuration - sourceIn) / speed);
    if (remainingTimeline + EPSILON < minimumDuration) {
      return { clip, appliedDelta: 0, rejected: 'source-boundary' };
    }
    boundedDuration = Math.min(boundedDuration, remainingTimeline);
  }

  boundedDuration = Math.max(minimumDuration, boundedDuration);
  const appliedDelta = boundedDuration - clip.duration;
  return {
    clip: appliedDelta === 0 ? clip : setTimelineAndTrim(clip, clip.startAt, boundedDuration, sourceIn),
    appliedDelta,
  };
}

function resizeLeftClip(
  clip: ClipNode,
  requestedDelta: number,
  minimumDuration: number,
  mediaDuration?: number | null,
): { clip: ClipNode; appliedDelta: number; rejected?: ProfessionalTrimResult['rejectedReason'] } {
  const minStart = Math.max(0, clip.startAt + clip.duration - minimumDuration);
  const requestedStart = clip.startAt + requestedDelta;
  const targetStart = Math.max(0, Math.min(minStart, requestedStart));
  const actualDelta = targetStart - clip.startAt;
  const speed = speedOf(clip);
  const sourceIn = trimInOf(clip);
  const sourceDuration = sourceDurationOf(clip, mediaDuration);
  let boundedDelta = actualDelta;

  if (sourceDuration !== null) {
    const maxTrimIn = Math.max(sourceIn, sourceDuration - minimumDuration * speed);
    const candidateTrimIn = Math.max(0, sourceIn + actualDelta * speed);
    const boundedTrimIn = Math.min(candidateTrimIn, maxTrimIn);
    boundedDelta = (boundedTrimIn - sourceIn) / speed;
  }

  const nextStart = clip.startAt + boundedDelta;
  const nextDuration = clip.duration - boundedDelta;
  if (nextDuration + EPSILON < minimumDuration) {
    return { clip, appliedDelta: 0, rejected: 'source-boundary' };
  }

  return {
    clip: boundedDelta === 0 ? clip : setTimelineAndTrim(clip, nextStart, nextDuration, sourceIn + boundedDelta * speed),
    appliedDelta: boundedDelta,
  };
}

function findTrackAndClip(tracks: readonly Track[], clipId: string): { track: Track; index: number; clip: ClipNode } | null {
  for (const track of tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0 && track.clips[index]) return { track, index, clip: track.clips[index] };
  }
  return null;
}

export function applyProfessionalTrim(
  tracks: readonly Track[],
  clipId: string,
  mode: Exclude<ProfessionalTrimMode, 'roll'>,
  options: ProfessionalTrimOptions,
): ProfessionalTrimResult {
  if (!Number.isFinite(options.deltaTime)) {
    return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'invalid-delta' };
  }

  const located = findTrackAndClip(tracks, clipId);
  if (!located) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'missing-clip' };
  if (located.track.isLocked) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'locked' };

  const minimumDuration = normalizeMinimumDuration(options.minimumDuration);
  const result = mode.endsWith('left')
    ? resizeLeftClip(located.clip, options.deltaTime, minimumDuration, options.mediaDuration)
    : resizeRightClip(located.clip, options.deltaTime, minimumDuration, options.mediaDuration);

  let effectiveDelta = result.appliedDelta;
  const nextTracks = cloneTracks(tracks);

  for (const track of nextTracks) {
    if (track.id !== located.track.id) continue;
    track.clips = track.clips.map((candidate) => candidate.id === clipId ? result.clip : candidate);
  }

  if (result.rejected || Math.abs(effectiveDelta) <= EPSILON) {
    return {
      tracks: nextTracks,
      changed: false,
      affectedClipIds: [],
      appliedDeltaTime: effectiveDelta,
      rejectedReason: result.rejected,
    };
  }

  const isRipple = mode.startsWith('ripple-');
  if (isRipple) {
    const nextEnd = clipEnd(result.clip);
    const originalEnd = clipEnd(located.clip);
    const shiftDelta = nextEnd - originalEnd;
    const threshold = located.clip.startAt + located.clip.duration;
    const targetTrack = nextTracks.find((track) => track.id === located.track.id);
    if (targetTrack) {
      targetTrack.clips = targetTrack.clips.map((candidate) => {
        if (candidate.id === clipId || candidate.startAt + EPSILON < threshold) return candidate;
        return { ...candidate, startAt: Math.max(0, candidate.startAt + shiftDelta) };
      });
    }
  }

  return {
    tracks: nextTracks,
    changed: JSON.stringify(nextTracks) !== JSON.stringify(tracks),
    affectedClipIds: isRipple
      ? nextTracks.find((track) => track.id === located.track.id)?.clips
        .filter((candidate) => candidate.id === clipId || candidate.startAt >= located.clip.startAt + located.clip.duration - EPSILON)
        .map((candidate) => candidate.id) ?? [clipId]
      : [clipId],
    appliedDeltaTime: effectiveDelta,
  };
}

export function applyRollEdit(
  tracks: readonly Track[],
  leftClipId: string,
  rightClipId: string,
  options: ProfessionalTrimOptions,
): ProfessionalTrimResult {
  if (!Number.isFinite(options.deltaTime)) {
    return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'invalid-delta' };
  }
  const left = findTrackAndClip(tracks, leftClipId);
  const right = findTrackAndClip(tracks, rightClipId);
  if (!left || !right || left.track.id !== right.track.id || left.clip.id === right.clip.id) {
    return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'no-adjacent-edit' };
  }
  if (left.track.isLocked) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'locked' };

  let leftEntry = left;
  let rightEntry = right;
  if (leftEntry.clip.startAt > rightEntry.clip.startAt) {
    [leftEntry, rightEntry] = [rightEntry, leftEntry];
  }

  const boundary = clipEnd(leftEntry.clip);
  if (Math.abs(boundary - rightEntry.clip.startAt) > EPSILON) {
    return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'no-adjacent-edit' };
  }

  const minimumDuration = normalizeMinimumDuration(options.minimumDuration);
  const maxDelta = rightEntry.clip.duration - minimumDuration;
  const minDelta = -(leftEntry.clip.duration - minimumDuration);
  const appliedDelta = Math.max(minDelta, Math.min(maxDelta, options.deltaTime));
  if (Math.abs(appliedDelta) <= EPSILON) {
    return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0 };
  }

  const nextTracks = cloneTracks(tracks);
  const targetTrack = nextTracks.find((track) => track.id === leftEntry.track.id);
  if (!targetTrack) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'missing-clip' };

  targetTrack.clips = targetTrack.clips.map((candidate) => {
    if (candidate.id === leftEntry.clip.id) {
      return resizeRightClip(candidate, appliedDelta, minimumDuration, options.mediaDuration).clip;
    }
    if (candidate.id === rightEntry.clip.id) {
      const nextStart = candidate.startAt + appliedDelta;
      const nextDuration = candidate.duration - appliedDelta;
      return setTimelineAndTrim(candidate, nextStart, nextDuration, trimInOf(candidate) + appliedDelta * speedOf(candidate));
    }
    return candidate;
  });

  return {
    tracks: nextTracks,
    changed: true,
    affectedClipIds: [leftEntry.clip.id, rightEntry.clip.id],
    appliedDeltaTime: appliedDelta,
  };
}

export function applySlipEdit(
  tracks: readonly Track[],
  clipId: string,
  deltaTime: number,
  mediaDuration?: number | null,
): ProfessionalTrimResult {
  if (!Number.isFinite(deltaTime)) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'invalid-delta' };
  const located = findTrackAndClip(tracks, clipId);
  if (!located) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'missing-clip' };
  if (located.track.isLocked) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'locked' };

  const clip = located.clip;
  const speed = speedOf(clip);
  const sourceIn = trimInOf(clip);
  const sourceOut = trimOutOf(clip);
  const sourceDuration = sourceDurationOf(clip, mediaDuration);
  const requestedSourceDelta = deltaTime * speed;
  let appliedSourceDelta = requestedSourceDelta;
  if (sourceDuration !== null) {
    const minDelta = -sourceIn;
    const maxDelta = sourceDuration - sourceOut;
    appliedSourceDelta = Math.max(minDelta, Math.min(maxDelta, requestedSourceDelta));
  }
  const appliedDelta = appliedSourceDelta / speed;
  if (Math.abs(appliedDelta) <= EPSILON) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0 };

  const nextTracks = cloneTracks(tracks);
  const targetTrack = nextTracks.find((track) => track.id === located.track.id);
  if (!targetTrack) return { tracks: cloneTracks(tracks), changed: false, affectedClipIds: [], appliedDeltaTime: 0, rejectedReason: 'missing-clip' };
  targetTrack.clips = targetTrack.clips.map((candidate) => {
    if (candidate.id !== clipId) return candidate;
    const next = structuredClone(candidate);
    next.trim = { ...next.trim, in: sourceIn + appliedSourceDelta, out: sourceOut + appliedSourceDelta };
    return next;
  });

  return { tracks: nextTracks, changed: true, affectedClipIds: [clipId], appliedDeltaTime: appliedDelta };
}
