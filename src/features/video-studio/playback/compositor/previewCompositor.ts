import type { ClipNode, Track } from '../../project/types/project';
import {
  buildOrderedActiveClips,
  getPreviewLayerZIndex,
  type OrderedClip,
  type PreviewLayerRole,
} from './layerOrder';

export interface PreviewCompositorLayer extends OrderedClip {
  zIndex: number;
}

export interface PreviewCompositorPlan {
  layers: readonly PreviewCompositorLayer[];
  byRole: Readonly<Record<PreviewLayerRole, readonly PreviewCompositorLayer[]>>;
  byClipId: ReadonlyMap<string, PreviewCompositorLayer>;
}

const EFFECT_TRACK_PREDICATE = (track: Track): boolean => {
  const type = track.type as string;
  return type === 'effect' || type === 'sticker' || track.id.includes('effect') || track.id.includes('sticker') || track.id.includes('overlay');
};

function withZIndex(layer: OrderedClip): PreviewCompositorLayer {
  return {
    ...layer,
    zIndex: getPreviewLayerZIndex(layer.role, layer.trackIndex, layer.clipIndex),
  };
}

export function buildPreviewCompositorPlan(
  tracks: readonly Track[],
  activeTime: number,
): PreviewCompositorPlan {
  const orderedLayers: PreviewCompositorLayer[] = [
    ...buildOrderedActiveClips(tracks, activeTime),
  ].map(withZIndex);

  const byRole: Record<PreviewLayerRole, PreviewCompositorLayer[]> = {
    background: [],
    video: [],
    'audio-visual': [],
    overlay: [],
    text: [],
  };

  const byClipId = new Map<string, PreviewCompositorLayer>();

  for (const layer of orderedLayers) {
    byRole[layer.role].push(layer);
    byClipId.set(layer.clip.id, layer);
  }

  // Keep the existing Timeline/Preview track semantics explicit. Audio tracks
  // remain in the compositor plan even when their visual preview is hidden by
  // the UI, and effect-like track ids retain their legacy compatibility rules.
  const effectLayers = buildOrderedActiveClips(tracks, activeTime, EFFECT_TRACK_PREDICATE).map(withZIndex);
  for (const layer of effectLayers) {
    if (!byClipId.has(layer.clip.id)) {
      byRole.overlay.push(layer);
      byClipId.set(layer.clip.id, layer);
      orderedLayers.push(layer);
    }
  }

  orderedLayers.sort((a, b) => a.zIndex - b.zIndex);
  for (const role of Object.keys(byRole) as PreviewLayerRole[]) {
    byRole[role].sort((a, b) => a.zIndex - b.zIndex);
  }

  return {
    layers: orderedLayers,
    byRole,
    byClipId,
  };
}
