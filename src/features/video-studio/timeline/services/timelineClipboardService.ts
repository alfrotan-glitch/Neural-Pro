import type { ClipNode, Track } from '../../project/types/project';
import { generateUUID } from '../../../../lib/uuid';

export interface TimelineClipboardItem {
  clip: ClipNode;
  sourceTrackId: string;
  offsetFromAnchor: number;
}

export interface TimelineClipboard {
  version: 1;
  items: TimelineClipboardItem[];
  anchorTime: number;
}

export interface ClipboardBuildResult {
  clipboard: TimelineClipboard;
  count: number;
}

export function buildTimelineClipboard(
  tracks: readonly Track[],
  selectedIds: readonly string[],
): ClipboardBuildResult | null {
  const selected = new Set(selectedIds);
  const items: Array<{ clip: ClipNode; sourceTrackId: string }> = [];

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (selected.has(clip.id)) {
        items.push({ clip: structuredClone(clip), sourceTrackId: track.id });
      }
    }
  }

  if (items.length === 0) return null;

  const anchorTime = Math.min(...items.map(({ clip }) => clip.startAt));
  return {
    clipboard: {
      version: 1,
      anchorTime,
      items: items
        .sort((a, b) => a.clip.startAt - b.clip.startAt)
        .map(({ clip, sourceTrackId }) => ({
          clip,
          sourceTrackId,
          offsetFromAnchor: clip.startAt - anchorTime,
        })),
    },
    count: items.length,
  };
}

function canPasteToTrack(track: Track, clip: ClipNode): boolean {
  if (track.isLocked) return false;
  if (clip.properties.textContent !== undefined) return track.type === 'text';
  if (clip.properties.waveformData !== undefined) return track.type === 'audio';
  if (clip.properties.effectType !== undefined) return track.type === 'effect';
  return track.type === 'video';
}

function findTargetTrack(
  tracks: readonly Track[],
  sourceTrackId: string,
  clip: ClipNode,
): Track | null {
  const source = tracks.find((track) => track.id === sourceTrackId);
  if (source && canPasteToTrack(source, clip)) return source;
  return tracks.find((track) => canPasteToTrack(track, clip)) ?? null;
}

export function materializeTimelineClipboard(
  clipboard: TimelineClipboard,
  tracks: readonly Track[],
  pasteTime: number,
): { tracks: Track[]; pastedIds: string[] } | null {
  if (clipboard.version !== 1 || clipboard.items.length === 0) return null;

  const nextTracks = tracks.map((track) => ({ ...track, clips: [...track.clips] }));
  const pastedIds: string[] = [];
  const trackById = new Map(nextTracks.map((track) => [track.id, track]));

  for (const item of clipboard.items) {
    const targetTrack = findTargetTrack(nextTracks, item.sourceTrackId, item.clip);
    if (!targetTrack) return null;

    const newClip: ClipNode = {
      ...structuredClone(item.clip),
      id: generateUUID(),
      startAt: Math.max(0, pasteTime + item.offsetFromAnchor),
    };
    targetTrack.clips.push(newClip);
    pastedIds.push(newClip.id);
    trackById.set(targetTrack.id, targetTrack);
  }

  for (const track of nextTracks) {
    track.clips.sort((a, b) => a.startAt - b.startAt);
  }

  return { tracks: nextTracks, pastedIds };
}
