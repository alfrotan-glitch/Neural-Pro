/**
 * Persistence test harness.
 *
 * These tests import the REAL application modules through tsx — no source
 * grepping, no re-implementation. If a behaviour regresses, the suite fails.
 */

import assert from 'node:assert/strict';
import { Blob as NodeBlob } from 'node:buffer';
import {
  createMemoryAssetRegistry,
  createMemoryKeyValueBackend,
  createObjectUrlTracker,
} from '../../src/infra/persistence/index.ts';
import { ProjectDocumentStore } from '../../src/infra/persistence/projectDocumentStore.ts';
import {
  createPersistenceRuntime,
  resetPersistenceRuntime,
  setPersistenceRuntimeForTests,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';

export { assert };

const results = [];
let currentSuite = '';

export function suite(name) {
  currentSuite = name;
}

export async function test(name, fn) {
  const label = currentSuite ? `${currentSuite} › ${name}` : name;
  try {
    await fn();
    results.push({ label, ok: true });
    console.log(`  ok   ${label}`);
  } catch (error) {
    results.push({ label, ok: false, error });
    console.error(`  FAIL ${label}`);
    console.error(`       ${error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n       ') : error}`);
  }
}

export function report(suiteName) {
  const failed = results.filter((entry) => !entry.ok);
  console.log('');
  if (failed.length === 0) {
    console.log(`${suiteName}=PASS (${results.length} assertions groups)`);
    process.exitCode = 0;
  } else {
    console.log(`${suiteName}=FAIL (${failed.length}/${results.length} failed)`);
    process.exitCode = 1;
  }
  return failed.length;
}

/* ------------------------------------------------------------------ fixtures */

export function makeBlob(bytes, type = 'video/mp4') {
  const payload = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return new NodeBlob([payload], { type });
}

/** A File-like object (Node has no File in every version we support). */
export function makeFile(name, bytes, type = 'video/mp4') {
  const blob = makeBlob(bytes, type);
  return Object.assign(blob, { name, lastModified: 0 });
}

export function makeClip(overrides = {}) {
  return {
    id: 'clip-1',
    sourceId: 'source-1',
    startAt: 0,
    duration: 4,
    trim: { in: 0, out: 4 },
    transform: { x: 0, y: 0, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100 },
    properties: { name: 'clip one' },
    ...overrides,
  };
}

export function makeTrack(overrides = {}) {
  return {
    id: 'track-1',
    type: 'video',
    isLocked: false,
    isMuted: false,
    isVisible: true,
    clips: [makeClip()],
    ...overrides,
  };
}

/**
 * Builds a ProjectState that satisfies `assertValidProjectState`.
 * totalDuration is recomputed with the same canonical function the app uses.
 */
export async function makeProject(overrides = {}) {
  const { calculateProjectDuration } = await import('../../src/core/engine/projectDuration.ts');
  const tracks = overrides.tracks ?? [makeTrack()];
  const totalDuration = calculateProjectDuration(tracks);
  return {
    projectId: 'proj_test',
    metadata: { title: 'Persistence Test', resolution: { width: 1920, height: 1080 }, fps: 30 },
    currentTime: Math.min(overrides.currentTime ?? 0, totalDuration),
    totalDuration,
    tracks,
    selectedNodeIds: overrides.selectedNodeIds ?? [],
    isPlaying: false,
    ...(overrides.animations ? { animations: overrides.animations } : {}),
    ...(overrides.selectedKeyframeIds ? { selectedKeyframeIds: overrides.selectedKeyframeIds } : {}),
  };
}

/** Instrumented URL environment so mint/revoke balance is directly observable. */
export function createInstrumentedUrlEnvironment() {
  const live = new Set();
  let minted = 0;
  let revoked = 0;
  return {
    environment: {
      createObjectURL(blob) {
        const url = `blob:test/${minted + 1}-${blob.size}`;
        minted += 1;
        live.add(url);
        return url;
      },
      revokeObjectURL(url) {
        if (!live.has(url)) throw new Error(`Revoked an unknown or already-revoked URL: ${url}`);
        live.delete(url);
        revoked += 1;
      },
    },
    stats: () => ({ minted, revoked, live: live.size }),
  };
}

/**
 * A runtime backed by memory stores — the same code paths as production, with
 * IndexedDB swapped for the in-memory backend (per ADR-006's testability rule).
 */
export async function createTestRuntime(options = {}) {
  resetPersistenceRuntime();
  const tracker = createObjectUrlTracker(options.urlEnvironment?.environment);
  const registry = createMemoryAssetRegistry({ tracker, referenceProvider: options.referenceProvider });
  const backend = createMemoryKeyValueBackend(options.backendHooks ?? {});
  const documents = new ProjectDocumentStore(backend, { clock: options.clock });
  const runtime = await createPersistenceRuntime({
    registry,
    documents,
    storageMode: options.storageMode ?? 'durable',
    capability: {
      mode: 'durable',
      indexedDbAvailable: true,
      persistentStorageGranted: true,
      estimate: { usage: null, quota: null, persisted: true },
      reason: null,
    },
  });
  return { runtime, registry, documents, backend, tracker };
}

export function installRuntime(runtime) {
  setPersistenceRuntimeForTests(runtime);
}

export function clearRuntime() {
  setPersistenceRuntimeForTests(null);
}
