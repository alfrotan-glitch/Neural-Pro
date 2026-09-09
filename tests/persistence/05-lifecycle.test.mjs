/**
 * Storage lifecycle: garbage collection, eviction, preferences and determinism.
 *
 * Deleting data is the one operation a persistence layer cannot undo, so the
 * rules here are deliberately conservative: nothing is reclaimed while it is
 * referenced, and nothing is reclaimed inside its grace window.
 */

import {
  assert,
  createTestRuntime,
  makeBlob,
  makeClip,
  makeProject,
  makeTrack,
  report,
  suite,
  test,
} from './harness.mjs';
import {
  collectOrphanedAssets,
  DEFAULT_ORPHAN_GRACE_MS,
  purgeDeletedAssets,
} from '../../src/infra/persistence/storageLifecycle.ts';
import {
  createUiPreferencesStore,
  DEFAULT_UI_PREFERENCES,
  UI_PREFERENCES_STORAGE_KEY,
  assertPreferencesAreUiOnly,
} from '../../src/infra/persistence/uiPreferencesStore.ts';
import { canonicalJson, checksumOf, fnv1a64 } from '../../src/infra/persistence/integrity.ts';
import {
  registerGeneratedMedia,
  saveProject,
  loadProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import { createMemoryAssetRegistry, createMemoryAssetStore } from '../../src/infra/persistence/memoryBackend.ts';
import { createAssetRegistry } from '../../src/infra/persistence/assetRegistryCore.ts';

suite('storage-lifecycle');

class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

async function putAsset(registry, name, bytes, type = 'video/mp4') {
  return registry.put(makeBlob(bytes, type), {
    kind: type.startsWith('audio') ? 'audio' : 'video',
    mimeType: type,
    name,
    duration: 5,
    source: { type: 'file', fileName: name },
  });
}

await test('referenced assets are never reclaimed, orphans only after the grace window', async () => {
  const now = 1_000_000;
  const referenced = new Set();
  const registry = createMemoryAssetRegistry({ clock: () => now });

  const keptId = await putAsset(registry, 'kept.mp4', 'kept');
  const orphanId = await putAsset(registry, 'orphan.mp4', 'orphan');
  referenced.add(keptId);

  // Inside the grace window nothing is deleted, even when unreferenced.
  const early = await collectOrphanedAssets({ registry, referenced, now: now + 1000 });
  assert.deepEqual(early.removed, []);
  assert.deepEqual(early.keptForGrace, [orphanId]);
  assert.equal((await registry.list()).length, 2);

  // Past the window the orphan goes, the referenced asset stays.
  const late = await collectOrphanedAssets({
    registry,
    referenced,
    now: now + DEFAULT_ORPHAN_GRACE_MS + 1,
  });
  assert.deepEqual(late.removed, [orphanId]);
  assert.equal(late.removedBytes, 'orphan'.length);
  const remaining = await registry.list();
  assert.deepEqual(remaining.map((record) => record.id), [keptId]);
});

await test('without reference information the collector refuses to guess and deletes nothing', async () => {
  const registry = createMemoryAssetRegistry();
  await putAsset(registry, 'unknown.mp4', 'bytes');
  // No referenceProvider ⇒ every live asset is assumed referenced.
  const orphans = await registry.orphaned();
  assert.deepEqual(orphans, []);
});

await test('a soft-deleted asset is only purged after its grace window', async () => {
  const now = 5_000_000;
  // The store is created explicitly so the purge path is exercised against the
  // real record list rather than a stand-in.
  const store = createMemoryAssetStore();
  const registry = createAssetRegistry({ store, clock: () => now });

  const id = await putAsset(registry, 'temp.mp4', 'temp');
  await registry.delete(id);

  // Soft delete hides it from list()/getRecord() but keeps the bytes for undo.
  assert.deepEqual(await registry.list(), []);
  assert.equal(await registry.getRecord(id), null);
  assert.equal((await store.listRecords()).length, 1, 'the bytes are still there');

  const early = await purgeDeletedAssets({ store, now: now + 1000 });
  assert.deepEqual(early.purged, []);
  assert.equal((await store.listRecords()).length, 1);

  const late = await purgeDeletedAssets({ store, now: now + DEFAULT_ORPHAN_GRACE_MS + 1 });
  assert.deepEqual(late.purged, [id]);
  assert.equal(late.freedBytes, 'temp'.length);
  assert.equal((await store.listRecords()).length, 0, 'bytes are finally reclaimed');
  assert.equal(await store.read(id), null);
});

await test('UI preferences live in localStorage and reject project data', async () => {
  const storage = new MemoryStorage();
  const store = createUiPreferencesStore(storage);

  assert.deepEqual(store.read(), DEFAULT_UI_PREFERENCES);
  store.write({ theme: 'light', timelineZoom: 2.5, lastProjectId: 'proj_x', lastProjectName: 'X' });

  const persisted = JSON.parse(storage.getItem(UI_PREFERENCES_STORAGE_KEY));
  assert.equal(persisted.theme, 'light');
  assert.equal(persisted.timelineZoom, 2.5);
  assert.equal(persisted.lastProjectName, 'X');

  assert.throws(() => store.write({ tracks: [] }), /belongs in IndexedDB/);
  assert.throws(() => assertPreferencesAreUiOnly({ project: {} }), /belongs in IndexedDB/);
});

await test('a corrupt preferences blob resets to defaults instead of breaking the editor', async () => {
  const storage = new MemoryStorage({ [UI_PREFERENCES_STORAGE_KEY]: '{oops' });
  const store = createUiPreferencesStore(storage);
  assert.deepEqual(store.read(), DEFAULT_UI_PREFERENCES);
  assert.equal(storage.getItem(UI_PREFERENCES_STORAGE_KEY), null, 'the corrupt blob is cleared');
});

await test('out-of-range preferences are clamped, not trusted', async () => {
  const storage = new MemoryStorage({
    [UI_PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: 'neon', timelineZoom: -4, activeTool: 'wand' }),
  });
  const store = createUiPreferencesStore(storage);
  const prefs = store.read();
  assert.equal(prefs.theme, 'dark');
  assert.equal(prefs.timelineZoom, 0.05);
  assert.equal(prefs.activeTool, 'select');
});

await test('localStorage is unavailable ⇒ preferences fall back silently', async () => {
  const store = createUiPreferencesStore(null);
  assert.deepEqual(store.read(), DEFAULT_UI_PREFERENCES);
  const written = store.write({ theme: 'light' });
  assert.equal(written.theme, 'light', 'in-memory preferences still work for the session');
});

await test('canonical JSON is order-independent and deterministic', () => {
  const a = canonicalJson({ b: 1, a: { d: [1, 2], c: null } });
  const b = canonicalJson({ a: { c: null, d: [1, 2] }, b: 1 });
  assert.equal(a, b);
  assert.equal(canonicalJson({ x: undefined, y: 1 }), canonicalJson({ y: 1 }));
  assert.equal(canonicalJson({ a: 1 }), '{"a":1}');
});

await test('the checksum changes when a single value changes', async () => {
  const first = await checksumOf({ tracks: [{ id: 'a', clips: [{ id: '1', duration: 4 }] }] });
  const second = await checksumOf({ tracks: [{ id: 'a', clips: [{ id: '1', duration: 4.0001 }] }] });
  assert.notEqual(first.checksum, second.checksum);
  assert.equal(first.algorithm, 'sha-256');
  assert.equal(first.checksum.length, 64);
});

await test('the synchronous fallback hash is stable and order-sensitive', () => {
  assert.equal(fnv1a64('abc'), fnv1a64('abc'));
  assert.notEqual(fnv1a64('abc'), fnv1a64('abd'));
  assert.equal(fnv1a64('').length, 16);
});

await test('generated media is stored as a durable asset with provenance', async () => {
  const { runtime } = await createTestRuntime();
  const registered = await registerGeneratedMedia({
    blob: makeBlob('rendered-output', 'video/mp4'),
    fileName: 'final.mp4',
    mimeType: 'video/mp4',
    producer: 'webcodecs-export',
    jobId: 'job-1',
    role: 'export',
    runtime,
  });

  assert.match(registered.assetId, /^as_/);
  assert.equal(registered.record.role, 'export');
  assert.deepEqual(registered.record.source, { type: 'generated', producer: 'webcodecs-export', jobId: 'job-1' });

  // The document can reference it, and the reference survives a reload.
  const state = await makeProject();
  const exports = [
    { id: 'job-1', assetId: registered.assetId, createdAt: 1, fileName: 'final.mp4', byteSize: 15, duration: null, settings: { resolution: '1080p' } },
  ];
  const saved = await saveProject({ projectId: 'proj_gen', name: 'Generated', state, exports, runtime, skipGarbageCollection: true });
  assert.equal(saved.ok, true, saved.error?.message);

  const loaded = await loadProject({ projectId: 'proj_gen', name: 'Generated', fallbackState: state, runtime });
  assert.equal(loaded.exports.length, 1);
  assert.equal(loaded.exports[0].assetId, registered.assetId);
  assert.equal(loaded.exports[0].settings.resolution, '1080p');

  const bytes = await runtime.registry.get(registered.assetId);
  assert.equal(await bytes.text(), 'rendered-output');
});

await test('saving twice produces identical document bytes for identical input (R5)', async () => {
  const { runtime } = await createTestRuntime();
  const state = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ id: 'c1', duration: 4, trim: { in: 0, out: 4 } })] })],
  });

  const first = await saveProject({ projectId: 'proj_det', name: 'Deterministic', state, runtime, skipGarbageCollection: true });
  const second = await saveProject({ projectId: 'proj_det', name: 'Deterministic', state, runtime, skipGarbageCollection: true });
  assert.notEqual(first.revision, second.revision, 'the revision advances');
  assert.equal(first.checksum, second.checksum, 'the document itself is a pure function of its input');
});

await test('deleting a project removes its document, rollback slot and index entry', async () => {
  const { runtime, backend } = await createTestRuntime();
  const state = await makeProject();
  await saveProject({ projectId: 'proj_del', name: 'Deleted', state, runtime, skipGarbageCollection: true });
  await saveProject({ projectId: 'proj_del', name: 'Deleted', state, runtime, skipGarbageCollection: true });

  assert.ok(await backend.get('project:proj_del'));
  await runtime.documents.remove('proj_del');

  assert.equal(await backend.get('project:proj_del'), null);
  assert.equal(await backend.get('project:proj_del#rollback'), null);
  assert.deepEqual(await runtime.documents.list(), []);
});

await test('saving one project never reclaims another project\'s media (cross-project GC)', async () => {
  const { runtime } = await createTestRuntime();
  const week = 7 * 24 * 60 * 60 * 1000;
  const importedLongAgo = Date.now() - (week + 60_000);

  // Project A: imported and saved over a week ago, not opened since — i.e. already
  // past the orphan grace window, which is exactly when a wrongly-scoped collector
  // stops being harmless.
  const assetA = await runtime.registry.put(makeBlob('project-A-media-bytes'), {
    kind: 'video',
    mimeType: 'video/mp4',
    name: 'a.mp4',
    source: { type: 'file', fileName: 'a.mp4' },
    createdAt: importedLongAgo,
  });
  const stateA = await makeProject({
    tracks: [
      makeTrack({
        id: 'track_A',
        clips: [
          makeClip({
            id: 'clip_A',
            properties: { name: 'a.mp4', mediaOriginalName: 'a.mp4', videoAssetId: assetA },
          }),
        ],
      }),
    ],
  });
  await saveProject({
    projectId: 'proj_A',
    name: 'Project A',
    state: stateA,
    runtime,
    skipGarbageCollection: true,
  });

  // Project B is saved today. The asset store is shared, so the collector must
  // consider every stored project before calling anything an orphan.
  const assetB = await runtime.registry.put(makeBlob('project-B-media-bytes'), {
    kind: 'video',
    mimeType: 'video/mp4',
    name: 'b.mp4',
    source: { type: 'file', fileName: 'b.mp4' },
  });
  const stateB = await makeProject({
    tracks: [
      makeTrack({
        id: 'track_B',
        clips: [
          makeClip({
            id: 'clip_B',
            properties: { name: 'b.mp4', mediaOriginalName: 'b.mp4', videoAssetId: assetB },
          }),
        ],
      }),
    ],
  });
  const saved = await saveProject({ projectId: 'proj_B', name: 'Project B', state: stateB, runtime });
  assert.equal(saved.ok, true, saved.error?.message);

  await new Promise((resolve) => setTimeout(resolve, 50)); // let the deferred GC finish

  const recordA = await runtime.registry.getRecord(assetA);
  assert.ok(recordA, 'Project A\'s asset record must survive Project B\'s save');
  assert.equal(recordA.deletedAt, null, 'it is referenced by a stored project, so it is not an orphan');
  assert.equal(await runtime.registry.get(assetA) !== null, true, 'Project A\'s bytes must still be readable');

  const reloaded = await loadProject({
    projectId: 'proj_A',
    fallbackState: await makeProject({ tracks: [] }),
    runtime,
  });
  assert.equal(reloaded.found, true);
  assert.deepEqual(reloaded.warnings, [], 'reopening Project A must not report missing media');
  assert.notEqual(reloaded.state.tracks[0].clips[0].properties.mediaMissing, true);
});

await test('a truly unreferenced asset past its grace window IS reclaimed', async () => {
  const { runtime } = await createTestRuntime();
  const week = 7 * 24 * 60 * 60 * 1000;

  const kept = await runtime.registry.put(makeBlob('still-referenced'), {
    kind: 'video',
    mimeType: 'video/mp4',
    name: 'kept.mp4',
    source: { type: 'file', fileName: 'kept.mp4' },
  });
  const stale = await runtime.registry.put(makeBlob('nobody-references-this'), {
    kind: 'video',
    mimeType: 'video/mp4',
    name: 'stale.mp4',
    source: { type: 'file', fileName: 'stale.mp4' },
    createdAt: Date.now() - (week + 60_000),
  });

  const state = await makeProject({
    tracks: [
      makeTrack({
        clips: [makeClip({ id: 'c1', properties: { mediaOriginalName: 'kept.mp4', videoAssetId: kept } })],
      }),
    ],
  });
  await saveProject({ projectId: 'proj_gc', name: 'GC Project', state, runtime });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal((await runtime.registry.getRecord(kept))?.deletedAt, null, 'referenced media is kept');
  assert.equal(await runtime.registry.get(stale), null, 'unreferenced media past the grace window is reclaimed');
});

await test('an unreadable project document stops reclamation instead of guessing', async () => {
  const { runtime, backend } = await createTestRuntime();
  const week = 7 * 24 * 60 * 60 * 1000;

  const asset = await runtime.registry.put(makeBlob('belongs-to-a-corrupt-project'), {
    kind: 'video',
    mimeType: 'video/mp4',
    name: 'x.mp4',
    source: { type: 'file', fileName: 'x.mp4' },
    createdAt: Date.now() - (week + 60_000),
  });
  const state = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ id: 'c1', properties: { mediaOriginalName: 'x.mp4', videoAssetId: asset } })] })],
  });
  await saveProject({ projectId: 'proj_ok', name: 'Readable', state, runtime, skipGarbageCollection: true });

  // A second project whose document is unreadable: its references are unknowable,
  // so nothing may be deleted on a guess.
  await backend.put('project:proj_broken', '{ this is not a valid envelope');
  const index = JSON.parse(await backend.get('project-index'));
  index.push({ projectId: 'proj_broken', name: 'Broken', revision: 1, savedAt: Date.now(), byteLength: 10, checksum: 'x' });
  await backend.put('project-index', JSON.stringify(index));

  await saveProject({ projectId: 'proj_other', name: 'Other', state, runtime });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(await runtime.registry.get(asset) !== null, true, 'no deletion while any document is unreadable');
  assert.equal((await runtime.registry.getRecord(asset))?.deletedAt, null);
});

report('PERSISTENCE_LIFECYCLE');
