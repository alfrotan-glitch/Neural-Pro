import type { ClipNode, Track } from '../../project/types/project';
import type { ActiveDrag } from '../components/timelineInteractionTypes';
import { timeToPixel } from '../geometry';

export interface TimelineDraftDomContext {
  workspace: HTMLElement;
  pixelsPerSecond: number;
  trackTops: Map<string, number>;
  clipElements: Map<string, HTMLElement>;
}

interface OriginalClipPlacement {
  trackId: string;
  startAt: number;
  duration: number;
}

function collectOriginalPlacements(tracks: readonly Track[]): Map<string, OriginalClipPlacement> {
  const result = new Map<string, OriginalClipPlacement>();
  for (const track of tracks) {
    for (const clip of track.clips) {
      result.set(clip.id, {
        trackId: track.id,
        startAt: clip.startAt,
        duration: clip.duration,
      });
    }
  }
  return result;
}

function collectTrackTops(
  workspace: HTMLElement,
  workspaceRect: DOMRect,
): Map<string, number> {
  const result = new Map<string, number>();
  const scrollTop = workspace.scrollTop;

  workspace.querySelectorAll<HTMLElement>('[data-track-id]').forEach((row) => {
    const trackId = row.dataset.trackId;
    if (!trackId) return;
    const rect = row.getBoundingClientRect();
    result.set(trackId, rect.top - workspaceRect.top + scrollTop);
  });

  return result;
}

function collectClipElements(
  workspace: HTMLElement,
  selectedClipIds: readonly string[],
): Map<string, HTMLElement> {
  const result = new Map<string, HTMLElement>();
  for (const clipId of selectedClipIds) {
    const escapedId = CSS.escape(clipId);
    const element = workspace.querySelector<HTMLElement>(`[data-clip-id="${escapedId}"]`);
    if (element) result.set(clipId, element);
  }
  return result;
}

export function createDraftDomContext(
  workspace: HTMLElement,
  pixelsPerSecond: number,
  initialTracks: readonly Track[],
  selectedClipIds: readonly string[],
): TimelineDraftDomContext {
  const workspaceRect = workspace.getBoundingClientRect();
  return {
    workspace,
    pixelsPerSecond,
    trackTops: collectTrackTops(workspace, workspaceRect),
    clipElements: collectClipElements(
      workspace,
      selectedClipIds,
    ),
  };
}

export function applyTimelineDraftToDom(
  context: TimelineDraftDomContext,
  initialTracks: readonly Track[],
  draftTracks: readonly Track[],
  activeDrag: ActiveDrag,
  hoveredTrackId?: string | null,
): void {
  const original = collectOriginalPlacements(initialTracks);
  const draftByClip = new Map<string, { trackId: string; clip: ClipNode }>();
  // Track rows can be virtualized or repositioned by scroll while a drag is
  // active. Re-read their current content coordinates for each draft frame so
  // vertical movement follows the actual row currently under the pointer.
  const currentWorkspaceRect = context.workspace.getBoundingClientRect();
  const currentTrackTops = collectTrackTops(context.workspace, currentWorkspaceRect);

  for (const track of draftTracks) {
    for (const clip of track.clips) draftByClip.set(clip.id, { trackId: track.id, clip });
  }

  const selectedIds = new Set(
    activeDrag.initialSelectedClips?.map((item) => item.clipId) ?? [activeDrag.clipId],
  );

  for (const clipId of selectedIds) {
    const element = context.clipElements.get(clipId);
    const before = original.get(clipId);
    const after = draftByClip.get(clipId);
    if (!element || !before || !after) continue;

    // Horizontal timeline geometry has one canonical coordinate system: left =
    // project time and width = clip duration.
    element.style.left = `${Math.max(0, timeToPixel(after.clip.startAt, context.pixelsPerSecond))}px`;
    element.style.width = `${Math.max(2, timeToPixel(after.clip.duration, context.pixelsPerSecond))}px`;

    const beforeTop = currentTrackTops.get(before.trackId) ?? context.trackTops.get(before.trackId) ?? 0;
    const targetTrackId = hoveredTrackId ?? after.trackId;
    const afterTop = currentTrackTops.get(targetTrackId) ?? context.trackTops.get(targetTrackId) ?? beforeTop;
    const verticalOffset = targetTrackId !== before.trackId ? afterTop - beforeTop : 0;
    element.style.transform = verticalOffset === 0 ? '' : `translateY(${verticalOffset}px)`;
    element.style.willChange = verticalOffset === 0 ? 'left, width' : 'left, width, transform';
  }
}

export function resetTimelineDraftDom(
  workspace: HTMLElement,
  initialTracks?: readonly Track[],
  pixelsPerSecond?: number,
  selectedClipIds?: readonly string[],
): void {
  // If initial tracks and geometry are provided, restore the canonical coordinates for affected clips
  if (initialTracks && typeof pixelsPerSecond === 'number' && pixelsPerSecond > 0 && selectedClipIds && selectedClipIds.length > 0) {
    const original = collectOriginalPlacements(initialTracks);
    for (const clipId of selectedClipIds) {
      const element = workspace.querySelector<HTMLElement>(`[data-clip-id="${CSS.escape(clipId)}"]`);
      const placement = original.get(clipId);
      if (!element || !placement) continue;
      element.style.left = `${Math.max(0, timeToPixel(placement.startAt, pixelsPerSecond))}px`;
      element.style.width = `${Math.max(2, timeToPixel(placement.duration, pixelsPerSecond))}px`;
      element.style.transform = '';
      element.style.willChange = '';
    }
    return;
  }

  // Otherwise only clear hardware acceleration / vertical translation transforms.
  // NEVER erase inline left and width styles, as React owns them and clearing them directly
  // collapses clips into 0px slivers at position 0.
  workspace.querySelectorAll<HTMLElement>('[data-clip-id]').forEach((element) => {
    element.style.transform = '';
    element.style.willChange = '';
  });
}

/**
 * Commit cleanup preserves the final width in the DOM.
 */
export function commitTimelineDraftDom(
  workspace: HTMLElement,
  finalTracks: readonly Track[],
  pixelsPerSecond: number,
  selectedClipIds: readonly string[],
): void {
  const byId = new Map<string, ClipNode>();
  for (const track of finalTracks) {
    for (const clip of track.clips) byId.set(clip.id, clip);
  }

  for (const clipId of selectedClipIds) {
    const element = workspace.querySelector<HTMLElement>(`[data-clip-id="${CSS.escape(clipId)}"]`);
    const clip = byId.get(clipId);
    if (!element || !clip) continue;
    element.style.left = `${Math.max(0, timeToPixel(clip.startAt, pixelsPerSecond))}px`;
    element.style.width = `${Math.max(2, timeToPixel(clip.duration, pixelsPerSecond))}px`;
    element.style.transform = '';
    element.style.willChange = '';
  }
}

export function createOriginalClipPlacementMap(tracks: readonly Track[]): Map<string, OriginalClipPlacement> {
  return collectOriginalPlacements(tracks);
}
