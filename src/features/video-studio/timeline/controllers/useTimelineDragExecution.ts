import { useEffect, useRef, type RefObject } from 'react';
import { useProjectStore } from '../../../../store/useProjectStore';
import { createTrackSnapshotCommand as createTracksSnapshotCommand } from '../../project/commands';
import type { ClipNode, Track, TimelineTrackLaneRole } from '../../project/types/project';
import { applyOverwritePlacement, applyRipplePlacement } from '../services/timelineEditingEngine';
import { applyProfessionalTrim, applyRollEdit, applySlipEdit } from '../services/timelineProfessionalTrimService';
import { resizeSelectedClips } from '../services/timelineResizeService';
import { pixelToTime, clientXToTimelinePixel, TIMELINE_HEADER_WIDTH } from '../geometry';
import { applyTimelineDraftToDom, resetTimelineDraftDom, commitTimelineDraftDom, createDraftDomContext } from './timelineDraftEngine';
import { createTimelineHitTestIndex, findTrackAtClientY, type TimelineHitTestIndex } from './timelineHitTest';
import { createTimelineSnapIndex, type TimelineSnapIndex } from '../engine/snapIndex';
import type { ActiveDrag } from '../components/timelineInteractionTypes';
import { resolveMultiSelectionTrackTargets, resolveMultiSelectionPlacement } from '../services/multiSelectionDragService';
import { getSelectionTimeBounds, resolveSharedResizeDelta } from '../services/multiSelectionGeometryService';
import { placeSingleClipOnCrossTrackDrop } from '../services/timelineTrackPlacementService';
import { pruneEmptyTracks, nextDedicatedTrackName } from '../../project/services/projectService';

export interface UseTimelineDragExecutionOptions {
  activeDrag: ActiveDrag | null;
  magneticSnapping: boolean;
  rippleMode: boolean;
  timelineEditMode?: 'normal' | 'ripple' | 'overwrite';
  currentTime: number;
  pixelsPerSecond: number;
  workspaceRef: RefObject<HTMLDivElement | null>;
  setActiveDrag: (drag: ActiveDrag | null) => void;
  setSnapLineTime: (time: number | null) => void;
}

/**
 * Owns the commit-time Timeline drag/trim/rate-stretch execution lifecycle.
 * The interaction controller creates ActiveDrag; this hook owns the document-level
 * pointer lifecycle and the final History Command.
 */
export function useTimelineDragExecution({
  activeDrag,
  magneticSnapping,
  rippleMode,
  timelineEditMode = rippleMode ? 'ripple' : 'normal',
  currentTime,
  pixelsPerSecond,
  workspaceRef,
  setActiveDrag,
  setSnapLineTime,
}: UseTimelineDragExecutionOptions): void {
  const {
    executeCommand,
    showToast,
  } = useProjectStore();

  const draftTracksRef = useRef<Track[] | null>(null);
  const pendingDraftRef = useRef<Track[] | null>(null);
  const pendingSnapLineRef = useRef<number | null>(null);
  const pendingHoveredTrackIdRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const snapIndexRef = useRef<TimelineSnapIndex | null>(null);
  const hitTestIndexRef = useRef<TimelineHitTestIndex | null>(null);
  const draftDomContextRef = useRef<ReturnType<typeof createDraftDomContext> | null>(null);
  const committedDragRef = useRef(false);
  const lastAutoScrollAtRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollTickRef = useRef(false);
  const latestPointerRef = useRef<{ pointerId: number; clientX: number; clientY: number; ctrlKey: boolean; metaKey: boolean } | null>(null);

  useEffect(() => {
  if (!activeDrag) return;

  const workspaceAtStart = workspaceRef.current;
  if (!workspaceAtStart) return;

  const hitTestIndex = createTimelineHitTestIndex(workspaceAtStart);
  hitTestIndexRef.current = hitTestIndex;
  const selectedClipIds = activeDrag.initialSelectedClips?.map((clip) => clip.clipId) ?? [activeDrag.clipId];
  draftDomContextRef.current = createDraftDomContext(workspaceAtStart, pixelsPerSecond, activeDrag.initialTracks, selectedClipIds);
  committedDragRef.current = false;

  draftTracksRef.current = structuredClone(activeDrag.initialTracks);
  pendingDraftRef.current = structuredClone(activeDrag.initialTracks);

  const excludedClipIds = new Set<string>(
    (activeDrag.initialSelectedClips ?? []).map((clip) => clip.clipId),
  );
  excludedClipIds.add(activeDrag.clipId);
  snapIndexRef.current = createTimelineSnapIndex(
    activeDrag.initialTracks,
    excludedClipIds,
    currentTime,
  );

  const isPointerNearAutoScrollEdge = (workspaceRect: DOMRect, clientX: number, clientY: number) =>
    clientX < workspaceRect.left + TIMELINE_HEADER_WIDTH + 40 ||
    clientX > workspaceRect.right - 40 ||
    clientY < workspaceRect.top + 40 ||
    clientY > workspaceRect.bottom - 40;

  const scheduleAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) return;
    autoScrollFrameRef.current = window.requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      const workspace = workspaceRef.current;
      const pointer = latestPointerRef.current;
      if (!workspace || !pointer || !activeDrag) return;

      const rect = workspace.getBoundingClientRect();
      if (!isPointerNearAutoScrollEdge(rect, pointer.clientX, pointer.clientY)) {
        lastAutoScrollAtRef.current = performance.now();
        return;
      }

      const now = performance.now();
      const previous = lastAutoScrollAtRef.current ?? now;
      const elapsedSeconds = Math.min(0.05, Math.max(0, now - previous) / 1000);
      lastAutoScrollAtRef.current = now;

      const edge = 40;
      const maxSpeed = 480;
      const velocity = (distance: number) => {
        if (distance <= 0) return 0;
        const normalized = Math.min(1, distance / edge);
        return maxSpeed * normalized * normalized;
      };

      const leftDistance = rect.left + TIMELINE_HEADER_WIDTH + edge - pointer.clientX;
      const rightDistance = pointer.clientX - (rect.right - edge);
      const topDistance = rect.top + edge - pointer.clientY;
      const bottomDistance = pointer.clientY - (rect.bottom - edge);
      const beforeLeft = workspace.scrollLeft;
      const beforeTop = workspace.scrollTop;

      if (leftDistance > 0) workspace.scrollLeft = Math.max(0, workspace.scrollLeft - velocity(leftDistance) * elapsedSeconds);
      else if (rightDistance > 0) workspace.scrollLeft += velocity(rightDistance) * elapsedSeconds;
      if (topDistance > 0) workspace.scrollTop = Math.max(0, workspace.scrollTop - velocity(topDistance) * elapsedSeconds);
      else if (bottomDistance > 0) workspace.scrollTop += velocity(bottomDistance) * elapsedSeconds;

      if (workspace.scrollLeft !== beforeLeft || workspace.scrollTop !== beforeTop) {
        autoScrollTickRef.current = true;
        handlePointerMove({
          pointerId: pointer.pointerId,
          clientX: pointer.clientX,
          clientY: pointer.clientY,
          ctrlKey: pointer.ctrlKey,
          metaKey: pointer.metaKey,
        } as PointerEvent);
        autoScrollTickRef.current = false;
      }

      if (isPointerNearAutoScrollEdge(workspace.getBoundingClientRect(), pointer.clientX, pointer.clientY)) {
        scheduleAutoScroll();
      }
    });
  };

  const flushFrame = () => {
    frameRef.current = null;
    const workspace = workspaceRef.current;
    if (!workspace || !activeDrag) return;
    const draft = pendingDraftRef.current;
    if (!draft) return;
    draftTracksRef.current = draft;
    const domContext = draftDomContextRef.current;
    if (domContext) {
      applyTimelineDraftToDom(domContext, activeDrag.initialTracks, draft, activeDrag, pendingHoveredTrackIdRef.current);
    }
    setSnapLineTime(pendingSnapLineRef.current);
  };

  const scheduleFrame = () => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(flushFrame);
  };

  const isResizeDeltaFeasible = (
    tracks: readonly Track[],
    selectedIds: readonly string[],
    deltaTime: number,
    side: 'left' | 'right',
  ): boolean => {
    const preview = resizeSelectedClips(tracks, selectedIds, {
      deltaTime,
      side,
      minimumDuration: 0.2,
    });
    const selected = new Set(selectedIds);
    const epsilon = 1e-9;
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (!selected.has(clip.id)) continue;
        const resizedTrack = preview.tracks.find((candidate) => candidate.id === track.id);
        const resized = resizedTrack?.clips.find((candidate) => candidate.id === clip.id);
        if (!resized) return false;
        if (side === 'right') {
          if (Math.abs((resized.duration - clip.duration) - deltaTime) > epsilon) return false;
        } else {
          if (Math.abs((resized.startAt - clip.startAt) - deltaTime) > epsilon) return false;
        }
      }
    }
    return true;
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerId !== activeDrag.pointerId) return;
    latestPointerRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    };
    const workspaceElement = workspaceRef.current;
    if (!workspaceElement) return;

    // Rebuild hit-test geometry after every potential scroll. Virtualized rows can
    // enter/leave the DOM while dragging, so a start-of-gesture snapshot is not a
    // safe source of truth for the row currently underneath the pointer.
    const workspaceRect = workspaceElement.getBoundingClientRect();
    const autoScrollEdgePx = 40;
    if (!autoScrollTickRef.current) {
      const now = performance.now();
      const previous = lastAutoScrollAtRef.current ?? now;
      const elapsedSeconds = Math.min(0.05, Math.max(0, now - previous) / 1000);
      lastAutoScrollAtRef.current = now;

      // Auto-scroll is time-based rather than event-count based. Pointer event
      // frequency differs across browsers/devices, so a fixed per-event step
      // would make the same gesture scroll unpredictably fast or slow.
      const autoScrollMaxSpeedPxPerSecond = 480;
      const scrollVelocity = (distance: number) => {
        if (distance <= 0) return 0;
        const normalized = Math.min(1, distance / autoScrollEdgePx);
        return autoScrollMaxSpeedPxPerSecond * normalized * normalized;
      };

      const leftDistance = workspaceRect.left + TIMELINE_HEADER_WIDTH + autoScrollEdgePx - e.clientX;
      const rightDistance = e.clientX - (workspaceRect.right - autoScrollEdgePx);
      const topDistance = workspaceRect.top + autoScrollEdgePx - e.clientY;
      const bottomDistance = e.clientY - (workspaceRect.bottom - autoScrollEdgePx);

      if (leftDistance > 0) workspaceElement.scrollLeft = Math.max(0, workspaceElement.scrollLeft - scrollVelocity(leftDistance) * elapsedSeconds);
      else if (rightDistance > 0) workspaceElement.scrollLeft += scrollVelocity(rightDistance) * elapsedSeconds;
      if (topDistance > 0) workspaceElement.scrollTop = Math.max(0, workspaceElement.scrollTop - scrollVelocity(topDistance) * elapsedSeconds);
      else if (bottomDistance > 0) workspaceElement.scrollTop += scrollVelocity(bottomDistance) * elapsedSeconds;

      if (isPointerNearAutoScrollEdge(workspaceRect, e.clientX, e.clientY)) scheduleAutoScroll();
    }

    const currentHitTestIndex = createTimelineHitTestIndex(workspaceElement);
    hitTestIndexRef.current = currentHitTestIndex;

    const timelinePixel = clientXToTimelinePixel({
      clientX: e.clientX,
      workspaceRectLeft: currentHitTestIndex.workspaceRect.left,
      scrollLeft: workspaceElement.scrollLeft,
      pixelsPerSecond,
    });
    let currentMouseTime = pixelToTime(timelinePixel, pixelsPerSecond);

    let deltaTime = currentMouseTime - activeDrag.startMouseTime;
    const currentTracks = activeDrag.initialTracks;
    
    const sourceTrack = currentTracks.find(t => t.id === activeDrag.trackId);
    if (!sourceTrack) return;
    const clip = sourceTrack.clips.find(c => c.id === activeDrag.clipId);
    if (!clip) return;

    let nextTracks = [...currentTracks];

    // Handle horizontal / vertical movement & track switching
    if (activeDrag.dragMode === 'move') {
      // Ensure that for any clip, targetStartAt doesn't go below 0.
      let minInitialStart = Infinity;
      if (activeDrag.initialSelectedClips && activeDrag.initialSelectedClips.length > 0) {
        activeDrag.initialSelectedClips.forEach(c => {
          if (c.initialStartAt < minInitialStart) {
            minInitialStart = c.initialStartAt;
          }
        });
      } else {
        minInitialStart = activeDrag.initialStartAt;
      }

      // Limit deltaTime so that no clip moves before 0
      if (deltaTime < -minInitialStart) {
        deltaTime = -minInitialStart;
      }

      let targetStartAt = activeDrag.initialStartAt + deltaTime;
      targetStartAt = Math.max(0, targetStartAt);

      // Magnetic Snapping logic. For a multi-selection, snap the actual group
      // boundary rather than the lead clip, preserving every selected clip's
      // relative spacing.
      if (magneticSnapping) {
        const threshold = 10 / Math.max(1, pixelsPerSecond);
        const snapIndex = snapIndexRef.current;
        const selectedIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
        const groupBounds = getSelectionTimeBounds(currentTracks, selectedIds);
        const groupStart = groupBounds?.startAt ?? activeDrag.initialStartAt;
        const groupEnd = groupBounds?.endAt ?? (activeDrag.initialStartAt + activeDrag.initialDuration);
        const startMatch = snapIndex?.nearest(groupStart + deltaTime, threshold) ?? null;
        const endMatch = snapIndex?.nearest(groupEnd + deltaTime, threshold) ?? null;

        if (endMatch && (!startMatch || endMatch.distance < startMatch.distance)) {
          const snappedDelta = endMatch.time - groupEnd;
          targetStartAt = Math.max(0, activeDrag.initialStartAt + snappedDelta);
          deltaTime = snappedDelta;
          pendingSnapLineRef.current = endMatch.time;
        } else if (startMatch) {
          const snappedDelta = startMatch.time - groupStart;
          targetStartAt = Math.max(0, activeDrag.initialStartAt + snappedDelta);
          deltaTime = snappedDelta;
          pendingSnapLineRef.current = startMatch.time;
        } else {
          pendingSnapLineRef.current = null;
        }
      } else {
        pendingSnapLineRef.current = null;
        scheduleFrame();
      }

      // Track switching detection based on vertical cursor coordinates
      let finalTrackId = activeDrag.trackId;
      const trackRow = findTrackAtClientY(currentHitTestIndex, e.clientY, workspaceElement.scrollTop);
      if (trackRow) {
        pendingHoveredTrackIdRef.current = trackRow.trackId;
        const hoveredTrackId = trackRow.trackId;
        const hoveredTrackLaneRole = trackRow.trackLaneRole;
        const sourceLaneRole = (sourceTrack.laneRole ?? sourceTrack.type);
        if (hoveredTrackId && (hoveredTrackLaneRole === sourceLaneRole || hoveredTrackId === activeDrag.trackId)) {
          const hoveredTrack = currentTracks.find((candidate) => candidate.id === hoveredTrackId);
          const isLocked = hoveredTrack?.isLocked === true;
          if (!isLocked) finalTrackId = hoveredTrackId;
        }
      } else {
        pendingHoveredTrackIdRef.current = null;
      }

      // Multi-selection move is atomic across lanes: all selected clips share the
      // same horizontal delta and the same vertical row offset. If any destination
      // lane is invalid, the whole group stays on its original lanes.
      if (activeDrag.initialSelectedClips && activeDrag.initialSelectedClips.length > 1) {
        const targetMap = resolveMultiSelectionTrackTargets(
          currentTracks,
          activeDrag.initialSelectedClips,
          activeDrag.clipId,
          finalTrackId,
        );

        nextTracks = currentTracks.map(t => {
          const otherClips = t.clips.filter(c =>
            !activeDrag.initialSelectedClips!.some(sel => sel.clipId === c.id),
          );
          const movedClipsOnThisTrack: ClipNode[] = [];

          activeDrag.initialSelectedClips!.forEach(sel => {
            const originalTrack = currentTracks.find(ot => ot.id === sel.trackId);
            const originalClip = originalTrack?.clips.find(oc => oc.id === sel.clipId);
            if (!originalClip) return;

            const targetTrackId = targetMap?.get(sel.clipId) ?? sel.trackId;
            if (t.id === targetTrackId) {
              const newStart = sel.initialStartAt + deltaTime;
              movedClipsOnThisTrack.push({
                ...originalClip,
                startAt: Math.max(0, newStart),
              });
            }
          });

          return {
            ...t,
            clips: [...otherClips, ...movedClipsOnThisTrack],
          };
        });
      } else {
        nextTracks = currentTracks.map(t => {
          if (t.id === activeDrag.trackId && t.id === finalTrackId) {
            return {
              ...t,
              clips: t.clips.map(c => c.id === activeDrag.clipId ? { ...c, startAt: targetStartAt } : c)
            };
          } else if (t.id === activeDrag.trackId) {
            return {
              ...t,
              clips: t.clips.filter(c => c.id !== activeDrag.clipId)
            };
          } else if (t.id === finalTrackId) {
            const updatedClip = { ...clip, startAt: targetStartAt };
            return {
              ...t,
              clips: [...t.clips.filter(c => c.id !== activeDrag.clipId), updatedClip]
            };
          }
          return t;
        });
      }

      // Slip changes only the source window; timeline position/duration stay fixed.
    } else if (activeDrag.dragMode === 'slip') {
      nextTracks = applySlipEdit(currentTracks, activeDrag.clipId, deltaTime).tracks;
      pendingSnapLineRef.current = null;
      scheduleFrame();

      // Roll moves the shared boundary between this clip and its adjacent pair.
    } else if (activeDrag.dragMode === 'roll') {
      const pairedClipId = activeDrag.pairedClipId;
      nextTracks = pairedClipId
        ? applyRollEdit(currentTracks, activeDrag.clipId, pairedClipId, { deltaTime, minimumDuration: 0.2 }).tracks
        : currentTracks;
      pendingSnapLineRef.current = null;
      scheduleFrame();

      // Handle rate-stretch tool: drag horizontally to retime the clip while
      // preserving its source content by adjusting speed inversely to duration.
    } else if (activeDrag.dragMode === 'rate-stretch') {
      const minimumDuration = 0.2;
      const newDuration = Math.max(minimumDuration, activeDrag.initialDuration + deltaTime);
      const newSpeed = Math.max(
        0.05,
        Math.min(
          16,
          (activeDrag.initialDuration * activeDrag.initialSpeed) / newDuration,
        ),
      );
      nextTracks = currentTracks.map((track) => {
        if (track.isLocked) return track;
        return {
          ...track,
          clips: track.clips.map((candidateClip) =>
            candidateClip.id === activeDrag.clipId
              ? {
                  ...candidateClip,
                  duration: newDuration,
                  properties: {
                    ...candidateClip.properties,
                    speed: newSpeed,
                    variableSpeedEnabled: true,
                    rateStretchSourceDuration: activeDrag.initialDuration,
                  },
                  trim: {
                    ...candidateClip.trim,
                    out: (candidateClip.trim?.in ?? 0) + newDuration * newSpeed,
                  },
                }
              : candidateClip,
          ),
        };
      });

      pendingSnapLineRef.current = null;
        scheduleFrame();

      // Handle left edge resizing / Speed stretching
    } else if (activeDrag.dragMode === 'trim-left') {
      const selectedIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
      let groupResizeDelta = resolveSharedResizeDelta(currentTracks, selectedIds, deltaTime, 'left');
      let targetLeft = activeDrag.initialStartAt + groupResizeDelta;
      targetLeft = Math.max(0, targetLeft);
      deltaTime = targetLeft - activeDrag.initialStartAt;

      if (magneticSnapping) {
        const threshold = 10 / Math.max(1, pixelsPerSecond);
        const groupBounds = getSelectionTimeBounds(currentTracks, selectedIds);
        const currentGroupStart = (groupBounds?.startAt ?? activeDrag.initialStartAt) + deltaTime;
        const match = snapIndexRef.current?.nearest(currentGroupStart, threshold) ?? null;
        if (match) {
          const snappedDelta = match.time - (groupBounds?.startAt ?? activeDrag.initialStartAt);
          const feasibleDelta = resolveSharedResizeDelta(currentTracks, selectedIds, snappedDelta, 'left');
          if (Math.abs(feasibleDelta - snappedDelta) <= 1e-8) {
            deltaTime = snappedDelta;
            groupResizeDelta = snappedDelta;
            targetLeft = Math.max(0, activeDrag.initialStartAt + snappedDelta);
            pendingSnapLineRef.current = match.time;
          } else {
            // The candidate would be clamped by minimum duration or source bounds.
            // Never display a snap guide that the actual resize cannot honor.
            pendingSnapLineRef.current = null;
          }
        } else {
          pendingSnapLineRef.current = null;
        }
      } else {
        pendingSnapLineRef.current = null;
        scheduleFrame();
      }

      // Resize is a pure geometry operation. The dedicated service keeps the
      // requested duration stable and updates source trim consistently.
      if (e.ctrlKey || e.metaKey) {
        nextTracks = currentTracks.map(t => {
          if (t.isLocked) return t;
          return {
            ...t,
            clips: t.clips.map(c => {
              const sel = activeDrag.initialSelectedClips?.find(s => s.clipId === c.id);
              if (!sel) return c;
              const sharedDelta = resolveSharedResizeDelta(currentTracks, selectedIds, deltaTime, 'left');
              const itemTargetLeft = Math.max(0, sel.initialStartAt + sharedDelta);
              const nextDuration = Math.max(0.2, sel.initialStartAt + sel.initialDuration - itemTargetLeft);
              const initialSpeed = Number(c.properties?.speed) > 0 ? Number(c.properties.speed) : 1;
              const newSpeed = (sel.initialDuration * initialSpeed) / nextDuration;
              const initialTrimIn = Number.isFinite(c.trim?.in) ? Number(c.trim.in) : 0;
              const initialTrimOut = Number.isFinite(c.trim?.out) ? Number(c.trim.out) : initialTrimIn + sel.initialDuration * initialSpeed;
              const newTrimIn = Math.max(0, initialTrimIn + (itemTargetLeft - sel.initialStartAt) * initialSpeed);
              return {
                ...c,
                startAt: itemTargetLeft,
                duration: nextDuration,
                properties: { ...c.properties, speed: newSpeed },
                trim: { ...c.trim, in: newTrimIn, out: newTrimIn + nextDuration * newSpeed },
              };
            }),
          };
        });
      } else {
        const selectedIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
        if (timelineEditMode === 'ripple' && selectedIds.length === 1) {
          nextTracks = applyProfessionalTrim(currentTracks, activeDrag.clipId, 'ripple-left', { deltaTime, minimumDuration: 0.2 }).tracks;
        } else {
          nextTracks = resizeSelectedClips(currentTracks, selectedIds, { deltaTime, side: 'left' }).tracks;
        }
      }

    // Handle right edge resizing / Speed stretching
    } else if (activeDrag.dragMode === 'trim-right') {
      const selectedIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
      let groupResizeDelta = resolveSharedResizeDelta(currentTracks, selectedIds, deltaTime, 'right');
      const initialGroupBounds = getSelectionTimeBounds(currentTracks, selectedIds);
      const baseGroupEnd = initialGroupBounds?.endAt ?? (activeDrag.initialStartAt + activeDrag.initialDuration);
      let targetRight = baseGroupEnd + groupResizeDelta;
      deltaTime = groupResizeDelta;

      if (magneticSnapping) {
        const threshold = 10 / Math.max(1, pixelsPerSecond);
        const currentGroupEnd = baseGroupEnd + deltaTime;
        const match = snapIndexRef.current?.nearest(currentGroupEnd, threshold) ?? null;
        if (match) {
          const snappedDelta = match.time - baseGroupEnd;
          const feasibleDelta = resolveSharedResizeDelta(currentTracks, selectedIds, snappedDelta, 'right');
          if (Math.abs(feasibleDelta - snappedDelta) <= 1e-8) {
            targetRight = match.time;
            pendingSnapLineRef.current = targetRight;
            deltaTime = snappedDelta;
            groupResizeDelta = snappedDelta;
          } else {
            // The candidate would be clamped by minimum duration or source bounds.
            // Never display a snap guide that the actual resize cannot honor.
            pendingSnapLineRef.current = null;
          }
        } else {
          pendingSnapLineRef.current = null;
        }
      } else {
        pendingSnapLineRef.current = null;
        scheduleFrame();
      }

      // Resize is a pure geometry operation. Do not run collision placement
      // here; that belongs exclusively to ordinary move/drop operations.
      if (e.ctrlKey || e.metaKey) {
        nextTracks = currentTracks.map(t => {
          if (t.isLocked) return t;
          return {
            ...t,
            clips: t.clips.map(c => {
              const sel = activeDrag.initialSelectedClips?.find(s => s.clipId === c.id);
              if (!sel) return c;
              const sharedDelta = resolveSharedResizeDelta(currentTracks, selectedIds, deltaTime, 'right');
              const nextDuration = Math.max(0.2, sel.initialDuration + sharedDelta);
              const initialSpeed = Number(c.properties?.speed) > 0 ? Number(c.properties.speed) : 1;
              const newSpeed = (sel.initialDuration * initialSpeed) / nextDuration;
              const trimIn = Number.isFinite(c.trim?.in) ? Number(c.trim.in) : 0;
              return {
                ...c,
                duration: nextDuration,
                properties: { ...c.properties, speed: newSpeed },
                trim: { ...c.trim, in: trimIn, out: trimIn + nextDuration * newSpeed },
              };
            }),
          };
        });
      } else {
        const selectedIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
        if (timelineEditMode === 'ripple' && selectedIds.length === 1) {
          nextTracks = applyProfessionalTrim(currentTracks, activeDrag.clipId, 'ripple-right', { deltaTime, minimumDuration: 0.2 }).tracks;
        } else {
          nextTracks = resizeSelectedClips(currentTracks, selectedIds, { deltaTime, side: 'right' }).tracks;
        }
      }
    }

    pendingDraftRef.current = nextTracks;
    scheduleFrame();
  };

  const handlePointerCancel = (e: PointerEvent) => {
    if (e.pointerId !== activeDrag.pointerId) return;

    // Cancellation is a rollback boundary, never a commit boundary.
    // Discard the in-memory draft and any pending animation frame so a
    // cancelled pointer gesture cannot leak a mutation into History.
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    latestPointerRef.current = null;
    autoScrollTickRef.current = false;

    const draftWorkspace = workspaceRef.current;
    if (draftWorkspace) {
      const selectedClipIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
      resetTimelineDraftDom(draftWorkspace, activeDrag.initialTracks, pixelsPerSecond, selectedClipIds);
    }

    draftTracksRef.current = null;
    pendingDraftRef.current = null;
    pendingSnapLineRef.current = null;
    hitTestIndexRef.current = null;
    draftDomContextRef.current = null;
    snapIndexRef.current = null;

    setSnapLineTime(null);
    setActiveDrag(null);
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerId !== activeDrag.pointerId) return;

    // The animation frame is only a visual-preview scheduler. It is not the
    // source of truth for the committed gesture. A release can arrive before
    // the last requestAnimationFrame callback, so synchronously calculate the
    // final draft from the actual pointerup coordinates first. This makes the
    // transaction close on the latest user input rather than on the previous
    // rendered draft.
    autoScrollTickRef.current = true;
    try {
      handlePointerMove(e);
    } finally {
      autoScrollTickRef.current = false;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const initialTracks = activeDrag.initialTracks;
    let finalTracks = structuredClone(
      pendingDraftRef.current ?? draftTracksRef.current ?? activeDrag.initialTracks,
    ) as Track[];
    const draftWorkspace = workspaceRef.current;

    const activeClipEntry = finalTracks
      .map((track) => ({ track, clip: track.clips.find((candidate) => candidate.id === activeDrag.clipId) }))
      .find((entry): entry is { track: Track; clip: ClipNode } => Boolean(entry.clip));
    let activeClipTrackId = activeClipEntry?.track.id ?? activeDrag.trackId;
    let rejectMoveTransaction = false;

    // Resolve the actual destination row from the pointerup location before any
    // placement mutation. A locked destination is a hard transaction boundary:
    // the entire move must be rejected, including horizontal movement.
    const finalWorkspace = workspaceRef.current;
    const finalHitTestIndex = finalWorkspace
      ? createTimelineHitTestIndex(finalWorkspace)
      : null;
    const finalDropRow = finalHitTestIndex && finalWorkspace
      ? findTrackAtClientY(finalHitTestIndex, e.clientY, finalWorkspace.scrollTop)
      : null;
    const initialSourceTrack = initialTracks.find((track) => track.id === activeDrag.trackId);
    const finalDropTrack = finalDropRow
      ? initialTracks.find((track) => track.id === finalDropRow.trackId)
      : null;

    if (activeClipEntry && finalDropTrack && finalDropTrack.id !== activeDrag.trackId && finalDropTrack.isLocked) {
      rejectMoveTransaction = true;
    }

    if (
      activeClipEntry &&
      activeDrag.initialSelectedClips &&
      activeDrag.initialSelectedClips.length > 1 &&
      finalDropTrack &&
      finalDropTrack.id !== activeDrag.trackId
    ) {
      const orderedIds = finalHitTestIndex?.rows.map((row) => row.trackId) ?? initialTracks.map((track) => track.id);
      const atomicTargetMap = resolveMultiSelectionTrackTargets(
        initialTracks,
        activeDrag.initialSelectedClips,
        activeDrag.clipId,
        finalDropTrack.id,
        orderedIds,
      );
      if (!atomicTargetMap) rejectMoveTransaction = true;
    }

    if (activeClipEntry && !(rejectMoveTransaction && activeDrag.dragMode === 'move')) {
      const clipToMove = activeClipEntry.clip;
      // Resize/rate-stretch is a geometry edit, not a placement edit. Never run
      // Ripple/Overwrite after a trim/rate gesture because those policies can
      // legitimately modify neighbouring clips and make the released resize
      // appear to snap back or shrink.
      if (activeDrag.dragMode === 'trim-left' || activeDrag.dragMode === 'trim-right' || activeDrag.dragMode === 'rate-stretch' || activeDrag.dragMode === 'roll' || activeDrag.dragMode === 'slip') {
        // The draft already contains the final geometry; commit it exactly as
        // previewed and do not apply placement resolution a second time.
      } else {
        // Check for dropzone creation
        const elem = document.elementFromPoint(e.clientX, e.clientY);
        const isNewTrackDropzone = elem?.closest('[data-new-track-dropzone]') !== null;
        
        if (isNewTrackDropzone) {
        const newTrackId = crypto.randomUUID();
        const newTrack: Track = {
          id: newTrackId,
          type: activeDrag.trackType,
          isLocked: false,
          isMuted: false,
          isVisible: true,
          clips: [clipToMove]
        };
        
        finalTracks = finalTracks.map(t => {
          if (t.id === activeClipTrackId) {
            return { ...t, clips: t.clips.filter(c => c.id !== clipToMove.id) };
          }
          return t;
        });
        finalTracks.push(newTrack);
        activeClipTrackId = newTrackId;
      } else {
        if (finalHitTestIndex) {
          hitTestIndexRef.current = finalHitTestIndex;
        }
        const dropRow = finalDropRow;
        const sourceTrack = initialSourceTrack;
        const clipToDrop = sourceTrack?.clips.find((candidate) => candidate.id === activeDrag.clipId);
        const sourceLaneRole = sourceTrack?.laneRole ?? sourceTrack?.type;
        const dropTrack = finalDropTrack;

        // A clip may never be dropped into a different semantic lane. Instead,
        // create a new lane of the clip's own role at the requested visual row.
        if (activeDrag.initialSelectedClips?.length === 1 && dropTrack && sourceTrack && clipToDrop && sourceLaneRole && (dropTrack.laneRole ?? dropTrack.type) !== sourceLaneRole) {
          if (!dropTrack.isLocked) {
            const newTrackId = crypto.randomUUID();
            const newTrack: Track = {
              id: newTrackId,
              type: sourceTrack.type,
              laneRole: sourceLaneRole as TimelineTrackLaneRole,
              name: nextDedicatedTrackName(finalTracks, sourceLaneRole as TimelineTrackLaneRole),
              isLocked: false,
              isMuted: false,
              isVisible: true,
              clips: [{ ...clipToMove, startAt: clipToMove.startAt }],
            };
            finalTracks = finalTracks.map((track) => ({
              ...track,
              clips: track.clips.filter((clip) => clip.id !== activeDrag.clipId),
            }));
            const orderedIndex = finalTracks.findIndex((track) => track.id === dropTrack.id);
            finalTracks.splice(Math.max(0, orderedIndex), 0, newTrack);
            activeClipTrackId = newTrackId;
          }
        }

        if (activeDrag.initialSelectedClips?.length === 1 && dropTrack && sourceTrack && sourceLaneRole && (dropTrack.laneRole ?? dropTrack.type) === sourceLaneRole && dropTrack.id !== sourceTrack.id) {
          const placement = placeSingleClipOnCrossTrackDrop(finalTracks, activeDrag.clipId, sourceTrack.id, dropTrack.id);
          if (placement) {
            finalTracks = placement.tracks;
            activeClipTrackId = placement.trackId;
          }
        }

        if (activeDrag.initialSelectedClips && activeDrag.initialSelectedClips.length > 1) {
          const targetMap = resolveMultiSelectionTrackTargets(
            finalTracks,
            activeDrag.initialSelectedClips,
            activeDrag.clipId,
            activeClipTrackId,
            hitTestIndexRef.current?.rows.map((row) => row.trackId) ?? finalTracks.map((track) => track.id),
          );
          if (targetMap) {
            const selectedIds = activeDrag.initialSelectedClips!.map(sel => sel.clipId);
            if (timelineEditMode === 'normal') {
              // Normal NLE move: only the selected clips move. No collision
              // resolution is allowed to mutate unrelated clips.
            } else {
              finalTracks = resolveMultiSelectionPlacement(
                finalTracks,
                selectedIds,
                targetMap,
                timelineEditMode,
              ).tracks;
            }
          } else if (activeClipTrackId !== activeDrag.trackId) {
            // A non-zero group row shift with no valid target means at least one
            // selected clip cannot enter the requested destination. Reject the
            // whole transaction rather than committing a partial group move.
            rejectMoveTransaction = true;
          }
        } else {
          if (timelineEditMode !== 'normal') {
            finalTracks = finalTracks.map(t => {
              if (t.id === activeClipTrackId) {
                const resolvedClips = timelineEditMode === 'ripple'
                  ? applyRipplePlacement(t, activeDrag.clipId).clips
                  : applyOverwritePlacement(t, activeDrag.clipId).clips;
                return { ...t, clips: resolvedClips };
              }
              return t;
            });
          }
        }
      }
    }
    }

    if (rejectMoveTransaction && activeDrag.dragMode === 'move') {
      finalTracks = structuredClone(initialTracks);
    } else if (activeDrag.dragMode === 'move') {
      finalTracks = pruneEmptyTracks(finalTracks);
    }

    const initialStr = JSON.stringify(initialTracks);
    const finalStr = JSON.stringify(finalTracks);

    const didCommit = initialStr !== finalStr;
    if (didCommit) {
      const actionLabel = activeDrag.dragMode === 'move'
        ? 'Move Clip'
        : activeDrag.dragMode === 'rate-stretch'
          ? 'Rate Stretch Clip'
          : 'Trim Clip';
      const cmd = createTracksSnapshotCommand(actionLabel, initialTracks, finalTracks);
      executeCommand(cmd);
      showToast(`✅ ${actionLabel} Done`);
    }

    // React owns the canonical clip geometry. Clear the imperative draft only
    // after the committed render has had a frame to paint; clearing it in the
    // same event turn can expose the old width/start and reproduce the
    // "looks correct while dragging, shrinks on release" Timeline defect.
    if (draftWorkspace) {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (didCommit) {
        committedDragRef.current = true;
        const committedWorkspace = draftWorkspace;
        const committedTracks = finalTracks;
        const committedSelectedIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
        commitTimelineDraftDom(
          committedWorkspace,
          committedTracks,
          pixelsPerSecond,
          committedSelectedIds,
        );
        resetTimelineDraftDom(committedWorkspace);
      } else {
        const selectedClipIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
        resetTimelineDraftDom(draftWorkspace, activeDrag.initialTracks, pixelsPerSecond, selectedClipIds);
      }
    }
    setActiveDrag(null);
    pendingSnapLineRef.current = null;
    setSnapLineTime(null);
  };

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerup', handlePointerUp, { once: true });
  window.addEventListener('pointercancel', handlePointerCancel, { once: true });

  return () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    latestPointerRef.current = null;
    autoScrollTickRef.current = false;
    lastAutoScrollAtRef.current = null;
    if (workspaceAtStart && !committedDragRef.current) {
      const selectedClipIds = activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId];
      resetTimelineDraftDom(workspaceAtStart, activeDrag.initialTracks, pixelsPerSecond, selectedClipIds);
    }
    committedDragRef.current = false;
    draftTracksRef.current = null;
    pendingDraftRef.current = null;
    lastAutoScrollAtRef.current = null;
    hitTestIndexRef.current = null;
    draftDomContextRef.current = null;
    pendingSnapLineRef.current = null;
    setSnapLineTime(null);
  };
  }, [activeDrag, magneticSnapping, rippleMode, timelineEditMode, currentTime, pixelsPerSecond, workspaceRef]);
}
