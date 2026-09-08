import type { ClipNode, Track } from '../../project/types/project';
import {
  getPreviewLayerZIndex,
  getTrackLayerRole,
  isClipActiveAtTime,
  type OrderedClip,
  type PreviewLayerRole,
} from './layerOrder';
import { getEffectiveClipTimelineDuration } from '../services/mediaTimeMapper';

export type { PreviewLayerRole } from './layerOrder';

export interface IndexedPreviewClip extends OrderedClip {
  endAt: number;
  zIndex: number;
}

export interface PreviewCompositorIndex {
  layers: readonly IndexedPreviewClip[];
  byRole: Readonly<Record<PreviewLayerRole, readonly IndexedPreviewClip[]>>;
  prefixMaxEnd: readonly number[];
}

export interface ActivePreviewCompositorPlan {
  layers: readonly IndexedPreviewClip[];
  byRole: Readonly<Record<PreviewLayerRole, readonly IndexedPreviewClip[]>>;
  byClipId: ReadonlyMap<string, IndexedPreviewClip>;
}

const ROLES: PreviewLayerRole[] = ['background', 'video', 'audio-visual', 'overlay', 'text'];

const EFFECT_TRACK_PREDICATE = (track: Track): boolean => {
  const type = track.type as string;
  return type === 'effect' || type === 'sticker' || track.id.includes('effect') || track.id.includes('sticker') || track.id.includes('overlay');
};

function emptyRoles(): Record<PreviewLayerRole, IndexedPreviewClip[]> {
  return {
    background: [],
    video: [],
    'audio-visual': [],
    overlay: [],
    text: [],
  };
}

function buildIndexedLayers(tracks: readonly Track[]): IndexedPreviewClip[] {
  const result: IndexedPreviewClip[] = [];
  for (const [trackIndex, track] of tracks.entries()) {
    if (!track.isVisible) continue;
    const role = getTrackLayerRole(track);
    for (const [clipIndex, clip] of track.clips.entries()) {
      if (!Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) continue;
      result.push({
        clip,
        track,
        trackIndex,
        clipIndex,
        role,
        endAt: clip.startAt + getEffectiveClipTimelineDuration(clip),
        zIndex: getPreviewLayerZIndex(role, trackIndex, clipIndex),
      });
    }
  }
  result.sort((a, b) => {
    const byStart = a.clip.startAt - b.clip.startAt;
    if (byStart !== 0) return byStart;
    if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
    return a.clipIndex - b.clipIndex;
  });
  return result;
}

function upperBoundByStart(layers: readonly IndexedPreviewClip[], time: number): number {
  let lo = 0;
  let hi = layers.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const layer = layers[mid];
    if (!layer) { hi = mid; continue; }
    if (layer.clip.startAt <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function buildPreviewCompositorIndex(tracks: readonly Track[]): PreviewCompositorIndex {
  const baseLayers = buildIndexedLayers(tracks);
  const byRole = emptyRoles();
  for (const layer of baseLayers) byRole[layer.role].push(layer);
  for (const role of ROLES) {
    byRole[role].sort((a, b) => a.trackIndex - b.trackIndex || a.clipIndex - b.clipIndex);
  }

  // Preserve legacy effect-like track IDs as overlay layers even if the track type
  // itself is not "effect"/"sticker". Avoid an O(n²) membership scan.
  const existingClipIds = new Set(baseLayers.map((layer) => layer.clip.id));
  for (const [trackIndex, track] of tracks.entries()) {
    if (!track.isVisible || !EFFECT_TRACK_PREDICATE(track)) continue;
    for (const [clipIndex, clip] of track.clips.entries()) {
      if (!Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) continue;
      if (!existingClipIds.has(clip.id)) {
        const layer: IndexedPreviewClip = {
          clip,
          track,
          trackIndex,
          clipIndex,
          role: 'overlay',
          endAt: clip.startAt + getEffectiveClipTimelineDuration(clip),
          zIndex: getPreviewLayerZIndex('overlay', trackIndex, clipIndex),
        };
        baseLayers.push(layer);
        byRole.overlay.push(layer);
        existingClipIds.add(clip.id);
      }
    }
  }

  baseLayers.sort((a, b) => a.clip.startAt - b.clip.startAt || getPreviewLayerZIndex(a.role, a.trackIndex, a.clipIndex) - getPreviewLayerZIndex(b.role, b.trackIndex, b.clipIndex));
  const prefixMaxEnd: number[] = [];
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const layer of baseLayers) {
    maxEnd = Math.max(maxEnd, layer.endAt);
    prefixMaxEnd.push(maxEnd);
  }

  return { layers: baseLayers, byRole, prefixMaxEnd };
}

export function selectActivePreviewCompositorPlan(
  index: PreviewCompositorIndex,
  time: number,
): ActivePreviewCompositorPlan {
  const activeByRole = emptyRoles();
  const byClipId = new Map<string, IndexedPreviewClip>();

  const cutoff = upperBoundByStart(index.layers, time);
  // Prefix maximum end-times let us stop once every earlier interval is known
  // to have ended. This preserves correctness for overlapping clips while
  // avoiding a full project scan in the common sparse-timeline case.
  for (let i = cutoff - 1; i >= 0; i -= 1) {
    const prefixEnd = index.prefixMaxEnd[i];
    const layer = index.layers[i];
    if (prefixEnd === undefined || prefixEnd <= time) break;
    if (!layer) continue;
    if (!isClipActiveAtTime(layer.clip, time)) continue;
    activeByRole[layer.role].push(layer);
    byClipId.set(layer.clip.id, layer);
  }

  const layers: IndexedPreviewClip[] = [];
  for (const role of ROLES) {
    activeByRole[role].sort((a, b) => a.trackIndex - b.trackIndex || a.clipIndex - b.clipIndex);
    layers.push(...activeByRole[role]);
  }
  layers.sort((a, b) => getPreviewLayerZIndex(a.role, a.trackIndex, a.clipIndex) - getPreviewLayerZIndex(b.role, b.trackIndex, b.clipIndex));

  return { layers, byRole: activeByRole, byClipId };
}
