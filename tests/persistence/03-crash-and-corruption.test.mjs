/**
 * Crash safety, corruption handling and recovery.
 *
 * A persistence layer that cannot survive being interrupted is not durable. These
 * tests interrupt it on purpose and assert what the user gets back.
 */

import {
  assert,
  createTestRuntime,
  makeClip,
  makeProject,
  makeTrack,
  report,
  suite,
  test,
} from './harness.mjs';
import {
  loadProject,
  saveProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import {
  openEnvelopeFromJson,
  sealDocument,
} from '../../src/infra/persistence/documentContract.ts';
import { PersistenceError } from '../../src/infra/persistence/errors.ts';
import { projectKey, rollbackKey } from '../../src/infra/persistence/projectDocumentStore.ts';

suite('crash-and-corruption');

async function seedProject(runtime, projectId, name, clipId = 'c1') {
  const state = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ id: clipId, duration: 5, trim: { in: 0, out: 5 } })] })],
  });
  const saved = await saveProject({ projectId, name, state, runtime, skipGarbageCollection: true });
  assert.equal(saved.ok, true, saved.error?.message);
  return { state, saved };
}

await test('a crash during the write leaves the previous document completely intact', async () => {
  let crash = false;
  const backendHooks = {
    crashBeforeCommit: () => {
      if (crash) {
        const error = new Error('process died');
        error.name = 'SimulatedCrash';
        throw error;
      }
    },
  };
  const { runtime, backend } = await createTestRuntime({ backendHooks });

  const { state, saved } = await seedProject(runtime, 'proj_crash', 'Crash');
  assert.equal(saved.revision, 1);
  const beforeRaw = await backend.get(projectKey('proj_crash'));

  // Second save, interrupted after staging but before commit.
  crash = true;
  const nextState = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ id: 'c1', duration: 5, trim: { in: 0, out: 5 } }), makeClip({ id: 'c2', startAt: 5, duration: 5, trim: { in: 0, out: 5 } })] })],
  });
  // saveProject converts a failed write into ok:false (it must never throw into the UI).
  const crashedSave = await saveProject({ projectId: 'proj_crash', name: 'Crash', state: nextState, runtime, skipGarbageCollection: true });
  assert.equal(crashedSave.ok, false);
  assert.match(crashedSave.error.message, /process died/);

  const afterRaw = await backend.get(projectKey('proj_crash'));
  assert.equal(afterRaw, beforeRaw, 'the primary document must be byte-identical after a crash');

  const loaded = await loadProject({ projectId: 'proj_crash', name: 'Crash', fallbackState: state, runtime });
  assert.equal(loaded.found, true);
  assert.equal(loaded.revision, 1, 'revision must not advance on an interrupted write');
  assert.equal(loaded.recovered, false, 'nothing needed recovering: the write never landed');
  assert.equal(loaded.state.tracks[0].clips.length, 1, 'the interrupted edit must not be partially visible');
});

await test('no partial write: the rollback slot and index are only updated with the document', async () => {
  let crash = false;
  const commits = [];
  const { runtime, backend } = await createTestRuntime({
    backendHooks: {
      onCommit: (staged) => commits.push([...staged.keys()]),
      crashBeforeCommit: () => {
        if (crash) throw new Error('died mid-save');
      },
    },
  });

  await seedProject(runtime, 'proj_atomic', 'Atomic');
  assert.deepEqual(commits[0].sort(), ['project-index', 'project:proj_atomic']);

  crash = true;
  const state = await makeProject();
  const failedSave = await saveProject({ projectId: 'proj_atomic', name: 'Atomic', state, runtime, skipGarbageCollection: true });
  assert.equal(failedSave.ok, false);
  assert.match(failedSave.error.message, /died mid-save/);

  assert.equal(await backend.get(rollbackKey('proj_atomic')), null, 'rollback must not be written by a failed save');
  const index = await runtime.documents.list();
  assert.equal(index.length, 1);
  assert.equal(index[0].revision, 1);
});

await test('a corrupted primary document recovers from the previous revision', async () => {
  const { runtime, backend } = await createTestRuntime();
  const { state } = await seedProject(runtime, 'proj_corrupt', 'Corrupt', 'first');

  const secondState = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ id: 'second', duration: 7, trim: { in: 0, out: 7 } })] })],
  });
  await saveProject({ projectId: 'proj_corrupt', name: 'Corrupt', state: secondState, runtime, skipGarbageCollection: true });

  // Simulate storage damage on the current document.
  const current = await backend.get(projectKey('proj_corrupt'));
  await backend.put(projectKey('proj_corrupt'), current.slice(0, current.length - 40));

  const loaded = await loadProject({ projectId: 'proj_corrupt', name: 'Corrupt', fallbackState: state, runtime });
  assert.equal(loaded.found, true);
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.recoveredFrom, 'rollback');
  assert.ok(loaded.error, 'the original corruption must still be reported');
  assert.equal(loaded.error.code, 'PERSISTENCE_CORRUPT');
  assert.equal(loaded.state.tracks[0].clips[0].id, 'first', 'the previous good version is restored');
});

await test('a corrupted document with no previous version is reported, never replaced by an empty project', async () => {
  const { runtime, backend } = await createTestRuntime();
  const { state } = await seedProject(runtime, 'proj_lonely', 'Lonely');
  await backend.put(projectKey('proj_lonely'), '{"schemaVersion":2,"project":{"tr');

  const loaded = await loadProject({ projectId: 'proj_lonely', name: 'Lonely', fallbackState: state, runtime });
  assert.equal(loaded.found, false);
  assert.equal(loaded.state, null, 'no partial hydrate');
  assert.equal(loaded.error.code, 'PERSISTENCE_CORRUPT');
});

await test('tampering with a clip duration is detected by the checksum', async () => {
  const { runtime, backend } = await createTestRuntime();
  const { state } = await seedProject(runtime, 'proj_tamper', 'Tamper');

  const stored = await backend.get(projectKey('proj_tamper'));
  const parsed = JSON.parse(stored);
  parsed.document.project.tracks[0].clips[0].duration = 99;
  await backend.put(projectKey('proj_tamper'), JSON.stringify(parsed));

  const loaded = await loadProject({ projectId: 'proj_tamper', name: 'Tamper', fallbackState: state, runtime });
  assert.equal(loaded.found, false);
  assert.equal(loaded.error.code, 'PERSISTENCE_CORRUPT');
  assert.match(loaded.error.message, /checksum/);
});

await test('a payload rewritten without its order fingerprint is rejected (writer-bug class)', async () => {
  const { runtime, backend } = await createTestRuntime();
  const twoClipState = await makeProject({
    tracks: [
      makeTrack({
        clips: [
          makeClip({ id: 'first', startAt: 0, duration: 5, trim: { in: 0, out: 5 } }),
          makeClip({ id: 'second', startAt: 5, duration: 5, trim: { in: 0, out: 5 } }),
        ],
      }),
    ],
  });
  await saveProject({ projectId: 'proj_order', name: 'Order', state: twoClipState, runtime, skipGarbageCollection: true });
  const state = twoClipState;

  const stored = await runtime.documents.load('proj_order');
  // A valid envelope for the ORIGINAL ordering (valid checksum AND fingerprint).
  const envelope = await sealDocument(stored.document, {
    projectId: 'proj_order', name: 'Order', revision: stored.revision + 1, savedAt: Date.now(),
  });

  // Now swap in a reordered payload and refresh only the checksum: this is what a
  // partially upgraded writer produces. The order fingerprint is the only thing
  // that can notice, because the checksum now agrees with the tampered bytes.
  const tampered = structuredClone(stored.document);
  tampered.project.tracks[0].clips.reverse();
  const { checksumOf } = await import('../../src/infra/persistence/integrity.ts');
  const { algorithm, checksum } = await checksumOf(tampered);
  await backend.put(
    projectKey('proj_order'),
    JSON.stringify({ ...envelope, document: tampered, checksum, algorithm }),
  );

  const loaded = await loadProject({ projectId: 'proj_order', name: 'Order', fallbackState: state, runtime });
  assert.equal(loaded.found, false);
  assert.equal(loaded.error.code, 'PERSISTENCE_CORRUPT');
  assert.match(loaded.error.message, /ordering/);
});

await test('a document whose stored duration disagrees with its timeline is refused', async () => {
  const { runtime, backend } = await createTestRuntime();
  const { state } = await seedProject(runtime, 'proj_duration', 'Duration');

  const stored = await runtime.documents.load('proj_duration');
  const envelope = await sealDocument(stored.document, {
    projectId: 'proj_duration', name: 'Duration', revision: stored.revision + 1, savedAt: Date.now(),
  });
  const forged = { ...envelope, duration: envelope.duration + 100 };
  await backend.put(projectKey('proj_duration'), JSON.stringify(forged));

  const loaded = await loadProject({ projectId: 'proj_duration', name: 'Duration', fallbackState: state, runtime });
  assert.equal(loaded.found, false);
  assert.equal(loaded.error.code, 'PERSISTENCE_CORRUPT');
  assert.match(loaded.error.message, /duration/);
});

await test('restoreRollback promotes the previous version on user request', async () => {
  const { runtime } = await createTestRuntime();
  const { state } = await seedProject(runtime, 'proj_restore', 'Restore', 'v1');
  await saveProject({
    projectId: 'proj_restore',
    name: 'Restore',
    state: await makeProject({ tracks: [makeTrack({ clips: [makeClip({ id: 'v2', duration: 9, trim: { in: 0, out: 9 } })] })] }),
    runtime,
    skipGarbageCollection: true,
  });

  const restored = await runtime.documents.restoreRollback('proj_restore');
  assert.equal(restored.found, true);
  assert.equal(restored.document.project.tracks[0].clips[0].id, 'v1');
  assert.equal(restored.envelope.revision, 1);

  const index = await runtime.documents.list();
  assert.equal(index.find((entry) => entry.projectId === 'proj_restore').revision, 1);
});

await test('an unsupported schemaVersion is refused and names both versions (R4)', async () => {
  const { runtime, backend } = await createTestRuntime();
  const { state } = await seedProject(runtime, 'proj_future', 'Future');

  const stored = await runtime.documents.load('proj_future');
  const forged = structuredClone(stored.envelope);
  forged.document = { ...stored.document, schemaVersion: 99 };
  forged.schemaVersion = 99;
  delete forged.checksum; // bypass the checksum so the version gate is what fires
  await backend.put(projectKey('proj_future'), JSON.stringify(forged));

  const loaded = await loadProject({ projectId: 'proj_future', name: 'Future', fallbackState: state, runtime });
  assert.equal(loaded.found, false);
  assert.equal(loaded.error.code, 'PERSISTENCE_UNSUPPORTED_VERSION');
  assert.match(loaded.error.message, /99/);
  assert.match(loaded.error.message, /1, 2/);
  assert.equal(loaded.state, null, 'an unknown version must never be guessed at');
});

await test('a concurrent writer wins and the losing save reports a conflict instead of clobbering', async () => {
  const { runtime, backend } = await createTestRuntime();
  const { saved } = await seedProject(runtime, 'proj_race', 'Race');

  const current = (await runtime.documents.load('proj_race')).document;
  const other = structuredClone(current);
  other.project.metadata = { ...other.project.metadata, title: 'Written by the other tab' };
  const otherEnvelope = await sealDocument(other, {
    projectId: 'proj_race', name: 'Race', revision: saved.revision + 1, savedAt: Date.now(),
  });

  // Land the other writer's commit in the window between our read and our transaction.
  const originalTransaction = backend.transaction.bind(backend);
  backend.transaction = async (mutate) => {
    backend.transaction = originalTransaction;
    await originalTransaction(async (tx) => {
      tx.put(projectKey('proj_race'), JSON.stringify(otherEnvelope));
    });
    return originalTransaction(mutate);
  };

  const nextState = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ id: 'loser', duration: 3, trim: { in: 0, out: 3 } })] })],
  });
  const result = await saveProject({ projectId: 'proj_race', name: 'Race', state: nextState, runtime, skipGarbageCollection: true });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PERSISTENCE_CONFLICT');
  assert.equal(result.error.details.expectedRevision, saved.revision);
  assert.equal(result.error.details.foundRevision, saved.revision + 1);

  const survivor = await runtime.documents.load('proj_race');
  assert.equal(survivor.document.project.metadata.title, 'Written by the other tab');
  assert.equal(survivor.document.project.tracks[0].clips[0].id, 'c1', 'the losing write must not be visible');
});

await test('PersistenceError exposes a stable machine-readable code', async () => {
  const error = new PersistenceError('PERSISTENCE_QUOTA', 'full', { projectId: 'p' });
  assert.ok(error instanceof Error);
  assert.ok(error instanceof PersistenceError);
  assert.equal(error.code, 'PERSISTENCE_QUOTA');
  assert.equal(error.details.projectId, 'p');
});

await test('a save that fails reports ok:false — success is never faked (INV-010)', async () => {
  const quotaError = new Error('QuotaExceededError: storage full');
  quotaError.name = 'QuotaExceededError';
  const { runtime } = await createTestRuntime({ backendHooks: { failNextWriteWith: quotaError } });
  const state = await makeProject();

  const result = await saveProject({ projectId: 'proj_quota', name: 'Quota', state, runtime, skipGarbageCollection: true });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PERSISTENCE_QUOTA');
  assert.ok(result.warnings.some((warning) => /evicted/.test(warning.message)), 'the eviction option must be offered');
});

await test('openEnvelopeFromJson reports invalid JSON as corruption', async () => {
  await assert.rejects(() => openEnvelopeFromJson('not json'), (error) => {
    assert.equal(error.code, 'PERSISTENCE_CORRUPT');
    return true;
  });
});

report('PERSISTENCE_CRASH_SAFETY');
