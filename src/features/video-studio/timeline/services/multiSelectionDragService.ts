import type { ClipNode, Track } from '../../project/types/project';
import { applyOverwritePlacement, applyRipplePlacement, type TimelineEditPolicy } from './timelineEditingEngine';

export interface InitialSelectedClip {
  clipId: string;
  trackId: string;
  initialStartAt: number;
  initialDuration: number;
}

/**
 * Resolves an all-or-nothing vertical track switch for a multi-selection.
 *
 * Business rule:
 * - every selected clip moves by the same timeline delta;
 * - a vertical drag shifts each selected clip by the same track-row offset;
 * - the destination track must exist, preserve the clip's track type, and be unlocked;
 * - if any selected clip cannot make the same row shift safely, the whole group
 *   stays on its original tracks (horizontal movement is still allowed).
 */
export function resolveMultiSelectionTrackTargets(
  tracks: readonly Track[],
  selectedClips: readonly InitialSelectedClip[],
  mainClipId: string,
  requestedMainTrackId: string,
  orderedTrackIds: readonly string[] = tracks.map((track) => track.id),
): Map<string, string> | null {
  if (selectedClips.length < 2) return null;

  const mainSelection = selectedClips.find((item) => item.clipId === mainClipId);
  if (!mainSelection) return null;

  const orderedTracks = orderedTrackIds
    .map((id) => tracks.find((track) => track.id === id))
    .filter((track): track is Track => Boolean(track));
  const mainSourceIndex = orderedTracks.findIndex((track) => track.id === mainSelection.trackId);
  const mainTargetIndex = orderedTracks.findIndex((track) => track.id === requestedMainTrackId);
  if (mainSourceIndex < 0 || mainTargetIndex < 0) return null;

  const rowDelta = mainTargetIndex - mainSourceIndex;
  if (rowDelta === 0) {
    return new Map(selectedClips.map((item) => [item.clipId, item.trackId]));
  }

  const targets = new Map<string, string>();

  for (const selection of selectedClips) {
    const sourceIndex = orderedTracks.findIndex((track) => track.id === selection.trackId);
    if (sourceIndex < 0) return null;

    const targetIndex = sourceIndex + rowDelta;
    if (targetIndex < 0 || targetIndex >= orderedTracks.length) return null;

    const sourceTrack = orderedTracks[sourceIndex];
    const targetTrack = orderedTracks[targetIndex];
    if (!sourceTrack || !targetTrack) return null;

    // Group movement must preserve each clip's lane type and never enter a locked lane.
    const sourceLaneRole = sourceTrack.laneRole ?? sourceTrack.type;
    const targetLaneRole = targetTrack.laneRole ?? targetTrack.type;
    if (targetLaneRole !== sourceLaneRole || targetTrack.isLocked) return null;

    targets.set(selection.clipId, targetTrack.id);
  }

  return targets;
}


export type MultiSelectionPlacementMode = 'ripple' | 'overwrite';

export interface MultiSelectionPlacementResult {
  tracks: Track[];
  changed: boolean;
}

/**
 * Applies Ripple/Overwrite collision resolution to a multi-selection as one
 * deterministic batch. Selected clips are never treated as overwrite targets
 * for one another; collisions are resolved only against non-selected clips.
 *
 * The selected set is sorted by (startAt, clipId) before collision resolution,
 * so the result does not depend on the order in which selection IDs arrived
 * from the UI.
 */
export function resolveMultiSelectionPlacement(
  tracks: readonly Track[],
  selectedClipIds: readonly string[],
  targetMap: ReadonlyMap<string, string>,
  mode: MultiSelectionPlacementMode,
  policy?: TimelineEditPolicy,
): MultiSelectionPlacementResult {
  const selectedIds = new Set(selectedClipIds);
  const movedByTarget = new Map<string, ClipNode[]>();
  const sourceTrackByClip = new Map<string, Track>();

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!selectedIds.has(clip.id)) continue;
      sourceTrackByClip.set(clip.id, track);
      const targetTrackId = targetMap.get(clip.id) ?? track.id;
      const bucket = movedByTarget.get(targetTrackId) ?? [];
      bucket.push(structuredClone(clip));
      movedByTarget.set(targetTrackId, bucket);
    }
  }

  // Cross-track multi-selection validates the semantic destination here; the
  // canonical placement path below then reuses compatible destination tracks
  // and applies the selected-group collision policy as one transaction.
  const crossTrackEntries = [...movedByTarget.entries()].filter(([targetTrackId, clips]) =>
    clips.some((clip) => sourceTrackByClip.get(clip.id)?.id !== targetTrackId),
  );

  if (crossTrackEntries.length > 0) {
    // Cross-track movement still uses the same placement path as horizontal
    // movement. Validation happens here, but the selected group is inserted
    // into the resolved destination tracks below so collision policy can see
    // the entire group at once. This prevents one selected clip from causing
    // an unnecessary dedicated track for every other member.
    for (const [targetTrackId, clips] of crossTrackEntries) {
      const targetTrack = tracks.find((track) => track.id === targetTrackId);
      if (!targetTrack || targetTrack.isLocked) {
        return { tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => structuredClone(clip)) })), changed: false };
      }
      for (const clip of clips) {
        const sourceTrack = sourceTrackByClip.get(clip.id);
        if (!sourceTrack) {
          return { tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((item) => structuredClone(item)) })), changed: false };
        }
        const sourceRole = sourceTrack.laneRole ?? sourceTrack.type;
        const targetRole = targetTrack.laneRole ?? targetTrack.type;
        if (sourceRole !== targetRole) {
          return { tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((item) => structuredClone(item)) })), changed: false };
        }
      }
    }
  }

  // Horizontal-only movement preserves the existing collision policy on the
  // current semantic lanes. Selected clips are never overwrite targets for one another.
  for (const [targetTrackId, movedClips] of movedByTarget) {
    const targetTrack = tracks.find((track) => track.id === targetTrackId);
    if (!targetTrack || targetTrack.isLocked) {
      return { tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => structuredClone(clip)) })), changed: false };
    }
    for (const movedClip of movedClips) {
      const sourceTrack = sourceTrackByClip.get(movedClip.id);
      if (!sourceTrack || (sourceTrack.laneRole ?? sourceTrack.type) !== (targetTrack.laneRole ?? targetTrack.type)) {
        return { tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => structuredClone(clip)) })), changed: false };
      }
    }
  }

  let changed = false;
  const nextTracks = tracks.map((track) => {
    const baseClips = track.clips.filter((clip) => !selectedIds.has(clip.id)).map((clip) => structuredClone(clip));
    const moved = (movedByTarget.get(track.id) ?? []).sort(
      (a, b) => (a.startAt - b.startAt) || a.id.localeCompare(b.id),
    );

    if (moved.length === 0) {
      return { ...track, clips: baseClips };
    }

    let collisionBase = baseClips;

    if (mode === 'ripple' && moved.length > 1) {
      // Ripple must treat the selected set as one rigid group. Resolve any
      // collision against a preceding clip by shifting the entire group by the
      // same delta, then ripple following non-selected clips from the group's
      // final end. This preserves intra-group spacing exactly.
      const groupStart = Math.min(...moved.map((clip) => clip.startAt));
      const groupEnd = Math.max(...moved.map((clip) => clip.startAt + clip.duration));
      const precedingEnd = Math.max(
        groupStart,
        ...collisionBase
          .filter((clip) => clip.startAt < groupStart && clip.startAt + clip.duration > groupStart)
          .map((clip) => clip.startAt + clip.duration),
      );
      const groupShift = Math.max(0, precedingEnd - groupStart);
      if (groupShift > 0) {
        moved.forEach((clip) => { clip.startAt += groupShift; });
      }

      const finalGroupEnd = groupEnd + groupShift;
      collisionBase = collisionBase.map((clip) => {
        const next = structuredClone(clip);
        if (next.startAt >= groupStart || next.startAt + next.duration > groupStart) {
          next.startAt = Math.max(next.startAt, finalGroupEnd);
        }
        return next;
      });
    } else {
      for (const movedClip of moved) {
        const syntheticTrack: Track = { ...track, clips: [...collisionBase, movedClip] };
        const resolved = mode === 'ripple'
          ? applyRipplePlacement(syntheticTrack, movedClip.id, policy)
          : applyOverwritePlacement(syntheticTrack, movedClip.id, policy);
        collisionBase = resolved.clips.filter((clip) => clip.id !== movedClip.id);
      }
    }

    const combined = [...collisionBase, ...moved].sort(
      (a, b) => (a.startAt - b.startAt) || a.id.localeCompare(b.id),
    );
    const original = [...baseClips, ...moved].sort(
      (a, b) => (a.startAt - b.startAt) || a.id.localeCompare(b.id),
    );
    if (JSON.stringify(combined) !== JSON.stringify(original)) changed = true;
    return { ...track, clips: combined };
  });

  changed = JSON.stringify(nextTracks) !== JSON.stringify(tracks);
  return { tracks: nextTracks, changed };
}

