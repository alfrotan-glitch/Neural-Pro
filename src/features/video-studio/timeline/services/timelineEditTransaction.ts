import { generateUUID } from '../../../../lib/uuid';
import type { ClipNode, Track } from '../../project/types/project';
import { pruneEmptyTracks } from '../../project/services/projectService';

const MIN_SPLIT_DURATION = 0.05;

export interface TimelineSplitResult {
  readonly left: ClipNode;
  readonly right: ClipNode;
}

export interface TimelineEditTransactionResult {
  readonly tracks: Track[];
  readonly affectedClipIds: readonly string[];
  readonly changed: boolean;
}

function cloneTracks(tracks: readonly Track[]): Track[] {
  return structuredClone(tracks) as Track[];
}

function speedOf(clip: ClipNode): number {
  const speed = Number(clip.properties?.speed);
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function trimInOf(clip: ClipNode): number {
  return Number.isFinite(clip.trim?.in) ? Math.max(0, Number(clip.trim.in)) : 0;
}

/**
 * Canonical blade operation. Timeline time is authoritative; source trim is
 * derived from the clip's playback rate so the two resulting clips represent
 * exactly the same source interval as the original clip.
 */
export function splitClipAtTimelineTime(
  clip: ClipNode,
  timelineTime: number,
): TimelineSplitResult | null {
  const start = Math.max(0, clip.startAt);
  const end = start + Math.max(0, clip.duration);
  const split = Number.isFinite(timelineTime) ? timelineTime : start;

  if (split <= start + MIN_SPLIT_DURATION || split >= end - MIN_SPLIT_DURATION) {
    return null;
  }

  const leftDuration = split - start;
  const rightDuration = end - split;
  const originalTrimIn = trimInOf(clip);
  const sourceRate = speedOf(clip);
  const sourceOffset = leftDuration * sourceRate;

  const left = structuredClone(clip);
  const right = structuredClone(clip);
  left.id = generateUUID();
  right.id = generateUUID();

  left.duration = leftDuration;
  left.trim = {
    ...left.trim,
    in: originalTrimIn,
    out: originalTrimIn + sourceOffset,
  };

  right.startAt = split;
  right.duration = rightDuration;
  right.trim = {
    ...right.trim,
    in: originalTrimIn + sourceOffset,
    out: originalTrimIn + (leftDuration + rightDuration) * sourceRate,
  };

  left.properties = { ...left.properties, splitFromClipId: clip.id, splitPart: 1 };
  right.properties = { ...right.properties, splitFromClipId: clip.id, splitPart: 2 };

  return { left, right };
}

/**
 * Applies a blade operation atomically. Unselected clips and locked tracks are
 * copied without modification. The returned structure is safe to pass to a
 * snapshot Command.
 */
export function splitTimelineClips(
  tracks: readonly Track[],
  targetClipIds: readonly string[],
  timelineTime: number,
): TimelineEditTransactionResult {
  const selected = new Set(targetClipIds);
  const affectedClipIds: string[] = [];
  let changed = false;

  const nextTracks = cloneTracks(tracks).map((track) => {
    if (track.isLocked) return track;

    const nextClips: ClipNode[] = [];
    for (const clip of track.clips) {
      if (!selected.has(clip.id)) {
        nextClips.push(clip);
        continue;
      }

      const split = splitClipAtTimelineTime(clip, timelineTime);
      if (!split) {
        nextClips.push(clip);
        continue;
      }

      nextClips.push(split.left, split.right);
      affectedClipIds.push(split.left.id, split.right.id);
      changed = true;
    }

    return { ...track, clips: nextClips };
  });

  return { tracks: nextTracks, affectedClipIds, changed };
}

/**
 * Deletes only the explicitly selected clips. This is the canonical isolated
 * delete boundary used by Timeline UI actions; ripple behavior is a separate
 * operation and must never be inferred from this helper.
 */
export function deleteSelectedTimelineClips(
  tracks: readonly Track[],
  selectedClipIds: readonly string[],
): TimelineEditTransactionResult {
  const selected = new Set(selectedClipIds);
  const affectedClipIds: string[] = [];
  let changed = false;

  const nextTracks = cloneTracks(tracks).map((track) => {
    if (track.isLocked) return track;
    const clips = track.clips.filter((clip) => {
      if (!selected.has(clip.id)) return true;
      affectedClipIds.push(clip.id);
      changed = true;
      return false;
    });
    return { ...track, clips };
  });

  return { tracks: pruneEmptyTracks(nextTracks), affectedClipIds, changed };
}

/**
 * Ripple-delete an explicitly selected set using merged time intervals per
 * semantic lane. A clip wholly after the deleted time is shifted left by the
 * amount removed before it; clips before the deleted interval are untouched.
 * Overlapping selected intervals are merged so an adjacent multi-selection
 * cannot double-shift later content.
 */
export function rippleDeleteTimelineClips(
  tracks: readonly Track[],
  selectedClipIds: readonly string[],
): TimelineEditTransactionResult {
  const selected = new Set(selectedClipIds);
  const affectedClipIds: string[] = [];
  let changed = false;

  const nextTracks = cloneTracks(tracks).map((track) => {
    if (track.isLocked) return track;

    const removed = track.clips
      .filter((clip) => selected.has(clip.id))
      .map((clip) => ({ start: clip.startAt, end: clip.startAt + clip.duration, id: clip.id }))
      .sort((a, b) => (a.start - b.start) || a.id.localeCompare(b.id));

    if (removed.length === 0) return track;

    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of removed) {
      const last = merged[merged.length - 1];
      if (!last || interval.start > last.end) {
        merged.push({ start: interval.start, end: interval.end });
      } else {
        last.end = Math.max(last.end, interval.end);
      }
    }

    const clips: ClipNode[] = [];
    for (const clip of track.clips) {
      if (selected.has(clip.id)) {
        affectedClipIds.push(clip.id);
        changed = true;
        continue;
      }

      const shift = merged.reduce((total, interval) =>
        interval.end <= clip.startAt ? total + (interval.end - interval.start) : total,
        0,
      );

      if (shift > 0) {
        clip.startAt = Math.max(0, clip.startAt - shift);
        changed = true;
      }
      clips.push(clip);
    }

    return { ...track, clips };
  });

  return { tracks: pruneEmptyTracks(nextTracks), affectedClipIds, changed };
}
