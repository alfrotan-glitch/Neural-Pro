import type { ClipNode, Track } from '../../project/types/project';

export type SelectionMode = 'replace' | 'toggle' | 'range' | 'add' | 'subtract';

export interface SelectionContext {
  selectedIds: readonly string[];
  allClips: readonly ClipNode[];
  clickedClipId: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function getSelectionMode(context: SelectionContext): SelectionMode {
  if (context.altKey) return 'subtract';
  if (context.ctrlKey || context.metaKey) return 'toggle';
  if (context.shiftKey) return 'range';
  return 'replace';
}

export function resolveClipSelection(context: SelectionContext): string[] {
  const mode = getSelectionMode(context);
  const selected = new Set(context.selectedIds);

  if (mode === 'toggle') {
    if (selected.has(context.clickedClipId)) selected.delete(context.clickedClipId);
    else selected.add(context.clickedClipId);
    return [...selected];
  }

  if (mode === 'subtract') {
    selected.delete(context.clickedClipId);
    return [...selected];
  }

  if (mode === 'range' && context.selectedIds.length > 0) {
    const ordered = [...context.allClips].sort((a, b) => a.startAt - b.startAt);
    const clickedIndex = ordered.findIndex((clip) => clip.id === context.clickedClipId);
    const anchorId = context.selectedIds.at(-1);
    const anchorIndex = ordered.findIndex((clip) => clip.id === anchorId);

    if (clickedIndex >= 0 && anchorIndex >= 0) {
      const start = Math.min(clickedIndex, anchorIndex);
      const end = Math.max(clickedIndex, anchorIndex);
      return ordered.slice(start, end + 1).map((clip) => clip.id);
    }
  }

  return [context.clickedClipId];
}

export function resolveLinkedSelection(
  tracks: readonly Track[],
  baseSelection: readonly string[],
  linked: boolean,
): string[] {
  if (!linked || baseSelection.length !== 1) return [...baseSelection];

  const selectedClipId = baseSelection[0];
  const clip = tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === selectedClipId);
  if (!clip) return [...baseSelection];

  const groupId = clip.properties?.groupId;
  const syncGroupId = clip.properties?.syncGroupId;

  if (typeof groupId !== 'string' && typeof syncGroupId !== 'string') {
    return [...baseSelection];
  }

  return tracks
    .flatMap((track) => track.clips)
    .filter((candidate) => {
      if (typeof groupId === 'string') return candidate.properties?.groupId === groupId;
      return candidate.properties?.syncGroupId === syncGroupId;
    })
    .map((candidate) => candidate.id);
}
