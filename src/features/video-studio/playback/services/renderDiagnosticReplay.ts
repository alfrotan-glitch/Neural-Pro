import type { IndexedPreviewClip, PreviewLayerRole } from '../compositor/previewCompositorIndex';
import type { AtomicRenderSnapshot } from './atomicRenderSnapshot';
import { computeRenderSnapshotHash } from './renderSnapshotHash';
import { diagnoseRenderSnapshotPair, type RenderSnapshotDiagnostic } from './renderSnapshotDiagnostics';

export const RENDER_DIAGNOSTIC_REPLAY_SCHEMA_VERSION = 1 as const;

type ReplayRole = PreviewLayerRole;

export interface RenderSnapshotReplayLayer {
  readonly clip: IndexedPreviewClip['clip'];
  readonly track: IndexedPreviewClip['track'];
  readonly trackIndex: number;
  readonly clipIndex: number;
  readonly role: ReplayRole;
  readonly endAt: number;
  readonly zIndex: number;
}

export interface RenderSnapshotReplaySnapshot {
  readonly time: number;
  readonly layers: readonly RenderSnapshotReplayLayer[];
  readonly transformByClipId: Readonly<Record<string, AtomicRenderSnapshot['transformByClipId'][string]>>;
  readonly snapshotHash: string;
}

export interface RenderDiagnosticReplayPayload {
  readonly schemaVersion: typeof RENDER_DIAGNOSTIC_REPLAY_SCHEMA_VERSION;
  readonly preview: RenderSnapshotReplaySnapshot;
  readonly export: RenderSnapshotReplaySnapshot;
}

export interface RenderDiagnosticReplayResult {
  readonly deterministic: boolean;
  readonly gatePassed: boolean;
  readonly storedPreviewHash: string;
  readonly storedExportHash: string;
  readonly recomputedPreviewHash: string;
  readonly recomputedExportHash: string;
  readonly diagnostic: RenderSnapshotDiagnostic;
}

function toReplaySnapshot(snapshot: AtomicRenderSnapshot): RenderSnapshotReplaySnapshot {
  return Object.freeze({
    time: snapshot.time,
    layers: Object.freeze(snapshot.layers.map((layer) => Object.freeze({
      clip: layer.clip,
      track: layer.track,
      trackIndex: layer.trackIndex,
      clipIndex: layer.clipIndex,
      role: layer.role,
      endAt: layer.endAt,
      zIndex: layer.zIndex,
    }))),
    transformByClipId: Object.freeze({ ...snapshot.transformByClipId }),
    snapshotHash: snapshot.snapshotHash,
  });
}

export function createRenderDiagnosticReplayPayload(
  preview: AtomicRenderSnapshot,
  exportSnapshot: AtomicRenderSnapshot,
): RenderDiagnosticReplayPayload {
  return Object.freeze({
    schemaVersion: RENDER_DIAGNOSTIC_REPLAY_SCHEMA_VERSION,
    preview: toReplaySnapshot(preview),
    export: toReplaySnapshot(exportSnapshot),
  });
}

function reconstructSnapshot(
  replay: RenderSnapshotReplaySnapshot,
): AtomicRenderSnapshot {
  const layers = Object.freeze(replay.layers.map((layer) => Object.freeze({
    clip: layer.clip,
    track: layer.track,
    trackIndex: layer.trackIndex,
    clipIndex: layer.clipIndex,
    role: layer.role,
    endAt: layer.endAt,
    zIndex: layer.zIndex,
  })));
  const byRole: Record<PreviewLayerRole, readonly IndexedPreviewClip[]> = {
    background: [],
    video: [],
    'audio-visual': [],
    overlay: [],
    text: [],
  };
  for (const role of Object.keys(byRole) as PreviewLayerRole[]) {
    byRole[role] = Object.freeze(layers.filter((layer) => layer.role === role));
  }
  const byClipId = new Map<string, IndexedPreviewClip>();
  for (const layer of layers) byClipId.set(layer.clip.id, layer);
  const recomputedHash = computeRenderSnapshotHash({
    time: replay.time,
    layers,
    transformByClipId: replay.transformByClipId,
  });
  return Object.freeze({
    sessionId: 'replay',
    sessionRevision: 0,
    barrierGeneration: 0,
    transactionId: 'replay',
    epochKey: 'replay:0',
    time: replay.time,
    layers,
    byRole: Object.freeze(byRole),
    byClipId,
    transformByClipId: replay.transformByClipId,
    snapshotHash: recomputedHash,
  });
}

export function replayRenderDiagnosticPayload(
  payload: RenderDiagnosticReplayPayload,
  storedPreviewHash: string,
  storedExportHash: string,
): RenderDiagnosticReplayResult {
  if (payload.schemaVersion !== RENDER_DIAGNOSTIC_REPLAY_SCHEMA_VERSION) {
    throw new Error(`Unsupported render diagnostic replay schema: ${String(payload.schemaVersion)}`);
  }
  const preview = reconstructSnapshot(payload.preview);
  const exportSnapshot = reconstructSnapshot(payload.export);
  const diagnostic = diagnoseRenderSnapshotPair(preview, exportSnapshot, 'regression');
  const hashesMatchStored = preview.snapshotHash === storedPreviewHash
    && exportSnapshot.snapshotHash === storedExportHash;
  const embeddedHashesMatch = payload.preview.snapshotHash === preview.snapshotHash
    && payload.export.snapshotHash === exportSnapshot.snapshotHash;
  return Object.freeze({
    deterministic: hashesMatchStored && embeddedHashesMatch,
    gatePassed: diagnostic.equal,
    storedPreviewHash,
    storedExportHash,
    recomputedPreviewHash: preview.snapshotHash,
    recomputedExportHash: exportSnapshot.snapshotHash,
    diagnostic,
  });
}
