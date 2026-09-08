import type { ElementAnimation } from '../../animation/types/animation';
import { evaluateClipAnimation } from '../../animation/services';
import type { PreviewLayerRole } from '../compositor/layerOrder';
import { buildPreviewCompositorIndex, selectActivePreviewCompositorPlan } from '../compositor/previewCompositorIndex';
import type { ActivePreviewCompositorPlan, IndexedPreviewClip } from '../compositor/previewCompositorIndex';
import type { AtomicMediaFrameCommit } from './atomicMediaFrameCommit';
import type { PlaybackSessionSnapshot } from './playbackSessionController';
import type { CanonicalClipTransform } from './clipTransformModel';
import { computeRenderSnapshotHash } from './renderSnapshotHash';

export interface AtomicRenderSnapshot {
  readonly sessionId: string;
  readonly sessionRevision: number;
  readonly barrierGeneration: number;
  readonly transactionId: string;
  readonly epochKey: string;
  readonly time: number;
  readonly layers: readonly IndexedPreviewClip[];
  readonly byRole: Readonly<Record<PreviewLayerRole, readonly IndexedPreviewClip[]>>;
  readonly byClipId: ReadonlyMap<string, IndexedPreviewClip>;
  readonly transformByClipId: Readonly<Record<string, CanonicalClipTransform>>;
  readonly snapshotHash: string;
}

const ROLES: readonly PreviewLayerRole[] = ['background', 'video', 'audio-visual', 'overlay', 'text'];

function freezeTransform(transform: CanonicalClipTransform): CanonicalClipTransform {
  return Object.freeze({ ...transform });
}

function freezeLayers(layers: readonly IndexedPreviewClip[]): readonly IndexedPreviewClip[] {
  return Object.freeze(layers.map((layer) => Object.freeze({ ...layer })));
}

export function createAtomicRenderSnapshot(input: {
  plan: ActivePreviewCompositorPlan;
  animations: readonly ElementAnimation[];
  commit: AtomicMediaFrameCommit;
}): AtomicRenderSnapshot {
  const transformByClipId: Record<string, CanonicalClipTransform> = {};
  for (const layer of input.plan.layers) {
    transformByClipId[layer.clip.id] = freezeTransform(
      evaluateClipAnimation(input.animations, layer.clip, input.commit.time),
    );
  }

  const byRole = {} as Record<PreviewLayerRole, readonly IndexedPreviewClip[]>;
  for (const role of ROLES) {
    byRole[role] = freezeLayers(input.plan.byRole[role]);
  }

  const layers = freezeLayers(input.plan.layers);
  const byClipId = new Map<string, IndexedPreviewClip>();
  for (const layer of layers) byClipId.set(layer.clip.id, layer);
  const snapshotHash = computeRenderSnapshotHash({
    time: input.commit.time,
    layers,
    transformByClipId,
  });

  return Object.freeze({
    sessionId: input.commit.sessionId,
    sessionRevision: input.commit.sessionRevision,
    barrierGeneration: input.commit.barrierGeneration,
    transactionId: input.commit.transactionId,
    epochKey: input.commit.epochKey,
    time: input.commit.time,
    layers,
    byRole: Object.freeze(byRole),
    byClipId,
    transformByClipId: Object.freeze(transformByClipId),
    snapshotHash,
  });
}

export function isAtomicRenderSnapshotCurrent(
  snapshot: AtomicRenderSnapshot,
  session: PlaybackSessionSnapshot,
): boolean {
  return snapshot.sessionId === session.sessionId
    && snapshot.sessionRevision === session.revision
    && snapshot.barrierGeneration === session.barrierGeneration
    && snapshot.transactionId === session.transactionId;
}

export interface StandaloneRenderSnapshotInput {
  tracks: readonly import('../../project/types/project').Track[];
  animations: readonly ElementAnimation[];
  time: number;
  origin: 'scrub' | 'seek' | 'export';
  identity?: string;
}

/**
 * Shared snapshot constructor for non-live paths (scrub, seek and export).
 * It intentionally reuses the exact same compositor selection and animation
 * evaluation as live Playback, while remaining independent of session fences.
 */
export function createStandaloneRenderSnapshot(
  input: StandaloneRenderSnapshotInput,
): AtomicRenderSnapshot {
  const plan = selectActivePreviewCompositorPlan(
    buildPreviewCompositorIndex(input.tracks),
    input.time,
  );
  const identity = input.identity ?? `${input.origin}:${input.time}`;
  const syntheticCommit: AtomicMediaFrameCommit = {
    sessionId: identity,
    sessionRevision: 0,
    barrierGeneration: 0,
    transactionId: identity,
    time: input.time,
    ready: true,
    barrier: {
      ready: true,
      time: input.time,
      minTime: input.time,
      maxTime: input.time,
      skewSeconds: 0,
      missingClipIds: [],
    },
    epochKey: `${identity}:0:0:${identity}`,
  };

  return createAtomicRenderSnapshot({
    plan,
    animations: input.animations,
    commit: syntheticCommit,
  });
}
