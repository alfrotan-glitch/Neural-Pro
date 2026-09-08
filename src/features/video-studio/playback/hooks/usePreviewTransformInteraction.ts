import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type MouseEvent as ReactMouseEvent } from 'react';
import { useProjectStore } from '../../../../store/useProjectStore';
import { createTrackSnapshotCommand as createTracksSnapshotCommand } from '../../project/commands';
import { AutoKeyframeTransformCommand } from '../../animation/commands';
import type { ClipNode, Track } from '../../project/types/project';
import type { Command } from '../../../../core/commands/types';
import {
  createPointerSnapshot,
  getResizeHandleFromElement,
  calculateAnchoredResize,
  calculateRotation,
  applyMoveToClips,
  applyAnchoredResizeToClips,
  applyRotationToClips,
  type ResizeHandle,
} from '../services/previewTransformInteractionService';
import {
  applyTracksTransformToDom,
  applyCaptionSpacingToDom,
  clearClipTransformOverrides,
  cloneTransformSnapshot,
  getEditableSelectedClipIds,
} from '../services/previewTransformDomController';

export type PreviewTransformDragType = 'move' | 'resize' | 'rotate' | 'lineHeight' | 'letterSpacing';

interface PreviewTransformInteractionProps {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  tracks: Track[];
  selectedNodeIds: string[];
  executeCommand: (command: Command) => void;
}

interface PreviewTransformSession {
  type: PreviewTransformDragType;
  primaryClipId: string;
  resizeHandle?: ResizeHandle;
  startX: number;
  startY: number;
  initialTracks: Track[];
  originalClips: Map<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>;
  pointerSnapshot?: ReturnType<typeof createPointerSnapshot>;
  editableClipIds: Set<string>;
  latestTracks: Track[];
  elementRect: DOMRect;
}

export function usePreviewTransformInteraction({
  containerRef,
  tracks,
  selectedNodeIds,
  executeCommand,
}: PreviewTransformInteractionProps) {
  const dragSessionRef = useRef<PreviewTransformSession | null>(null);
  const dragMovedRef = useRef(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const [isTransformDragging, setIsTransformDragging] = useState(false);

  const beginPreviewDrag = useCallback((
    e: ReactMouseEvent,
    clip: ClipNode,
    type: PreviewTransformDragType,
  ) => {
    e.stopPropagation();
    if (e.button !== 0 && e.button !== 2) return;
    if (!containerRef.current) return;

    const clickedTrack = tracks.find(track => track.clips.some(candidate => candidate.id === clip.id));
    if (clickedTrack?.isLocked) return;

    dragMovedRef.current = false;

    const editableClipIds = getEditableSelectedClipIds(tracks, selectedNodeIds);
    editableClipIds.add(clip.id);

    const originalClips = cloneTransformSnapshot(tracks, editableClipIds);
    if (!originalClips.has(clip.id)) {
      originalClips.set(clip.id, {
        transform: { ...clip.transform },
        properties: { ...clip.properties },
      });
      editableClipIds.add(clip.id);
    }

    const target = e.currentTarget as HTMLElement;
    // Use the actual interactive element bounds, not its full-canvas wrapper.
    const elementNode = (target.closest('[data-preview-clip-id]') as HTMLElement | null) ?? target.parentElement ?? target;
    const bounds = elementNode.getBoundingClientRect();
    const explicitResizeHandle = type === 'resize' ? target.dataset.previewResizeHandle as ResizeHandle | undefined : undefined;
    const resizeHandle = type === 'resize'
      ? (explicitResizeHandle ?? getResizeHandleFromElement(target.getBoundingClientRect(), bounds))
      : undefined;
    const initialScale = clip.transform.scale || 100;
    const initialScaleX = clip.transform.scaleX || 100;
    const initialScaleY = clip.transform.scaleY || 100;
    const layoutWidth = Math.max(1, elementNode.offsetWidth || bounds.width);
    const layoutHeight = Math.max(1, elementNode.offsetHeight || bounds.height);
    const pointerSnapshot = createPointerSnapshot(
      e.clientX,
      e.clientY,
      bounds,
      resizeHandle,
      {
        width: layoutWidth * (initialScale / 100) * (initialScaleX / 100),
        height: layoutHeight * (initialScale / 100) * (initialScaleY / 100),
        rotation: clip.transform.rotation || 0,
      },
    );
    dragSessionRef.current = {
      type,
      primaryClipId: clip.id,
      resizeHandle,
      startX: e.clientX,
      startY: e.clientY,
      initialTracks: structuredClone(tracks),
      originalClips,
      pointerSnapshot,
      editableClipIds,
      latestTracks: structuredClone(tracks),
      elementRect: bounds,
    };

    setIsTransformDragging(true);
    if (hudRef.current) {
      hudRef.current.style.display = 'block';
      hudRef.current.style.left = `${e.clientX}px`;
      hudRef.current.style.top = `${e.clientY - 40}px`;
      hudRef.current.textContent = '';
    }

    document.body.style.userSelect = 'none';
    let resizeCursor = 'nwse-resize';
    if (resizeHandle === 'ne' || resizeHandle === 'sw') resizeCursor = 'nesw-resize';
    else if (resizeHandle === 'nw' || resizeHandle === 'se') resizeCursor = 'nwse-resize';
    else if (resizeHandle === 'n' || resizeHandle === 's') resizeCursor = 'ns-resize';
    else if (resizeHandle === 'e' || resizeHandle === 'w') resizeCursor = 'ew-resize';

    document.body.style.cursor = type === 'move'
      ? 'grabbing'
      : type === 'resize'
        ? resizeCursor
        : type === 'rotate'
          ? 'crosshair'
          : 'ew-resize';
  }, [containerRef, selectedNodeIds, tracks]);

  const handleMoveMouseDown = useCallback((e: ReactMouseEvent, clip: ClipNode) => beginPreviewDrag(e, clip, 'move'), [beginPreviewDrag]);
  const handleResizeMouseDown = useCallback((e: ReactMouseEvent, clip: ClipNode) => beginPreviewDrag(e, clip, 'resize'), [beginPreviewDrag]);
  const handleRotateMouseDown = useCallback((e: ReactMouseEvent, clip: ClipNode) => beginPreviewDrag(e, clip, 'rotate'), [beginPreviewDrag]);
  const handleLineHeightMouseDown = useCallback((e: ReactMouseEvent, clip: ClipNode) => beginPreviewDrag(e, clip, 'lineHeight'), [beginPreviewDrag]);
  const handleLetterSpacingMouseDown = useCallback((e: ReactMouseEvent, clip: ClipNode) => beginPreviewDrag(e, clip, 'letterSpacing'), [beginPreviewDrag]);

  useEffect(() => {
    let rafId = 0;
    let latestEvent: MouseEvent | null = null;

    const resetDragUi = () => {
      const session = dragSessionRef.current;
      const moved = dragMovedRef.current;
      dragSessionRef.current = null;
      dragMovedRef.current = false;
      setIsTransformDragging(false);
      if (hudRef.current) {
        hudRef.current.style.display = 'none';
        hudRef.current.textContent = '';
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (session && moved) {
        clearClipTransformOverrides(session.editableClipIds);
      }
    };

    const update = () => {
      rafId = 0;
      const session = dragSessionRef.current;
      const e = latestEvent;
      latestEvent = null;
      if (!session || !e || !containerRef.current) return;

      const deltaX = e.clientX - session.startX;
      const deltaY = e.clientY - session.startY;
      if (Math.hypot(deltaX, deltaY) < 1.5 && !dragMovedRef.current) return;
      dragMovedRef.current = true;

      const rect = containerRef.current.getBoundingClientRect();
      const options = {
        magneticSnapping: useProjectStore.getState().magneticSnapping,
        shiftKey: e.shiftKey,
      };

      let nextTracks = session.initialTracks;
      let hudText = '';
      const primaryOriginal = session.originalClips.get(session.primaryClipId);

      if (session.type === 'move' && primaryOriginal) {
        nextTracks = applyMoveToClips(
          session.initialTracks,
          session.originalClips,
          session.primaryClipId,
          deltaX,
          deltaY,
          rect,
          options,
          {
            elementRect: session.elementRect,
            canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          },
        );
        const moved = nextTracks.flatMap(track => track.clips).find(candidate => candidate.id === session.primaryClipId);
        hudText = moved ? `X: ${Math.round(moved.transform.x)}px | Y: ${Math.round(moved.transform.y)}px` : '';
      } else if (session.type === 'resize' && primaryOriginal && session.pointerSnapshot) {
        const initialScale = primaryOriginal.transform.scale || 100;
        const initialScaleX = primaryOriginal.transform.scaleX || 100;
        const initialScaleY = primaryOriginal.transform.scaleY || 100;
        const isPrimaryText = Boolean(
          primaryOriginal.properties?.containerWidth !== undefined ||
          primaryOriginal.properties?.words !== undefined ||
          primaryOriginal.properties?.textContent !== undefined ||
          session.initialTracks.find(t => t.clips.some(c => c.id === session.primaryClipId))?.type === 'text'
        );
        const preserveAspect = Boolean(e.shiftKey || (!isPrimaryText && session.resizeHandle && session.resizeHandle.length === 2));
        const resize = calculateAnchoredResize(initialScale, session.pointerSnapshot, e.clientX, e.clientY, rect, preserveAspect, initialScaleX, initialScaleY);
        nextTracks = applyAnchoredResizeToClips(
          session.initialTracks,
          session.originalClips,
          session.primaryClipId,
          initialScale,
          session.pointerSnapshot,
          e.clientX,
          e.clientY,
          rect,
          session.editableClipIds.size > 1,
          preserveAspect,
        );
        const updatedPrimary = nextTracks.flatMap(track => track.clips).find(candidate => candidate.id === session.primaryClipId);
        const handle = session.resizeHandle ?? 'se';
        const isCorner = (handle.includes('w') || handle.includes('e')) && (handle.includes('n') || handle.includes('s'));
        const isTextClip = updatedPrimary && (
          updatedPrimary.properties?.containerWidth !== undefined ||
          updatedPrimary.properties?.words !== undefined ||
          updatedPrimary.properties?.textContent !== undefined ||
          session.initialTracks.find(t => t.clips.some(c => c.id === session.primaryClipId))?.type === 'text'
        );

        if (isTextClip && !isCorner && (handle.includes('w') || handle.includes('e'))) {
          hudText = `Width: ${Math.round(updatedPrimary.properties.containerWidth ?? 550)}px`;
        } else if (isTextClip && !isCorner && (handle.includes('n') || handle.includes('s'))) {
          hudText = `Height: ${Math.round(updatedPrimary.properties.containerHeight ?? 110)}px`;
        } else if (isTextClip && isCorner) {
          hudText = `W: ${Math.round(updatedPrimary.properties.containerWidth ?? 550)}px | H: ${Math.round(updatedPrimary.properties.containerHeight ?? 110)}px`;
        } else {
          hudText = `Scale: ${Math.round(resize.scale)}%`;
        }
      } else if (session.type === 'rotate' && primaryOriginal && session.pointerSnapshot) {
        const rotation = calculateRotation(primaryOriginal.transform.rotation || 0, session.pointerSnapshot, e.clientX, e.clientY, options);
        nextTracks = applyRotationToClips(
          session.initialTracks,
          session.originalClips,
          session.primaryClipId,
          rotation,
          session.editableClipIds.size > 1,
        );
        hudText = `Rotate: ${Math.round(rotation)}°`;
      } else {
        nextTracks = session.initialTracks.map(track => ({
          ...track,
          clips: track.clips.map(candidate => {
            const original = session.originalClips.get(candidate.id);
            if (!original) return candidate;
            const updated = { ...candidate, transform: { ...candidate.transform }, properties: { ...candidate.properties } };
            if (session.type === 'lineHeight') {
              const value = Math.max(0.5, Math.min(3, (original.properties.lineSpacing || 1.2) + ((deltaY / Math.max(1, rect.height)) * -20)));
              updated.properties.lineSpacing = value;
              if (candidate.id === session.primaryClipId) {
                hudText = `Line Spacing: ${value.toFixed(2)}`;
                applyCaptionSpacingToDom(candidate.id, value, undefined);
              }
            } else if (session.type === 'letterSpacing') {
              const value = Math.max(-5, Math.min(50, (original.properties.charSpacing || 0) + ((deltaX / Math.max(1, rect.width)) * 100)));
              updated.properties.charSpacing = value;
              if (candidate.id === session.primaryClipId) {
                hudText = `Char Spacing: ${Math.round(value)}px`;
                applyCaptionSpacingToDom(candidate.id, undefined, value);
              }
            }
            return updated;
          }),
        }));
      }

      session.latestTracks = nextTracks;
      applyTracksTransformToDom(nextTracks, session.editableClipIds);

      const primary = nextTracks.flatMap(track => track.clips).find(candidate => candidate.id === session.primaryClipId);
      if (primary && session.type === 'lineHeight') {
        applyCaptionSpacingToDom(session.primaryClipId, Number(primary.properties.lineSpacing), undefined);
      } else if (primary && session.type === 'letterSpacing') {
        applyCaptionSpacingToDom(session.primaryClipId, undefined, Number(primary.properties.charSpacing));
      }

      if (hudRef.current) {
        hudRef.current.style.left = `${e.clientX}px`;
        hudRef.current.style.top = `${e.clientY - 40}px`;
        hudRef.current.textContent = hudText;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragSessionRef.current) return;
      e.preventDefault();
      latestEvent = e;
      if (!rafId) rafId = requestAnimationFrame(update);
    };

    const handleMouseUp = () => {
      // The last mousemove may still be waiting behind requestAnimationFrame.
      // Flush it before commit so release can never persist the previous frame.
      if (rafId) cancelAnimationFrame(rafId);
      if (latestEvent) {
        update();
      }
      const session = dragSessionRef.current;
      if (session && dragMovedRef.current) {
        const projectState = useProjectStore.getState();
        if (projectState.autoKeyframeEnabled && (session.type === 'move' || session.type === 'resize' || session.type === 'rotate')) {
          executeCommand(new AutoKeyframeTransformCommand({
            previousTracks: session.initialTracks,
            nextTracks: session.latestTracks,
            previousAnimations: projectState.animations,
            elementIds: Array.from(session.editableClipIds),
            projectTime: projectState.currentTime,
          }));
        } else {
          executeCommand(createTracksSnapshotCommand('Transform Canvas Elements', session.initialTracks, session.latestTracks));
        }
      }
      latestEvent = null;
      resetDragUi();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      resetDragUi();
    };
  }, [containerRef, executeCommand]);

  useLayoutEffect(() => {
    const session = dragSessionRef.current;
    if (!session) return;
    applyTracksTransformToDom(session.latestTracks, session.editableClipIds);
    const primary = session.latestTracks.flatMap(track => track.clips).find(candidate => candidate.id === session.primaryClipId);
    if (primary && session.type === 'lineHeight') {
      applyCaptionSpacingToDom(session.primaryClipId, Number(primary.properties.lineSpacing ?? 1.2), undefined);
    } else if (primary && session.type === 'letterSpacing') {
      applyCaptionSpacingToDom(session.primaryClipId, undefined, Number(primary.properties.charSpacing ?? 0));
    }
  });

  return {
    hudRef,
    isTransformDragging,
    handleMoveMouseDown,
    handleResizeMouseDown,
    handleRotateMouseDown,
    handleLineHeightMouseDown,
    handleLetterSpacingMouseDown,
  };
}
