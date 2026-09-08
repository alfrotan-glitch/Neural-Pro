import type { ClipNode, Track } from '../../project/types/project';
import { generateUUID } from '../../../../lib/uuid';

export interface TimelineEditPolicy {
  minClipDuration: number;
  preserveLockedClips: boolean;
}

export interface RippleEditResult {
  clips: ClipNode[];
  changed: boolean;
}

export interface OverwriteEditResult {
  clips: ClipNode[];
  changed: boolean;
}

const DEFAULT_POLICY: TimelineEditPolicy = {
  minClipDuration: 0.01,
  preserveLockedClips: true,
};

function cloneClip(clip: ClipNode): ClipNode {
  return structuredClone(clip);
}

function clipEnd(clip: ClipNode): number {
  return clip.startAt + clip.duration;
}

function isValidRange(startAt: number, duration: number, minDuration: number): boolean {
  return Number.isFinite(startAt) && Number.isFinite(duration) && startAt >= 0 && duration >= minDuration;
}

function canEditClip(_clip: ClipNode, trackLocked: boolean, _policy: TimelineEditPolicy): boolean {
  // A locked track is an immutable mutation boundary. Policy flags may tune
  // overlap behavior, but they must never bypass the project's lock rule.
  return !trackLocked;
}

/**
 * Ripple edit semantics:
 * - The moved/edited clip is placed at its already-computed startAt.
 * - Clips after the insertion point are shifted only enough to eliminate
 *   overlap with the edited clip, preserving their order and gaps.
 * - The engine never mutates a locked track, regardless of policy flags.
 * - It does not implicitly reorder the project's track array.
 */
export function applyRipplePlacement(
  track: Track,
  activeClipId: string,
  policy: TimelineEditPolicy = DEFAULT_POLICY,
): RippleEditResult {
  const active = track.clips.find((clip) => clip.id === activeClipId);
  if (!active || !canEditClip(active, track.isLocked, policy)) {
    return { clips: track.clips.map(cloneClip), changed: false };
  }

  const others = track.clips
    .filter((clip) => clip.id !== activeClipId)
    .map(cloneClip)
    .sort((a, b) => (a.startAt - b.startAt) || a.id.localeCompare(b.id));

  const result: ClipNode[] = [];
  let changed = false;

  // Ripple movement is non-destructive: it never trims or deletes a clip that
  // exists before the active clip. If the requested start overlaps a preceding
  // clip, the active clip is clamped to the first legal gap after that clip.
  // Overwrite mode is the explicit destructive mode for trimming/splitting.
  let effectiveActiveStart = active.startAt;
  for (const clip of others) {
    if (clip.startAt < effectiveActiveStart && clipEnd(clip) > effectiveActiveStart) {
      effectiveActiveStart = clipEnd(clip);
    }
  }
  if (effectiveActiveStart !== active.startAt) {
    active.startAt = effectiveActiveStart;
    changed = true;
  }

  let previousEnd = active.startAt + active.duration;

  for (const clip of others) {
    if (clipEnd(clip) <= active.startAt + 1e-9) {
      result.push(clip);
      continue;
    }

    const nextStart = Math.max(clip.startAt, previousEnd);
    if (nextStart !== clip.startAt) {
      clip.startAt = nextStart;
      changed = true;
    }
    result.push(clip);
    previousEnd = clipEnd(clip);
  }

  const finalClips = [cloneClip(active), ...result].sort(
    (a, b) => (a.startAt - b.startAt) || a.id.localeCompare(b.id),
  );

  return {
    clips: finalClips,
    changed: changed || JSON.stringify(finalClips) !== JSON.stringify(track.clips),
  };
}

/**
 * Overwrite semantics:
 * - The active clip occupies [start,end).
 * - Editable clips overlapping that interval are removed, trimmed or split.
 * - Locked clips are never modified. Their presence is an explicit conflict
 *   and prevents destructive overlap against them.
 * - Split IDs are regenerated with crypto-backed UUIDs.
 */
export function applyOverwritePlacement(
  track: Track,
  activeClipId: string,
  policy: TimelineEditPolicy = DEFAULT_POLICY,
): OverwriteEditResult {
  const active = track.clips.find((clip) => clip.id === activeClipId);
  if (!active || !canEditClip(active, track.isLocked, policy)) {
    return { clips: track.clips.map(cloneClip), changed: false };
  }

  const activeStart = active.startAt;
  const activeEnd = clipEnd(active);
  const result: ClipNode[] = [cloneClip(active)];
  let changed = false;

  for (const original of track.clips) {
    if (original.id === activeClipId) continue;

    const clip = cloneClip(original);
    const start = clip.startAt;
    const end = clipEnd(clip);

    if (end <= activeStart || start >= activeEnd) {
      result.push(clip);
      continue;
    }

    // Clip-level locking is not part of the current ClipNode model. The
    // Track-level mutation guard above is the authoritative lock boundary.
    // Therefore every clip on an editable track is an editable overwrite
    // target. `preserveLockedClips` remains in the public policy for API
    // compatibility and future per-clip locking, but cannot invent a lock
    // state that the data model does not contain.
    changed = true;

    // Fully covered by active clip: remove.
    if (start >= activeStart && end <= activeEnd) continue;

    // Active clip punches a hole in the middle: create left + right pieces.
    if (start < activeStart && end > activeEnd) {
      const leftDuration = activeStart - start;
      const rightDuration = end - activeEnd;

      if (leftDuration >= policy.minClipDuration) {
        const left = cloneClip(clip);
        left.id = generateUUID();
        left.duration = leftDuration;
        left.trim.out = left.trim.in + leftDuration;
        result.push(left);
      }

      if (rightDuration >= policy.minClipDuration) {
        const right = cloneClip(clip);
        right.id = generateUUID();
        right.startAt = activeEnd;
        right.duration = rightDuration;
        right.trim.in = right.trim.in + (activeEnd - start);
        result.push(right);
      }
      continue;
    }

    // Overlap on the right edge.
    if (start < activeStart && end > activeStart) {
      const duration = activeStart - start;
      if (duration >= policy.minClipDuration) {
        clip.duration = duration;
        clip.trim.out = clip.trim.in + duration;
        result.push(clip);
      }
      continue;
    }

    // Overlap on the left edge.
    if (start < activeEnd && end > activeEnd) {
      const duration = end - activeEnd;
      if (duration >= policy.minClipDuration) {
        clip.startAt = activeEnd;
        clip.duration = duration;
        clip.trim.in = clip.trim.in + (activeEnd - start);
        result.push(clip);
      }
    }
  }

  result.sort((a, b) => (a.startAt - b.startAt) || a.id.localeCompare(b.id));

  return { clips: result, changed };
}

export function applyRippleToTrack(
  track: Track,
  activeClipId: string,
  policy?: TimelineEditPolicy,
): Track {
  const result = applyRipplePlacement(track, activeClipId, policy);
  return { ...track, clips: result.clips };
}

export function applyOverwriteToTrack(
  track: Track,
  activeClipId: string,
  policy?: TimelineEditPolicy,
): Track {
  const result = applyOverwritePlacement(track, activeClipId, policy);
  return { ...track, clips: result.clips };
}
