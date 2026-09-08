import type { PreviewLayerRole } from '../compositor/layerOrder';
import type { CanonicalClipTransform } from './clipTransformModel';
import type { IndexedPreviewClip } from '../compositor/previewCompositorIndex';

const HASH_SEED = 0xcbf29ce484222325n;
const HASH_PRIME = 0x100000001b3n;
const HASH_MASK = 0xffffffffffffffffn;

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '[NaN]';
    if (value === Infinity) return '[Infinity]';
    if (value === -Infinity) return '[-Infinity]';
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const current = source[key];
      if (current === undefined) continue;
      result[key] = canonicalize(current);
    }
    return result;
  }
  return `[${typeof value}]`;
}

function updateHash(hash: bigint, text: string): bigint {
  let current = hash;
  for (let i = 0; i < text.length; i += 1) {
    current ^= BigInt(text.charCodeAt(i));
    current = (current * HASH_PRIME) & HASH_MASK;
  }
  return current;
}

export interface RenderSnapshotHashInput {
  time: number;
  layers: readonly IndexedPreviewClip[];
  transformByClipId: Readonly<Record<string, CanonicalClipTransform>>;
}

/**
 * Computes a deterministic content hash of only render-relevant state.
 * Session/transaction identity is deliberately excluded so scrub/seek/export
 * of the same state at the same time produce the same hash.
 */
export function computeRenderSnapshotHash(input: RenderSnapshotHashInput): string {
  const payload = canonicalize({
    schema: 1,
    time: input.time,
    layers: input.layers.map((layer) => ({
      clip: {
        id: layer.clip.id,
        sourceId: layer.clip.sourceId,
        startAt: layer.clip.startAt,
        duration: layer.clip.duration,
        trim: layer.clip.trim,
        transform: layer.clip.transform,
        properties: layer.clip.properties,
      },
      track: {
        id: layer.track.id,
        type: layer.track.type,
        laneRole: layer.track.laneRole,
      },
      trackIndex: layer.trackIndex,
      clipIndex: layer.clipIndex,
      role: layer.role as PreviewLayerRole,
      endAt: layer.endAt,
      zIndex: layer.zIndex,
      evaluatedTransform: input.transformByClipId[layer.clip.id],
    })),
  });

  const serialized = JSON.stringify(payload);
  let hash = updateHash(HASH_SEED, 'VideoStudioPro:RenderSnapshot:v1|');
  hash = updateHash(hash, serialized);
  return hash.toString(16).padStart(16, '0');
}
