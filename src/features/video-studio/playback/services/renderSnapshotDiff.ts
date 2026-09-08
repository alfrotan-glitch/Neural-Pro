import type { AtomicRenderSnapshot } from './atomicRenderSnapshot';

export type RenderSnapshotDiffCategory =
  | 'time'
  | 'layer-membership'
  | 'clip-geometry'
  | 'clip-source'
  | 'clip-properties'
  | 'track'
  | 'layer-order'
  | 'transform'
  | 'animation'
  | 'render-input';

export interface RenderSnapshotDiffEntry {
  category: RenderSnapshotDiffCategory;
  clipId?: string;
  field: string;
  previous: unknown;
  next: unknown;
}

export interface RenderSnapshotDiff {
  readonly equal: boolean;
  readonly previousHash: string;
  readonly nextHash: string;
  readonly categories: readonly RenderSnapshotDiffCategory[];
  readonly entries: readonly RenderSnapshotDiffEntry[];
}

function stableValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableValue);
  const source = value as Record<string, unknown>;
  return Object.keys(source).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = stableValue(source[key]);
    return result;
  }, {});
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
}

function add(
  entries: RenderSnapshotDiffEntry[],
  category: RenderSnapshotDiffCategory,
  field: string,
  previous: unknown,
  next: unknown,
  clipId?: string,
): void {
  if (same(previous, next)) return;
  entries.push({ category, field, previous, next, ...(clipId ? { clipId } : {}) });
}

function clipIds(snapshot: AtomicRenderSnapshot): string[] {
  return [...snapshot.byClipId.keys()].sort();
}

export function diffRenderSnapshots(
  previous: AtomicRenderSnapshot,
  next: AtomicRenderSnapshot,
): RenderSnapshotDiff {
  const entries: RenderSnapshotDiffEntry[] = [];

  add(entries, 'time', 'time', previous.time, next.time);

  const previousIds = clipIds(previous);
  const nextIds = clipIds(next);
  const previousSet = new Set(previousIds);
  const nextSet = new Set(nextIds);
  for (const clipId of previousIds) {
    if (!nextSet.has(clipId)) {
      add(entries, 'layer-membership', 'presence', clipId, undefined, clipId);
    }
  }
  for (const clipId of nextIds) {
    if (!previousSet.has(clipId)) {
      add(entries, 'layer-membership', 'presence', undefined, clipId, clipId);
    }
  }

  const commonIds = previousIds.filter((clipId) => nextSet.has(clipId));
  for (const clipId of commonIds) {
    const previousLayer = previous.byClipId.get(clipId);
    const nextLayer = next.byClipId.get(clipId);
    if (!previousLayer || !nextLayer) continue;

    add(entries, 'track', 'track.id', previousLayer.track.id, nextLayer.track.id, clipId);
    add(entries, 'track', 'track.type', previousLayer.track.type, nextLayer.track.type, clipId);
    add(entries, 'track', 'track.laneRole', previousLayer.track.laneRole, nextLayer.track.laneRole, clipId);

    add(entries, 'layer-order', 'trackIndex', previousLayer.trackIndex, nextLayer.trackIndex, clipId);
    add(entries, 'layer-order', 'clipIndex', previousLayer.clipIndex, nextLayer.clipIndex, clipId);
    add(entries, 'layer-order', 'zIndex', previousLayer.zIndex, nextLayer.zIndex, clipId);
    add(entries, 'layer-order', 'role', previousLayer.role, nextLayer.role, clipId);

    const previousClip = previousLayer.clip;
    const nextClip = nextLayer.clip;
    add(entries, 'clip-source', 'sourceId', previousClip.sourceId, nextClip.sourceId, clipId);
    add(entries, 'clip-source', 'properties.videoUrl', previousClip.properties?.videoUrl, nextClip.properties?.videoUrl, clipId);
    add(entries, 'clip-source', 'properties.imageUrl', previousClip.properties?.imageUrl, nextClip.properties?.imageUrl, clipId);
    add(entries, 'clip-geometry', 'startAt', previousClip.startAt, nextClip.startAt, clipId);
    add(entries, 'clip-geometry', 'duration', previousClip.duration, nextClip.duration, clipId);
    add(entries, 'clip-geometry', 'trim', previousClip.trim, nextClip.trim, clipId);
    add(entries, 'clip-properties', 'properties', previousClip.properties, nextClip.properties, clipId);
    add(entries, 'transform', 'clip.transform', previousClip.transform, nextClip.transform, clipId);
    add(entries, 'animation', 'evaluatedTransform', previous.transformByClipId[clipId], next.transformByClipId[clipId], clipId);
  }

  const categories = [...new Set(entries.map((entry) => entry.category))];
  return Object.freeze({
    equal: entries.length === 0 && previous.snapshotHash === next.snapshotHash,
    previousHash: previous.snapshotHash,
    nextHash: next.snapshotHash,
    categories,
    entries: Object.freeze(entries),
  });
}
