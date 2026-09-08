import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject, type MouseEvent as ReactMouseEvent } from 'react';
import { useProjectStore } from '../../../../store/useProjectStore';
import type { ClipNode } from '../../project/types/project';
import { resolveClipSelection, resolveLinkedSelection } from '../../shared/services/selectionInteractionService';
import { clientXToTimelinePixel } from "../geometry";
import type { ActiveDrag } from '../components/timelineInteractionTypes';

export interface UseTimelineClipInteractionOptions {
  activeTool: string;
  professionalTrimTool?: 'none' | 'roll' | 'slip';
  linkedSelectionEnabled: boolean;
  totalDuration: number;
  pixelsPerSecond: number;
  workspaceRef: RefObject<HTMLDivElement | null>;
  setActiveDrag: (drag: ActiveDrag | null) => void;
  setEditingTextClipId: (clipId: string | null) => void;
  handleSplitClipAtTime: (clipId: string, trackId: string, time: number) => void;
}

export interface TimelineClipInteractionHandlers {
  handleClipMouseDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    clipId: string,
    trackId: string,
    trackType: 'video' | 'audio' | 'text' | 'effect',
  ) => void;
  handleClipDoubleClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    clip: ClipNode,
    trackType: string,
  ) => void;
}

export function useTimelineClipInteraction({
  activeTool,
  professionalTrimTool = 'none',
  linkedSelectionEnabled,
  totalDuration,
  pixelsPerSecond,
  workspaceRef,
  setActiveDrag,
  setEditingTextClipId,
  handleSplitClipAtTime,
}: UseTimelineClipInteractionOptions): TimelineClipInteractionHandlers {
  const {
    tracks,
    selectedNodeIds,
    setSelectedNodeIds,
    showToast,
  } = useProjectStore();

  const DRAG_THRESHOLD_PX = 8;

  type PendingDrag = {
    clipId: string;
    trackId: string;
    trackType: 'video' | 'audio' | 'text' | 'effect';
    startX: number;
    startY: number;
    pointerId: number;
    initialStartAt: number;
    initialDuration: number;
    initialSpeed: number;
    startMouseTime: number;
    selectedClipIds: string[];
    activeTool: string;
    initialDragMode: ActiveDrag['dragMode'];
    pairedClipId?: string;
    requestedDragMode?: ActiveDrag['dragMode'];
  };

  const pendingDragRef = useRef<PendingDrag | null>(null);
  const pendingCleanupRef = useRef<(() => void) | null>(null);

  const clearPendingDrag = useCallback(() => {
    pendingCleanupRef.current?.();
    pendingCleanupRef.current = null;
    pendingDragRef.current = null;
  }, []);

  const createActiveDrag = useCallback((pending: PendingDrag): ActiveDrag => {
    // Resize intent belongs to pointerdown, not to whichever x-coordinate
    // happens to be observed when the drag crosses the activation threshold.
    // Otherwise a center drag that passes near an edge can silently become a
    // trim, while an edge trim that moves inward on its first frame can become
    // a normal move. Capture the interaction mode once at gesture start.
    const dragMode = pending.initialDragMode;

    const initialSelectedClips = pending.selectedClipIds
      .map((selectedId) => {
        for (const candidateTrack of tracks) {
          const selectedClip = candidateTrack.clips.find((candidateClip) => candidateClip.id === selectedId);
          if (selectedClip) {
            return {
              clipId: selectedId,
              trackId: candidateTrack.id,
              initialStartAt: selectedClip.startAt,
              initialDuration: selectedClip.duration,
            };
          }
        }
        return null;
      })
      .filter((value): value is { clipId: string; trackId: string; initialStartAt: number; initialDuration: number } => Boolean(value));

    return {
      pointerId: pending.pointerId,
      clipId: pending.clipId,
      trackId: pending.trackId,
      trackType: pending.trackType,
      trackLaneRole: (tracks.find((candidateTrack) => candidateTrack.id === pending.trackId)?.laneRole ?? pending.trackType),
      dragMode,
      initialStartAt: pending.initialStartAt,
      initialDuration: pending.initialDuration,
      initialSpeed: pending.initialSpeed,
      startMouseTime: pending.startMouseTime,
      initialTracks: structuredClone(tracks),
      initialSelectedClips,
    };
  }, [tracks]);

  const armPendingDrag = useCallback((pending: PendingDrag) => {
    clearPendingDrag();
    pendingDragRef.current = pending;

    const handleMove = (moveEvent: PointerEvent) => {
      const current = pendingDragRef.current;
      if (!current || current.pointerId !== moveEvent.pointerId) return;

      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;
      if ((dx * dx) + (dy * dy) < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;

      const dragToStart = createActiveDrag(current);
      clearPendingDrag();
      setActiveDrag(dragToStart);
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (!pendingDragRef.current || pendingDragRef.current.pointerId !== upEvent.pointerId) return;
      clearPendingDrag();
    };

    const handleCancel = (cancelEvent: PointerEvent) => {
      if (!pendingDragRef.current || pendingDragRef.current.pointerId !== cancelEvent.pointerId) return;
      clearPendingDrag();
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleCancel, { once: true });
    pendingCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [DRAG_THRESHOLD_PX, clearPendingDrag, createActiveDrag, setActiveDrag]);

  useEffect(() => clearPendingDrag, [clearPendingDrag]);

  const handleClipMouseDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    clipId: string,
    trackId: string,
    trackType: 'video' | 'audio' | 'text' | 'effect',
    requestedDragMode?: ActiveDrag['dragMode'],
  ) => {
    event.stopPropagation();
    if (event.button !== 0) return;

    const track = tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;

    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (!clip) return;

    const isLocked = Boolean(
      track.isLocked,
    );

    const workspaceElement = workspaceRef.current;

    if (activeTool === 'split' && workspaceElement) {
      const rect = workspaceElement.getBoundingClientRect();
      const timelinePixel = clientXToTimelinePixel({
        clientX: event.clientX,
        workspaceRectLeft: rect.left,
        scrollLeft: workspaceElement.scrollLeft,
        pixelsPerSecond,
      });
      const clickedTime = Math.max(0, Math.min(totalDuration, timelinePixel / pixelsPerSecond));

      handleSplitClipAtTime(
        clipId,
        trackId,
        clickedTime,
      );
      return;
    }

    const isEdgeTrimGesture = requestedDragMode === 'trim-left' || requestedDragMode === 'trim-right' || requestedDragMode === 'roll-left' || requestedDragMode === 'roll-right' || requestedDragMode === 'rate-stretch' || requestedDragMode === 'slip';

    const nextSelection = isEdgeTrimGesture && !event.shiftKey && !event.ctrlKey && !event.metaKey
      ? [clipId]
      : resolveLinkedSelection(
          tracks,
          resolveClipSelection({
            selectedIds: selectedNodeIds,
            allClips: tracks.flatMap(
              (candidateTrack) => candidateTrack.clips,
            ),
            clickedClipId: clipId,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
          }),
          linkedSelectionEnabled &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey,
        );

    setSelectedNodeIds(nextSelection);

    if (isLocked) {
      return;
    }

    if (!workspaceElement) return;

    // Pointer intent is explicit. Resize handles own trim semantics; the clip body
    // is always a move surface (except the dedicated rate-stretch tool). This is
    // critical for short clips: edge-distance heuristics turn an entire 2–8px clip
    // into a resize handle and make normal movement impossible.
    let initialDragMode: ActiveDrag['dragMode'] =
      requestedDragMode ?? (
        professionalTrimTool === 'slip'
          ? 'slip'
          : requestedDragMode === 'roll-left' || requestedDragMode === 'roll-right' || professionalTrimTool === 'roll'
            ? (requestedDragMode === 'roll-left' ? 'roll-left' : 'roll-right')
            : activeTool === 'rate-stretch'
              ? 'rate-stretch'
              : 'move'
      );

    let pairedClipId: string | undefined;
    if (initialDragMode === 'roll-left' || initialDragMode === 'roll-right') {
      const candidates = track.clips
        .filter((candidate) => candidate.id !== clip.id)
        .sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id));
      const clipEnd = clip.startAt + clip.duration;
      pairedClipId = initialDragMode === 'roll-left'
        ? candidates.find((candidate) => Math.abs(candidate.startAt + candidate.duration - clip.startAt) <= 1e-7)?.id
        : candidates.find((candidate) => Math.abs(candidate.startAt - clipEnd) <= 1e-7)?.id;
      if (!pairedClipId) {
        showToast('↔️ Roll Edit requires two adjacent clips on the same track');
        return;
      }
    }

    const workspaceRect = workspaceElement.getBoundingClientRect();
    const timelinePixel = clientXToTimelinePixel({
      clientX: event.clientX,
      workspaceRectLeft: workspaceRect.left,
      scrollLeft: workspaceElement.scrollLeft,
      pixelsPerSecond,
    });
    const pointerTime = Math.max(0, timelinePixel / pixelsPerSecond);

    // Resize gestures are anchored to the canonical clip edge, not the exact
    // pixel where the pointer happened to land inside the hit target. The hit
    // target intentionally extends outside very short clips, so using raw
    // pointer time here would introduce a hidden offset into every trim.
    const startMouseTime = initialDragMode === 'trim-left' || initialDragMode === 'roll-left'
      ? clip.startAt
      : initialDragMode === 'trim-right' || initialDragMode === 'rate-stretch' || initialDragMode === 'roll-right'
        ? clip.startAt + clip.duration
        : pointerTime;

    armPendingDrag({
      clipId,
      trackId,
      trackType,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      initialStartAt: clip.startAt,
      initialDuration: clip.duration,
      initialSpeed:
        typeof clip.properties.speed === 'number'
          ? clip.properties.speed
          : 1,
      startMouseTime,
      selectedClipIds: nextSelection,
      activeTool,
      initialDragMode,
      pairedClipId,
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [
    activeTool,
    professionalTrimTool,
    handleSplitClipAtTime,
    linkedSelectionEnabled,
    pixelsPerSecond,
    selectedNodeIds,
    armPendingDrag,
    setSelectedNodeIds,
    totalDuration,
    tracks,
    workspaceRef,
  ]);

  const handleClipDoubleClick = useCallback((
    event: ReactMouseEvent,
    clip: ClipNode,
    trackType: string,
  ) => {
    event.stopPropagation();
    setSelectedNodeIds([clip.id]);

    if (trackType === 'text') {
      setEditingTextClipId(clip.id);
      showToast('✍️ Double-click: direct text edit active!');

      window.setTimeout(() => {
        const textarea = document.getElementById(
          'inspector-text-editor',
        );

        if (textarea instanceof HTMLTextAreaElement) {
          textarea.focus();
          textarea.select();
        }
      }, 100);
      return;
    }

    showToast(
      `🎬 Active Clip: ${clip.properties.name || 'Untitled'}`,
    );
  }, [setEditingTextClipId, setSelectedNodeIds, showToast]);

  return {
    handleClipMouseDown,
    handleClipDoubleClick,
  };
}
