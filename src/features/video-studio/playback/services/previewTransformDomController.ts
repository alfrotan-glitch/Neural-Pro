import type { ClipNode, Track } from '../../project/types/project';
import { getCanonicalClipTransform, getPreviewTransformCss } from './clipTransformModel';

export interface PreviewDomTransform {
  x: number;
  y: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  opacity?: number;
}

function findClipElement(clipId: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(clipId)
    : clipId.replace(/(["\\])/g, '\\$1');
  return document.querySelector<HTMLElement>(`[data-preview-clip-id="${escaped}"]`);
}

export function transformToCss(transform: PreviewDomTransform): string {
  return getPreviewTransformCss(transform);
}

export function applyClipTransformToDom(
  clipId: string,
  transform: PreviewDomTransform,
  properties?: Record<string, any>,
): void {
  const element = findClipElement(clipId);
  if (!element) return;

  const canonicalTransform = getCanonicalClipTransform(transform as ClipNode['transform']);
  element.style.transform = transformToCss(canonicalTransform);
  element.style.transformOrigin = 'center center';
  element.style.opacity = String(canonicalTransform.opacity / 100);
  element.style.willChange = 'transform, opacity, width, height';

  if (properties?.containerWidth !== undefined && properties?.containerAutoWidth === false) {
    element.style.width = `${properties.containerWidth}px`;
  }
  if (properties?.containerHeight !== undefined && properties?.containerAutoHeight === false) {
    element.style.height = `${properties.containerHeight}px`;
  }
}

export function applyTracksTransformToDom(
  tracks: readonly Track[],
  editableClipIds: ReadonlySet<string>,
): void {
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!editableClipIds.has(clip.id)) continue;
      applyClipTransformToDom(clip.id, clip.transform, clip.properties);
    }
  }
}

export function applyCaptionSpacingToDom(
  clipId: string,
  lineSpacing?: number,
  letterSpacing?: number,
): void {
  const element = findClipElement(clipId);
  if (!element) return;

  if (lineSpacing !== undefined) {
    element.style.lineHeight = String(lineSpacing);
  }

  if (letterSpacing !== undefined) {
    element.style.letterSpacing = `${letterSpacing}px`;
  }
}

export function clearClipTransformOverrides(
  clipIds: Iterable<string>,
): void {
  for (const clipId of clipIds) {
    const element = findClipElement(clipId);
    if (!element) continue;
    element.style.removeProperty('will-change');
    element.style.removeProperty('line-height');
    element.style.removeProperty('letter-spacing');
  }
}

export function getEditableSelectedClipIds(
  tracks: readonly Track[],
  selectedIds: readonly string[],
): Set<string> {
  const selected = new Set(selectedIds);
  const ids = new Set<string>();

  for (const track of tracks) {
    if (track.isLocked) continue;
    for (const clip of track.clips) {
      if (selected.has(clip.id)) ids.add(clip.id);
    }
  }

  return ids;
}

export function cloneTransformSnapshot(
  tracks: readonly Track[],
  editableClipIds: ReadonlySet<string>,
): Map<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }> {
  const result = new Map<string, { transform: ClipNode['transform']; properties: ClipNode['properties'] }>();

  for (const track of tracks) {
    if (track.isLocked) continue;
    for (const clip of track.clips) {
      if (!editableClipIds.has(clip.id)) continue;
      result.set(clip.id, {
        transform: { ...clip.transform },
        properties: { ...clip.properties },
      });
    }
  }

  return result;
}
