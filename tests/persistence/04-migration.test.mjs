/**
 * SHIM-001 — V1 / legacy localStorage → V2 migration.
 *
 * The migration must never be the step that loses data: live blob URLs become
 * durable assets, dead ones become an explicit, relinkable state, and the raw
 * legacy payload is preserved inside the durable store before localStorage is
 * touched.
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
  deriveProjectId,
  loadProject,
  saveProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import {
  migrateV1toV2,
  readLegacyProjectPayload,
  SHIM_001_ID,
  SHIM_001_OWNER,
  SHIM_001_REMOVAL_MILESTONE,
} from '../../src/infra/persistence/migrateV1toV2.ts';
import { rollbackKey } from '../../src/infra/persistence/projectDocumentStore.ts';

suite('migration');

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

const legacyKey = (name) => `video_studio_pro_project_v1_${encodeURIComponent(name)}`;

function legacyDocument(overrides = {}) {
  return {
    schemaVersion: 1,
    project: {
      projectId: 'proj_legacy',
      metadata: { title: 'Legacy Show', resolution: { width: 1280, height: 720 }, fps: 24 },
      currentTime: 2,
      totalDuration: 999, // deliberately wrong: the canonical duration must win
      tracks: [
        {
          id: 'track_video',
          type: 'video',
          isLocked: false,
          isMuted: false,
          isVisible: true,
          clips: [
            {
              id: 'c1',
              sourceId: 's1',
              startAt: 0,
              duration: 6,
              trim: { in: 0, out: 6 },
              transform: { x: 1, y: 2, scale: 0, rotation: 0, opacity: 150 },
              properties: { name: 'legacy.mp4' },
            },
          ],
        },
      ],
      selectedNodeIds: ['c1', 'ghost'],
      isPlaying: true, // R6: must never survive
      ...overrides,
    },
  };
}

await test('a V1 document with a live blob URL becomes a durable asset', async () => {
  const { runtime } = await createTestRuntime();
  const liveUrl = URL.createObjectURL(makeBlob('legacy-bytes'));

  const outcome = await migrateV1toV2(
    {
      schemaVersion: 1,
      project: {
        ...legacyDocument().project,
        tracks: [
          {
            ...legacyDocument().project.tracks[0],
            clips: [{ ...legacyDocument().project.tracks[0].clips[0], properties: { name: 'legacy.mp4', videoUrl: liveUrl } }],
          },
        ],
      },
    },
    { projectId: 'proj_legacy', name: 'Legacy Show', importer: runtime.importer },
  );

  assert.equal(outcome.shim, SHIM_001_ID);
  assert.equal(outcome.importedAssetIds.length, 1);
  assert.deepEqual(outcome.warnings, []);

  const clip = outcome.project.tracks[0].clips[0];
  assert.match(clip.properties.videoAssetId, /^as_/);
  assert.equal(clip.properties.videoUrl, undefined, 'the transient handle must be dropped by migration');
});

await test('a V1 document with a DEAD blob URL keeps the clip and marks it unresolved', async () => {
  const { runtime } = await createTestRuntime();
  const deadUrl = 'blob:https://app.test/00000000-0000-4000-8000-000000000000';

  const outcome = await migrateV1toV2(
    {
      schemaVersion: 1,
      project: {
        ...legacyDocument().project,
        tracks: [
          {
            ...legacyDocument().project.tracks[0],
            clips: [{ ...legacyDocument().project.tracks[0].clips[0], properties: { name: 'gone.mp4', videoUrl: deadUrl } }],
          },
        ],
      },
    },
    { projectId: 'proj_legacy', name: 'Legacy Show', importer: runtime.importer },
  );

  assert.equal(outcome.importedAssetIds.length, 0);
  assert.equal(outcome.warnings.length, 1);
  assert.equal(outcome.warnings[0].reason, 'TRANSIENT_URL_UNRESOLVED');
  assert.equal(outcome.warnings[0].clipId, 'c1');

  const clip = outcome.project.tracks[0].clips[0];
  assert.equal(clip.properties.videoUrl, undefined);
  assert.equal(clip.properties.mediaUnresolved, true, 'the loss must be durable, not session-only');
  assert.equal(clip.properties.mediaOriginalName, 'gone.mp4');
  // Geometry and timing survive: only the media pointer is lost.
  assert.equal(clip.duration, 6);
  assert.deepEqual(clip.trim, { in: 0, out: 6 });
  assert.equal(outcome.project.totalDuration, 6);
});

await test('migration normalises transform, duration and selection with the canonical rules', async () => {
  const { runtime } = await createTestRuntime();
  const outcome = await migrateV1toV2(legacyDocument(), {
    projectId: 'proj_legacy',
    name: 'Legacy Show',
    importer: runtime.importer,
  });

  const clip = outcome.project.tracks[0].clips[0];
  assert.equal(clip.transform.scale, 100, 'scale 0 is invalid and must be repaired');
  assert.equal(clip.transform.opacity, 100, 'opacity is clamped to 100');
  assert.equal(outcome.project.totalDuration, 6, 'the canonical duration replaces the stored 999');
  assert.deepEqual(outcome.project.selectedNodeIds, ['c1'], 'an unknown selection entry is dropped');
  assert.equal(outcome.project.isPlaying, undefined, 'isPlaying is not part of the persisted shape');
});

await test('a pre-schema legacy payload (no schemaVersion) is recognised and migrated', async () => {
  const bare = legacyDocument().project;
  const { project, sourceSchemaVersion } = readLegacyProjectPayload(bare);
  assert.equal(sourceSchemaVersion, 0);
  assert.equal(project.projectId, 'proj_legacy');

  const { runtime } = await createTestRuntime();
  const outcome = await migrateV1toV2(bare, { projectId: 'fallback', name: 'Bare', importer: runtime.importer });
  assert.equal(outcome.sourceSchemaVersion, 0);
  assert.equal(outcome.project.tracks.length, 1);
});

await test('an unknown legacy schemaVersion is refused, not guessed', async () => {
  assert.throws(() => readLegacyProjectPayload({ schemaVersion: 7, project: {} }), (error) => {
    assert.equal(error.code, 'PERSISTENCE_UNSUPPORTED_VERSION');
    return true;
  });
});

await test('loading a legacy localStorage project migrates it, preserves the raw payload and clears the key', async () => {
  const { runtime, backend } = await createTestRuntime();
  const liveUrl = URL.createObjectURL(makeBlob('legacy-local-bytes'));
  const storage = new MemoryStorage({
    [legacyKey('Legacy Show')]: JSON.stringify({
      schemaVersion: 1,
      project: {
        ...legacyDocument().project,
        tracks: [
          {
            ...legacyDocument().project.tracks[0],
            clips: [{ ...legacyDocument().project.tracks[0].clips[0], properties: { name: 'legacy.mp4', videoUrl: liveUrl } }],
          },
        ],
      },
    }),
  });

  const projectId = await deriveProjectId('Legacy Show');
  const fallbackState = await makeProject();

  const first = await loadProject({
    projectId,
    name: 'Legacy Show',
    fallbackState,
    runtime,
    legacyStorage: storage,
    removeLegacyKeys: true,
  });

  assert.equal(first.found, true);
  assert.equal(first.recoveredFrom, 'legacy-localStorage');
  assert.equal(first.migratedFrom, 1);
  assert.equal(storage.getItem(legacyKey('Legacy Show')), null, 'the legacy key is removed after a durable save');

  // The raw legacy JSON is preserved inside the durable store as the rollback slot.
  const preserved = await backend.get(rollbackKey(projectId));
  assert.ok(preserved, 'the legacy payload must be preserved before the key is deleted');
  assert.ok(preserved.includes('legacy.mp4'));

  const clip = first.state.tracks[0].clips[0];
  assert.match(clip.properties.videoAssetId, /^as_/);
  assert.equal(typeof clip.properties.videoUrl, 'string', 'a fresh handle is minted for this session');
  assert.equal(first.state.totalDuration, 6);

  // A second load reads the V2 document directly.
  const second = await loadProject({ projectId, name: 'Legacy Show', fallbackState, runtime, legacyStorage: storage });
  assert.equal(second.found, true);
  assert.equal(second.recoveredFrom, null);
  assert.equal(second.state.tracks[0].clips[0].properties.videoAssetId, clip.properties.videoAssetId);
});

await test('a corrupt legacy localStorage document raises a typed error instead of a silent reset', async () => {
  const { runtime } = await createTestRuntime();
  const storage = new MemoryStorage({ [legacyKey('Broken')]: '{ not json' });
  const fallbackState = await makeProject();

  const brokenProjectId = await deriveProjectId('Broken');
  await assert.rejects(
    () => loadProject({
      projectId: brokenProjectId,
      name: 'Broken',
      fallbackState,
      runtime,
      legacyStorage: storage,
    }),
    (error) => {
      assert.equal(error.code, 'PERSISTENCE_CORRUPT');
      return true;
    },
  );
});

await test('remote URLs inside a V1 document survive migration untouched', async () => {
  const { runtime } = await createTestRuntime();
  const outcome = await migrateV1toV2(
    {
      schemaVersion: 1,
      project: {
        ...legacyDocument().project,
        tracks: [
          {
            ...legacyDocument().project.tracks[0],
            clips: [
              {
                ...legacyDocument().project.tracks[0].clips[0],
                properties: { name: 'remote.mp4', videoUrl: 'https://cdn.example.test/a.mp4' },
              },
            ],
          },
        ],
      },
    },
    { projectId: 'p', name: 'n', importer: runtime.importer },
  );

  assert.equal(outcome.project.tracks[0].clips[0].properties.videoUrl, 'https://cdn.example.test/a.mp4');
  assert.deepEqual(outcome.warnings, []);
});

await test('SHIM-001 declares an owner and a removal milestone (no immortal compat layer)', async () => {
  assert.equal(SHIM_001_ID, 'SHIM-001');
  assert.equal(SHIM_001_OWNER, 'WP-05');
  assert.equal(SHIM_001_REMOVAL_MILESTONE, 'WP-12');
});

await test('a migrated project re-saves as a native V2 document', async () => {
  const { runtime } = await createTestRuntime();
  const outcome = await migrateV1toV2(legacyDocument(), {
    projectId: 'proj_legacy', name: 'Legacy Show', importer: runtime.importer,
  });
  const state = { ...outcome.project, isPlaying: false };
  const saved = await saveProject({
    projectId: 'proj_legacy', name: 'Legacy Show', state, runtime, skipGarbageCollection: true,
  });
  assert.equal(saved.ok, true, saved.error?.message);

  const stored = await runtime.documents.load('proj_legacy');
  assert.equal(stored.document.schemaVersion, 2);
  assert.equal(stored.envelope.migratedFrom, undefined, 'a native save carries no migration marker');
});

await test('migration is forward-only: a V2 document is never re-migrated', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('Native');
  const state = await makeProject({ tracks: [makeTrack({ clips: [makeClip({ id: 'n1' })] })] });
  await saveProject({ projectId, name: 'Native', state, runtime, skipGarbageCollection: true });

  const loaded = await loadProject({ projectId, name: 'Native', fallbackState: state, runtime });
  assert.equal(loaded.migratedFrom, null);
  assert.equal(loaded.recovered, false);
});

report('PERSISTENCE_MIGRATION');
