/**
 * End-to-end editor round trip and the semantic invariants that must survive it.
 *
 * These tests drive the REAL zustand store and the REAL save/load controller —
 * the same code a user's click runs — and assert that editing, saving, wiping
 * the editor and reloading gives back the same project.
 */

import {
  assert,
  createTestRuntime,
  installRuntime,
  clearRuntime,
  makeBlob,
  makeClip,
  makeFile,
  makeProject,
  makeTrack,
  report,
  suite,
  test,
} from './harness.mjs';
import { useProjectStore } from '../../src/store/useProjectStore.ts';
import {
  applyProjectSettings,
  collectProjectSettings,
  evictUnusedMedia,
  loadCurrentProject,
  saveCurrentProject,
} from '../../src/features/video-studio/project/services/projectSaveController.ts';
import {
  describeReclaimableMedia,
  findUnresolvedMediaClips,
  importMediaFile,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import { assertMediaResolvable } from '../../src/infra/persistence/mediaHydration.ts';
import { addAssetToTracks } from '../../src/features/video-studio/project/services/projectService.ts';
import { getCanonicalClipSourceDuration, getCanonicalClipTimelineDuration } from '../../src/core/engine/clipTimelineDuration.ts';
import { calculateProjectDuration } from '../../src/core/engine/projectDuration.ts';
import { createTrackSnapshotCommand } from '../../src/features/video-studio/project/commands/index.ts';
import { useExportStore } from '../../src/store/useExportStore.ts';

suite('editor-round-trip');

await test('edit → save → wipe editor → reload restores the edit through the real store', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);

  try {
    const project = await makeProject({
      tracks: [
        makeTrack({
          id: 'track_video',
          clips: [
            makeClip({ id: 'c1', startAt: 0, duration: 5, trim: { in: 0, out: 5 } }),
            makeClip({ id: 'c2', startAt: 5, duration: 5, trim: { in: 0, out: 5 } }),
          ],
        }),
      ],
    });
    useProjectStore.getState().hydrateProject(project);
    assert.equal(useProjectStore.getState().totalDuration, 10);

    // A real edit through the command pipeline (moves c2 to 20s).
    const state = useProjectStore.getState();
    const moved = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === 'c2' ? { ...clip, startAt: 20 } : clip)),
    }));
    state.executeCommand(createTrackSnapshotCommand('Move c2', state.tracks, moved));
    assert.equal(useProjectStore.getState().totalDuration, 25, 'the edit changed the project duration');

    const saved = await saveCurrentProject('Editor Show');
    assert.equal(saved.ok, true, saved.message);
    assert.match(saved.message, /Saved \(revision 1\)/);

    // Wipe the editor back to the shipped default project.
    const { useProjectStore: fresh } = await import('../../src/store/useProjectStore.ts');
    fresh.setState({
      tracks: structuredClone(project.tracks),
      totalDuration: 10,
      currentTime: 0,
      selectedNodeIds: [],
    });
    assert.equal(fresh.getState().tracks[0].clips[1].startAt, 5, 'the editor no longer holds the edit');

    const loaded = await loadCurrentProject('Editor Show');
    assert.equal(loaded.loaded, true);
    assert.equal(useProjectStore.getState().tracks[0].clips[1].startAt, 20, 'the edit came back');
    assert.equal(useProjectStore.getState().totalDuration, 25);
    assert.equal(useProjectStore.getState().isPlaying, false);
  } finally {
    clearRuntime();
  }
});

await test('a failed save is reported as a failure to the user, never as success', async () => {
  const quotaError = new Error('quota exceeded');
  quotaError.name = 'QuotaExceededError';
  const { runtime } = await createTestRuntime({ backendHooks: { failNextWriteWith: quotaError } });
  installRuntime(runtime);

  try {
    const project = await makeProject();
    useProjectStore.getState().hydrateProject(project);
    const outcome = await saveCurrentProject('Quota Show');
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /Save failed/i);
    assert.match(outcome.message, /storage is full/i);
    assert.equal(useProjectStore.getState().toastMessage, outcome.message, 'the toast must carry the failure');
  } finally {
    clearRuntime();
  }
});

await test('export settings saved with the project are restored into the export store', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);

  try {
    const project = await makeProject();
    useProjectStore.getState().hydrateProject(project);

    const exportStore = useExportStore.getState();
    exportStore.setResolution('4K');
    exportStore.setFps(60);
    exportStore.setFormat('webm');
    const settings = collectProjectSettings();
    assert.equal(settings.export.resolution, '4K');

    const saved = await saveCurrentProject('Settings Show');
    assert.equal(saved.ok, true);

    // Change them, then reload.
    useExportStore.getState().setResolution('720p');
    useExportStore.getState().setFps(24);
    useExportStore.getState().setFormat('mp4');

    await loadCurrentProject('Settings Show');
    const restored = useExportStore.getState();
    assert.equal(restored.resolution, '4K');
    assert.equal(restored.fps, 60);
    assert.equal(restored.format, 'webm');
  } finally {
    // Leave the export store where a later test expects it.
    applyProjectSettings({ export: { resolution: '1080p', fps: 30, format: 'mp4' } });
    clearRuntime();
  }
});

await test('the upload → timeline → save → reload path keeps the media playable', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);

  try {
    const imported = await importMediaFile({ file: makeFile('interview.mp4', 'interview-bytes') });
    const state = useProjectStore.getState();
    const result = addAssetToTracks(
      structuredClone(state.tracks),
      {
        id: imported.assetId,
        type: 'video',
        name: 'interview.mp4',
        duration: 5,
        videoUrl: imported.objectUrl,
        videoAssetId: imported.assetId,
      },
      0,
    );
    state.executeCommand(createTrackSnapshotCommand('Add uploaded clip', state.tracks, result.tracks));

    const newClip = useProjectStore
      .getState()
      .tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === result.clipId);
    assert.equal(newClip.properties.videoAssetId, imported.assetId);

    const saved = await saveCurrentProject('Upload Show');
    assert.equal(saved.ok, true, saved.message);
    assert.deepEqual(saved.warnings, [], 'a freshly uploaded file must not warn');

    const { deriveProjectId } = await import('../../src/features/video-studio/project/services/projectPersistenceService.ts');
    const stored = await runtime.documents.load(await deriveProjectId('Upload Show'));
    const persisted = stored.document.project.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === result.clipId);
    assert.equal(persisted.properties.videoUrl, undefined, 'no blob: URL in the document');
    assert.equal(persisted.properties.videoAssetId, imported.assetId);

    const loaded = await loadCurrentProject('Upload Show');
    assert.equal(loaded.loaded, true);
    const reloadedClip = useProjectStore
      .getState()
      .tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === result.clipId);
    const url = reloadedClip.properties.videoUrl;
    assert.equal(typeof url, 'string');
    const response = await fetch(url);
    assert.equal(await response.text(), 'interview-bytes', 'the reloaded clip serves the uploaded bytes');
  } finally {
    clearRuntime();
  }
});

await test('clip duration does not depend on a live object URL (identity, not handle)', async () => {
  const withUrl = { duration: 8, trim: { in: 1, out: 6 }, properties: { videoUrl: 'blob:x/1' } };
  const withAssetId = { duration: 8, trim: { in: 1, out: 6 }, properties: { videoAssetId: 'as_1' } };
  const withNothing = { duration: 8, trim: { in: 1, out: 6 }, properties: {} };

  assert.equal(getCanonicalClipSourceDuration(withUrl), 5);
  assert.equal(getCanonicalClipSourceDuration(withAssetId), 5, 'an AssetId alone must bound the duration');
  assert.equal(getCanonicalClipSourceDuration(withNothing), null, 'a clip with no media is unbounded');

  assert.equal(getCanonicalClipTimelineDuration(withUrl), getCanonicalClipTimelineDuration(withAssetId));
});

await test('a clip whose media is missing keeps its geometry and the project duration', async () => {
  const { runtime } = await createTestRuntime();
  const state = await makeProject({
    tracks: [
      makeTrack({
        clips: [
          makeClip({ id: 'a', startAt: 0, duration: 6, trim: { in: 0, out: 6 }, properties: { videoAssetId: 'as_deadbeef-0000-4000-8000-000000000000' } }),
          makeClip({ id: 'b', startAt: 6, duration: 4, trim: { in: 0, out: 4 }, properties: { textContent: 'still here' } }),
        ],
      }),
    ],
  });
  const before = calculateProjectDuration(state.tracks);

  const saved = await saveProjectWithRuntime(runtime, state, 'Missing Media');
  assert.equal(saved.ok, true);
  assert.equal(saved.warnings.length, 1);

  const { loadProject } = await import('../../src/features/video-studio/project/services/projectPersistenceService.ts');
  const loaded = await loadProject({ projectId: saved.result?.projectId ?? 'proj_mm', name: 'Missing Media', fallbackState: state, runtime });

  assert.equal(loaded.state.tracks[0].clips.length, 2, 'no clip may be dropped');
  assert.equal(calculateProjectDuration(loaded.state.tracks), before, 'the timeline must not collapse');
  assert.equal(loaded.state.tracks[0].clips[0].properties.mediaMissing, true);
});

await test('export refuses to start while media is unresolved, naming the clip', async () => {
  const tracks = [
    makeTrack({
      clips: [
        makeClip({ id: 'ok', properties: { videoUrl: 'https://cdn.example.test/ok.mp4' } }),
        makeClip({ id: 'broken', properties: { name: 'lost.mp4', mediaUnresolved: true } }),
        makeClip({ id: 'text', properties: { textContent: 'no media needed' } }),
      ],
    }),
  ];

  const unresolved = findUnresolvedMediaClips(tracks);
  assert.deepEqual(unresolved.map((entry) => entry.clipId), ['broken']);
  assert.equal(unresolved[0].clipName, 'lost.mp4');

  assert.throws(
    () =>
      assertMediaResolvable([
        { clipId: 'broken', trackId: 'track-1', clipName: 'lost.mp4', assetId: null, reason: 'ASSET_MISSING', message: 'missing' },
      ]),
    (error) => {
      assert.equal(error.code, 'ASSET_MISSING');
      assert.match(error.message, /lost\.mp4/);
      return true;
    },
  );
});

await test('a clip that only ever had a dead handle is reported as needing relink', async () => {
  const tracks = [
    makeTrack({
      clips: [makeClip({ id: 'orphan', properties: { name: 'x.mp4', mediaOriginalName: 'x.mp4' } })],
    }),
  ];
  const unresolved = findUnresolvedMediaClips(tracks);
  assert.deepEqual(unresolved.map((entry) => entry.clipId), ['orphan']);
});

/** Small wrapper so this file can save with an explicit runtime. */
async function saveProjectWithRuntime(runtime, state, name) {
  const { saveProject, deriveProjectId } = await import(
    '../../src/features/video-studio/project/services/projectPersistenceService.ts'
  );
  const projectId = await deriveProjectId(name);
  const result = await saveProject({ projectId, name, state, runtime, skipGarbageCollection: true });
  return { ...result, result: { projectId } };
}

await test('a quota failure reports the real storage estimate and what can be freed', async () => {
  const quotaError = new Error('quota exceeded');
  quotaError.name = 'QuotaExceededError';
  const { runtime } = await createTestRuntime({ backendHooks: { failNextWriteWith: quotaError } });
  installRuntime(runtime);

  // Node has no navigator.storage; supply the browser API the code actually calls.
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        estimate: async () => ({ usage: 940_000_000, quota: 1_000_000_000 }),
        persisted: async () => true,
      },
    },
  });

  try {
    useProjectStore.getState().hydrateProject(await makeProject());
    const outcome = await saveCurrentProject('Quota Numbers');

    assert.equal(outcome.ok, false);
    assert.ok(outcome.quota, 'the outcome must carry the quota detail');
    assert.equal(outcome.quota.usage, 940_000_000);
    assert.equal(outcome.quota.quota, 1_000_000_000);
    // formatBytes is binary, as storage estimates are: 940e6 B = 896.5 MB.
    assert.match(outcome.message, /896\.5 MB/);
    assert.match(outcome.message, /953\.7 MB/);
    assert.equal(
      useProjectStore.getState().toastMessage,
      outcome.message,
      'the numbers must reach the user, not stay in the return value',
    );
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    clearRuntime();
  }
});

await test('evicting unused media frees the unreferenced asset and never the referenced one', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);

  try {
    const used = await importMediaFile({ file: makeFile('used.mp4', 'referenced-bytes'), runtime });
    const unused = await importMediaFile({ file: makeFile('unused.mp4', 'nobody-references-this'), runtime });

    const state = await makeProject({
      tracks: [
        makeTrack({
          clips: [
            makeClip({
              id: 'c1',
              properties: { mediaOriginalName: 'used.mp4', videoAssetId: used.assetId },
            }),
          ],
        }),
      ],
    });
    useProjectStore.getState().hydrateProject(state);
    const saved = await saveCurrentProject('Eviction');
    assert.equal(saved.ok, true, saved.message);

    const before = await describeReclaimableMedia();
    assert.equal(before.count, 1, 'exactly the unreferenced asset is reclaimable');
    assert.equal(before.bytes, unused.record.byteSize);

    const evicted = await evictUnusedMedia();
    assert.equal(evicted.ok, true, evicted.message);
    assert.equal(evicted.removedAssets, 1);
    assert.equal(evicted.removedBytes, unused.record.byteSize);

    assert.equal(await runtime.registry.get(unused.assetId), null, 'the orphan is gone');
    assert.equal(await runtime.registry.get(used.assetId) !== null, true, 'referenced media is untouched');
  } finally {
    clearRuntime();
  }
});

report('PERSISTENCE_EDITOR_ROUND_TRIP');
