import type { ClipNode, Track } from '../../project/types/project';

export type PreviewTransformMode = 'move' | 'resize' | 'rotate' | 'lineHeight' | 'letterSpacing';
export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export interface PreviewPointerSnapshot {
  clientX: number;
  clientY: number;
  centerX: number;
  centerY: number;
  initialRadius: number;
  initialAngle: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  resizeHandle?: ResizeHandle;
  rotation: number;
}

export interface PreviewTransformOptions {
  magneticSnapping: boolean;
  shiftKey: boolean;
}

const MIN_SCALE = 10;
const MAX_SCALE = 400;
const SNAP_TRANSLATION = 1.75;
const SNAP_GUIDE_PX = 8;
const SNAP_ROTATION = 5;

function snapNearZero(value: number, threshold: number): number {
  return Math.abs(value) <= threshold ? 0 : value;
}

export function normalizeRotation(degrees: number): number {
  const value = ((degrees % 360) + 360) % 360;
  return value > 180 ? value - 360 : value;
}

export function snapRotation(
  degrees: number,
  enabled: boolean,
  threshold = SNAP_ROTATION,
): number {
  const normalized = normalizeRotation(degrees);
  const targets = [0, 90, -90, 180, -180];

  if (!enabled) return normalized;

  for (const target of targets) {
    if (Math.abs(normalized - target) <= threshold) {
      return target;
    }
  }

  return normalized;
}

export function getResizeHandleFromElement(
  handleRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  parentRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): ResizeHandle {
  const x = handleRect.left + handleRect.width / 2;
  const y = handleRect.top + handleRect.height / 2;
  const cx = parentRect.left + parentRect.width / 2;
  const cy = parentRect.top + parentRect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const marginX = parentRect.width * 0.2;
  const marginY = parentRect.height * 0.2;

  let h = '';
  if (dx < -marginX) h = 'w';
  else if (dx > marginX) h = 'e';

  let v = '';
  if (dy < -marginY) v = 'n';
  else if (dy > marginY) v = 's';

  if (!h && !v) return 'se';
  return `${v}${h}` as ResizeHandle;
}

export function createPointerSnapshot(
  startX: number,
  startY: number,
  bounds: DOMRect,
  resizeHandle?: ResizeHandle,
  geometry?: { width?: number; height?: number; rotation?: number },
): PreviewPointerSnapshot {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const dx = startX - centerX;
  const dy = startY - centerY;

  const width = Math.max(1, geometry?.width ?? bounds.width);
  const height = Math.max(1, geometry?.height ?? bounds.height);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const handle = resizeHandle ?? 'se';
  const anchorX = centerX + (handle.includes('w') ? halfWidth : -halfWidth);
  const anchorY = centerY + (handle.includes('n') ? halfHeight : -halfHeight);

  return {
    clientX: startX,
    clientY: startY,
    centerX,
    centerY,
    initialRadius: Math.max(1, Math.hypot(dx, dy)),
    initialAngle: Math.atan2(dy, dx),
    width,
    height,
    anchorX,
    anchorY,
    resizeHandle,
    rotation: geometry?.rotation ?? 0,
  };
}

export interface PreviewCanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function snapToGuide(value: number, guides: readonly number[], threshold: number): number {
  for (const guide of guides) {
    if (Math.abs(value - guide) <= threshold) return guide;
  }
  return value;
}

export function calculateMoveTransform(
  initialX: number,
  initialY: number,
  deltaX: number,
  deltaY: number,
  _bounds: Pick<DOMRect, 'width' | 'height'>,
  options: PreviewTransformOptions,
  geometry?: { elementRect?: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>; canvasRect?: PreviewCanvasBounds },
): { x: number; y: number } {
  let dx = deltaX;
  let dy = deltaY;

  if (options.shiftKey) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }

  if (options.magneticSnapping && geometry?.canvasRect && geometry?.elementRect) {
    const canvas = geometry.canvasRect;
    const element = geometry.elementRect;
    const centerX = element.left + element.width / 2 + dx;
    const centerY = element.top + element.height / 2 + dy;
    const snappedCenterX = snapToGuide(centerX, [
      canvas.left + canvas.width / 2,
      canvas.left + canvas.width * 0.25,
      canvas.left + canvas.width * 0.75,
    ], SNAP_GUIDE_PX);
    const snappedCenterY = snapToGuide(centerY, [
      canvas.top + canvas.height / 2,
      canvas.top + canvas.height * 0.25,
      canvas.top + canvas.height * 0.75,
    ], SNAP_GUIDE_PX);
    dx += (snappedCenterX - centerX);
    dy += (snappedCenterY - centerY);
  }

  // ClipNode.transform.x/y are canonical pixel offsets from the canvas center.
  const x = initialX + dx;
  const y = initialY + dy;

  return {
    x: options.magneticSnapping ? snapNearZero(x, SNAP_TRANSLATION) : x,
    y: options.magneticSnapping ? snapNearZero(y, SNAP_TRANSLATION) : y,
  };
}

export interface AnchoredResizeResult {
  scale: number;
  scaleX: number;
  scaleY: number;
  centerX: number;
  centerY: number;
  newWidth?: number;
  newHeight?: number;
}

export function calculateAnchoredResize(
  initialScale: number,
  pointer: PreviewPointerSnapshot,
  clientX: number,
  clientY: number,
  _canvasRect?: PreviewCanvasBounds,
  preserveAspect = true,
  initialScaleX = 100,
  initialScaleY = 100,
): AnchoredResizeResult {
  const rotationRad = (pointer.rotation * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const worldDx = clientX - pointer.centerX;
  const worldDy = clientY - pointer.centerY;
  const localPointerX = worldDx * cos + worldDy * sin;
  const localPointerY = -worldDx * sin + worldDy * cos;

  const handle = pointer.resizeHandle ?? 'se';
  const hasHorizontal = handle.includes('w') || handle.includes('e');
  const hasVertical = handle.includes('n') || handle.includes('s');
  const anchorLocalX = handle.includes('w') ? pointer.width / 2 : handle.includes('e') ? -pointer.width / 2 : 0;
  const anchorLocalY = handle.includes('n') ? pointer.height / 2 : handle.includes('s') ? -pointer.height / 2 : 0;

  const currentSpanX = handle.includes('w') ? anchorLocalX - localPointerX : localPointerX - anchorLocalX;
  const currentSpanY = handle.includes('n') ? anchorLocalY - localPointerY : localPointerY - anchorLocalY;

  let widthRatio = hasHorizontal ? Math.max(0.02, currentSpanX / Math.max(1, pointer.width)) : 1;
  let heightRatio = hasVertical ? Math.max(0.02, currentSpanY / Math.max(1, pointer.height)) : 1;

  const cornerResize = hasHorizontal && hasVertical;
  if (preserveAspect && cornerResize) {
    const diagSq = pointer.width * pointer.width + pointer.height * pointer.height;
    const projRatio = (currentSpanX * pointer.width + currentSpanY * pointer.height) / diagSq;
    const uniformRatio = Math.max(0.02, projRatio);
    widthRatio = uniformRatio;
    heightRatio = uniformRatio;
  }

  const newWidth = pointer.width * widthRatio;
  const newHeight = pointer.height * heightRatio;

  const centerLocalX = hasHorizontal
    ? anchorLocalX + (handle.includes('w') ? -newWidth / 2 : newWidth / 2)
    : 0;
  const centerLocalY = hasVertical
    ? anchorLocalY + (handle.includes('n') ? -newHeight / 2 : newHeight / 2)
    : 0;

  const anchorWorldX = pointer.centerX + anchorLocalX * cos - anchorLocalY * sin;
  const anchorWorldY = pointer.centerY + anchorLocalX * sin + anchorLocalY * cos;
  const centerX = anchorWorldX + (centerLocalX - anchorLocalX) * cos - (centerLocalY - anchorLocalY) * sin;
  const centerY = anchorWorldY + (centerLocalX - anchorLocalX) * sin + (centerLocalY - anchorLocalY) * cos;

  const scale = cornerResize
    ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScale * widthRatio))
    : Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScale));
  const scaleX = cornerResize
    ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScaleX))
    : Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScaleX * widthRatio));
  const scaleY = cornerResize
    ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScaleY))
    : Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScaleY * heightRatio));

  return { scale, scaleX, scaleY, centerX, centerY, newWidth, newHeight };
}

export function calculateScale(
  initialScale: number,
  pointer: PreviewPointerSnapshot,
  clientX: number,
  clientY: number,
): number {
  return calculateAnchoredResize(initialScale, pointer, clientX, clientY).scale;
}

export function calculateRotation(
  initialRotation: number,
  pointer: PreviewPointerSnapshot,
  clientX: number,
  clientY: number,
  options: PreviewTransformOptions,
): number {
  const angle = Math.atan2(
    clientY - pointer.centerY,
    clientX - pointer.centerX,
  );
  const delta = ((angle - pointer.initialAngle) * 180) / Math.PI;
  return snapRotation(
    initialRotation + delta,
    options.magneticSnapping || options.shiftKey,
    options.shiftKey ? 15 : SNAP_ROTATION,
  );
}

export function isTrackLocked(
  tracks: readonly Track[],
  clipId: string,
): boolean {
  return Boolean(
    tracks.find((track) =>
      track.clips.some((clip) => clip.id === clipId),
    )?.isLocked,
  );
}

export function applyMoveToClips(
  tracks: readonly Track[],
  originalClips: ReadonlyMap<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>,
  primaryClipId: string,
  deltaX: number,
  deltaY: number,
  bounds: Pick<DOMRect, 'width' | 'height'>,
  options: PreviewTransformOptions,
  geometry?: { elementRect?: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>; canvasRect?: PreviewCanvasBounds },
): Track[] {
  const primary = originalClips.get(primaryClipId);
  if (!primary) return tracks.map((track) => ({ ...track, clips: [...track.clips] }));

  const delta = calculateMoveTransform(
    primary.transform.x,
    primary.transform.y,
    deltaX,
    deltaY,
    bounds,
    options,
    geometry,
  );

  const offsetX = delta.x - primary.transform.x;
  const offsetY = delta.y - primary.transform.y;

  // Check if all selected items are text/caption elements
  const isAllTextSelection = Array.from(originalClips.values()).every(
    (orig) =>
      
      orig.properties?.captionTheme !== undefined ||
      orig.properties?.words !== undefined ||
      false
  );

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const original = originalClips.get(clip.id);
      if (!original) return clip;

      const isThisClipText =
        track.type === 'text' ||
        
        original.properties?.captionTheme !== undefined ||
        original.properties?.words !== undefined ||
        false;

      // In standard subtitle workflows (CapCut / Premiere / Resolve):
      // When multiple or all captions/text clips are selected and dragged on preview,
      // all of them take the EXACT absolute position (X, Y) of the primary dragged caption
      // so all subtitles throughout the video are positioned at the identical baseline on screen.
      const targetX = (isAllTextSelection || isThisClipText) ? delta.x : original.transform.x + offsetX;
      const targetY = (isAllTextSelection || isThisClipText) ? delta.y : original.transform.y + offsetY;

      return {
        ...clip,
        transform: {
          ...clip.transform,
          x: targetX,
          y: targetY,
        },
        properties: { ...clip.properties },
      };
    }),
  }));
}

export function applyScaleToClips(
  tracks: readonly Track[],
  originalClips: ReadonlyMap<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>,
  primaryClipId: string,
  scale: number,
): Track[] {
  const primary = originalClips.get(primaryClipId);
  if (!primary) return tracks.map((track) => ({ ...track, clips: [...track.clips] }));

  const ratio = scale / Math.max(MIN_SCALE, primary.transform.scale || 100);

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const original = originalClips.get(clip.id);
      if (!original) return clip;

      return {
        ...clip,
        transform: {
          ...clip.transform,
          scale: Math.max(
            MIN_SCALE,
            Math.min(MAX_SCALE, (original.transform.scale || 100) * ratio),
          ),
        },
        properties: { ...clip.properties },
      };
    }),
  }));
}

function getTransformGroupCenter(
  originalClips: ReadonlyMap<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>,
): { x: number; y: number; count: number } {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const original of originalClips.values()) {
    x += original.transform.x;
    y += original.transform.y;
    count += 1;
  }
  if (!count) return { x: 0, y: 0, count: 0 };
  return { x: x / count, y: y / count, count };
}

export function applyAnchoredResizeToClips(
  tracks: readonly Track[],
  originalClips: ReadonlyMap<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>,
  primaryClipId: string,
  initialScale: number,
  pointer: PreviewPointerSnapshot,
  clientX: number,
  clientY: number,
  canvasRect?: PreviewCanvasBounds,
  multiSelection = false,
  preserveAspect = true,
): Track[] {
  const primary = originalClips.get(primaryClipId);
  if (!primary) return tracks.map((track) => ({ ...track, clips: [...track.clips] }));

  const initialScaleX = primary.transform.scaleX || 100;
  const initialScaleY = primary.transform.scaleY || 100;
  const result = calculateAnchoredResize(initialScale, pointer, clientX, clientY, canvasRect, preserveAspect, initialScaleX, initialScaleY);
  const deltaX = result.centerX - pointer.centerX;
  const deltaY = result.centerY - pointer.centerY;
  const scaleRatio = result.scale / Math.max(MIN_SCALE, initialScale);
  const axisScaleXRatio = result.scaleX / Math.max(MIN_SCALE, initialScaleX);
  const axisScaleYRatio = result.scaleY / Math.max(MIN_SCALE, initialScaleY);
  const geometryScaleXRatio = scaleRatio * axisScaleXRatio;
  const geometryScaleYRatio = scaleRatio * axisScaleYRatio;

  const group = getTransformGroupCenter(originalClips);
  const groupCenterX = group.count > 1 ? group.x : primary.transform.x;
  const groupCenterY = group.count > 1 ? group.y : primary.transform.y;
  // The resize result reports how far the primary element's center moved while
  // preserving its opposite-corner anchor. A multi-selection must translate
  // the whole group by that same center delta; subtracting the primary's
  // offset from the group center double-counts the offset and causes a jump.
  const groupDeltaX = deltaX;
  const groupDeltaY = deltaY;

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const original = originalClips.get(clip.id);
      if (!original) return clip;

      const isText =
        track.type === 'text' ||
        
        original.properties?.captionTheme !== undefined ||
        original.properties?.words !== undefined ||
        false;

      const handle = pointer.resizeHandle ?? 'se';
      const hasHorizontal = handle.includes('w') || handle.includes('e');
      const hasVertical = handle.includes('n') || handle.includes('s');
      const isCorner = hasHorizontal && hasVertical;
      const isSideHorizontal = !isCorner && hasHorizontal;
      const isSideVertical = !isCorner && hasVertical;

      if (isText) {
        const uniformScale = (original.transform.scale || 100) / 100;
        const safeScale = Math.max(0.1, uniformScale);

        // When multiple captions/text clips are selected, all of them receive the exact uniform container dimensions & scale
        const primaryOriginal = primary;
        const primaryUniformScale = (primaryOriginal.transform.scale || 100) / 100;
        const primarySafeScale = Math.max(0.1, primaryUniformScale);

        if (isSideHorizontal) {
          const rawNewWidth = result.newWidth ?? (pointer.width * (result.scaleX / Math.max(MIN_SCALE, initialScaleX)));
          const unscaledWidth = Math.max(80, Math.round(rawNewWidth / primarySafeScale));
          const newX = primaryOriginal.transform.x + deltaX;
          const newY = primaryOriginal.transform.y;

          return {
            ...clip,
            transform: {
              ...clip.transform,
              x: newX,
              y: newY,
              scale: original.transform.scale || 100,
              scaleX: 100,
              scaleY: 100,
            },
            properties: {
              ...clip.properties,
              containerWidth: unscaledWidth,
              containerAutoWidth: false,
            },
          };
        }

        if (isSideVertical) {
          const rawNewHeight = result.newHeight ?? (pointer.height * (result.scaleY / Math.max(MIN_SCALE, initialScaleY)));
          const unscaledHeight = Math.max(30, Math.round(rawNewHeight / primarySafeScale));
          const newX = primaryOriginal.transform.x;
          const newY = primaryOriginal.transform.y + deltaY;

          return {
            ...clip,
            transform: {
              ...clip.transform,
              x: newX,
              y: newY,
              scale: original.transform.scale || 100,
              scaleX: 100,
              scaleY: 100,
            },
            properties: {
              ...clip.properties,
              containerHeight: unscaledHeight,
              containerAutoHeight: false,
            },
          };
        }

        // Corner resize for text clips (single or multi-selection):
        // Resize text container box dimensions and/or scale font uniformly across all selected captions, keeping scaleX and scaleY strictly 100 to prevent letter distortion.
        const rawNewWidth = result.newWidth ?? (pointer.width * (result.scaleX / Math.max(MIN_SCALE, initialScaleX)));
        const unscaledWidth = Math.max(80, Math.round(rawNewWidth / primarySafeScale));
        const rawNewHeight = result.newHeight ?? (pointer.height * (result.scaleY / Math.max(MIN_SCALE, initialScaleY)));
        const unscaledHeight = Math.max(30, Math.round(rawNewHeight / primarySafeScale));
        const newX = primaryOriginal.transform.x + deltaX;
        const newY = primaryOriginal.transform.y + deltaY;
        const targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (primaryOriginal.transform.scale || 100) * (preserveAspect ? scaleRatio : 1)));

        return {
          ...clip,
          transform: {
            ...clip.transform,
            x: newX,
            y: newY,
            scale: targetScale,
            scaleX: 100,
            scaleY: 100,
          },
          properties: {
            ...clip.properties,
            containerWidth: unscaledWidth,
            containerHeight: unscaledHeight,
            containerAutoWidth: false,
            containerAutoHeight: false,
          },
        };
      }

      return {
        ...clip,
        transform: {
          ...clip.transform,
          x: multiSelection
            ? groupCenterX + (original.transform.x - groupCenterX) * geometryScaleXRatio + groupDeltaX
            : original.transform.x + deltaX,
          y: multiSelection
            ? groupCenterY + (original.transform.y - groupCenterY) * geometryScaleYRatio + groupDeltaY
            : original.transform.y + deltaY,
          scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, (original.transform.scale || 100) * scaleRatio)),
          scaleX: Math.max(MIN_SCALE, Math.min(MAX_SCALE, (original.transform.scaleX || 100) * axisScaleXRatio)),
          scaleY: Math.max(MIN_SCALE, Math.min(MAX_SCALE, (original.transform.scaleY || 100) * axisScaleYRatio)),
        },
        properties: { ...clip.properties },
      };
    }),
  }));
}

export function applyRotationToClips(
  tracks: readonly Track[],
  originalClips: ReadonlyMap<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>,
  primaryClipId: string,
  rotation: number,
  multiSelection = false,
): Track[] {
  const primary = originalClips.get(primaryClipId);
  if (!primary) return tracks.map((track) => ({ ...track, clips: [...track.clips] }));

  const delta = normalizeRotation(rotation - (primary.transform.rotation || 0));
  const angleRad = (delta * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const group = getTransformGroupCenter(originalClips);
  const groupCenterX = group.count > 1 ? group.x : primary.transform.x;
  const groupCenterY = group.count > 1 ? group.y : primary.transform.y;

  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const original = originalClips.get(clip.id);
      if (!original) return clip;

      return {
        ...clip,
        transform: {
          ...clip.transform,
          x: multiSelection
            ? groupCenterX + ((original.transform.x - groupCenterX) * cos - (original.transform.y - groupCenterY) * sin)
            : original.transform.x,
          y: multiSelection
            ? groupCenterY + ((original.transform.x - groupCenterX) * sin + (original.transform.y - groupCenterY) * cos)
            : original.transform.y,
          rotation: normalizeRotation((original.transform.rotation || 0) + delta),
        },
        properties: { ...clip.properties },
      };
    }),
  }));
}
