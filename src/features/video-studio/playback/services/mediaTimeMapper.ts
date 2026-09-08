import type { ClipNode } from '../../project/types/project';
import { getCanonicalClipTimelineDuration } from '../../../../core/engine/clipTimelineDuration';

const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.0625;
const MAX_SPEED = 16;

export interface ClipSourceRange {
  start: number;
  end: number | null;
}

export function getClipPlaybackRate(clip: ClipNode): number {
  const raw = Number(clip.properties.speed);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, raw));
}

/**
 * Returns the source-media interval represented by this clip.
 * A null end means that the project clip does not currently expose a valid
 * source-out boundary and the mapper should not invent one.
 */
export function getClipSourceRange(clip: ClipNode): ClipSourceRange {
  const start = Math.max(0, Number.isFinite(clip.trim?.in) ? clip.trim.in : 0);
  const rawEnd = Number.isFinite(clip.trim?.out) ? clip.trim.out : NaN;
  const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : null;
  return { start, end };
}

/**
 * Maps project/timeline time to source-media time for a clip.
 * Timeline semantics are [startAt, startAt + duration).
 * Speed modifies how quickly source time is consumed.
 * When a valid trim-out exists, the result is clamped to it so playback can
 * never seek beyond the media interval represented by the clip.
 */
export function projectTimeToSourceTime(clip: ClipNode, projectTime: number): number {
  const speed = getClipPlaybackRate(clip);
  const { start, end } = getClipSourceRange(clip);
  const elapsedProjectTime = Math.max(0, projectTime - clip.startAt);
  const sourceTime = start + elapsedProjectTime * speed;
  return end === null ? sourceTime : Math.min(sourceTime, end);
}

export function getClipSourceDuration(clip: ClipNode): number | null {
  const { start, end } = getClipSourceRange(clip);
  return end === null ? null : Math.max(0, end - start);
}

export function getClipTimelineDurationFromSourceRange(clip: ClipNode): number | null {
  const sourceDuration = getClipSourceDuration(clip);
  if (sourceDuration === null) return null;
  return sourceDuration / getClipPlaybackRate(clip);
}

/**
 * Returns the timeline duration that can actually be represented by the clip's
 * declared source range at its current playback rate. An explicit timeline
 * duration may be shorter than the available source range, but it must never
 * make playback/export consume beyond trim.out.
 */
export function getEffectiveClipTimelineDuration(clip: ClipNode): number {
  return getCanonicalClipTimelineDuration(clip);
}

export function isClipActiveAt(clip: ClipNode, projectTime: number): boolean {
  if (clip.properties?.deactivated === true) return false;
  if (!Number.isFinite(projectTime) || !Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) return false;
  const effectiveDuration = getEffectiveClipTimelineDuration(clip);
  return projectTime >= clip.startAt && projectTime < clip.startAt + effectiveDuration;
}
export function sourceTimeToProjectTime(clip: ClipNode, sourceTime: number): number {
  const speed = getClipPlaybackRate(clip);
  const { start, end } = getClipSourceRange(clip);
  const boundedSource = end === null
    ? Math.max(start, Number.isFinite(sourceTime) ? sourceTime : start)
    : Math.min(
        end,
        Math.max(start, Number.isFinite(sourceTime) ? sourceTime : start),
      );

  const projectTime = clip.startAt + Math.max(0, (boundedSource - start) / speed);
  const projectEnd = clip.startAt + getEffectiveClipTimelineDuration(clip);
  return Math.min(projectEnd, projectTime);
}

