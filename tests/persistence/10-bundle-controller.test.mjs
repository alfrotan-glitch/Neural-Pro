/**
 * The bundle UI path, end to end through the real store and controller.
 *
 * `08-project-bundle.test.mjs` proves the format and the service layer. This
 * proves what the two header buttons actually do — because a correct service
 * behind a controller that hydrates the wrong state, or that clobbers the open
 * project on a bad file, is still a broken feature.
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
  createCurrentProjectBundle,
  importProjectBundleIntoStore,
  loadCurrentProject,
} from '../../src/features/video-studio/project/services/projectSaveController.ts';
import { importMediaFile } from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import { useExportStore } from '../../src/store/useExportStore.ts';

suite('bundle-controller');

/** Builds a project in the real store with one durable media asset. */
async function seedStore(runtime) {
  const imported = await importMediaFile({
    file: makeFile('interview.mp4', 'interview-media-bytes'),
    runtime,
  });

  const project = await makeProject({
    tracks: [
      makeTrack({
        id: 'track_video',
        clips: [
          makeClip({
            id: 'c1',
            duration: 6,
            trim: { in: 0, out: 6 },
            properties: {
              name: 'interview.mp4',
              mediaOriginalName: 'interview.mp4',
              videoAssetId: imported.assetId,
            },
          }),
        ],
      }),
    ],
  });

  useProjectStore.getState().hydrateProject(project);
  return { imported, project };
}

await test('the Bundle button saves first, then produces a downloadable .neuralpro file', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);

  try {
    const { imported } = await seedStore(runtime);
    useExportStore.getState().setResolution('4K');

    const outcome = await createCurrentProjectBundle('Bundle UI Project');

    assert.equal(outcome.ok, true, outcome.message);
    assert.ok(outcome.blob, 'a blob must be handed to the browser to download');
    assert.equal(outcome.blob.size, outcome.byteSize);
    assert.equal(outcome.fileName.endsWith('.neuralpro'), true, outcome.fileName);
    assert.equal(outcome.assetCount, 1);
    assert.deepEqual(outcome.missingAssets, []);
    assert.match(outcome.message, /Bundle ready/);
    assert.equal(useProjectStore.getState().toastMessage, outcome.message, 'the user must see the result');

    // "Saves first" is the whole point: the file must contain the state that was in
    // the editor, including the settings change made after the last explicit save.
    const fileName = outcome.fileName.replace(/\.neuralpro$/, '');
    assert.equal(fileName.replace(/-/g, ' ').toLowerCase(), 'bundle ui project');

    const restored = await importProjectBundleIntoStore(outcome.blob);
    assert.equal(restored.ok, true, restored.message);
    assert.equal(useExportStore.getState().resolution, '4K', 'settings travel inside the bundle');
    assert.equal(
      useProjectStore.getState().tracks[0].clips[0].properties.videoAssetId,
      imported.assetId,
      'the clip must still reference the same AssetId',
    );
  } finally {
    clearRuntime();
  }
});

await test('a failed save produces no bundle — the file cannot lag the editor', async () => {
  const quotaError = new Error('quota exceeded');
  quotaError.name = 'QuotaExceededError';
  const { runtime } = await createTestRuntime({ backendHooks: { failNextWriteWith: quotaError } });
  installRuntime(runtime);

  try {
    await seedStore(runtime);
    const outcome = await createCurrentProjectBundle('Cannot Save');

    assert.equal(outcome.ok, false);
    assert.equal(outcome.blob, null, 'no file may be offered when the save did not happen');
    assert.match(outcome.message, /Save failed/i);
  } finally {
    clearRuntime();
  }
});

await test('Open Bundle wipes the editor and restores the bundled project', async () => {
  const source = await createTestRuntime();
  installRuntime(source.runtime);

  let target = null;
  try {
    const { imported } = await seedStore(source.runtime);
    const bundle = await createCurrentProjectBundle('Restore Me');
    assert.equal(bundle.ok, true, bundle.message);

    // Importing back into the SAME profile must reuse the bytes it already has
    // rather than rewriting them — same identity, so no conflict and no duplication.
    const reused = await importProjectBundleIntoStore(bundle.blob);
    assert.equal(reused.ok, true, reused.message);
    assert.match(reused.message, /1 already present/);
    assert.deepEqual(
      reused.missingAssets,
      [],
      'nothing is missing when the bytes are already here',
    );

    // Now the case the button exists for: a machine that has never seen this project.
    target = await createTestRuntime();
    installRuntime(target.runtime);
    useProjectStore.getState().hydrateProject(await makeProject({ tracks: [] }));
    assert.deepEqual(useProjectStore.getState().tracks, [], 'the editor starts empty');

    const restored = await importProjectBundleIntoStore(bundle.blob);
    assert.equal(restored.ok, true, restored.message);
    assert.equal(restored.name, 'Restore Me');
    assert.match(restored.message, /Imported "Restore Me"/);
    assert.match(
      restored.message,
      /1 media file\(s\) restored/,
      'the bytes must come out of the file, not out of this profile',
    );
    assert.deepEqual(restored.missingAssets, []);

    const state = useProjectStore.getState();
    assert.equal(state.tracks.length, 1);
    assert.equal(state.tracks[0].id, 'track_video');
    assert.equal(state.tracks[0].clips[0].id, 'c1');
    assert.equal(state.tracks[0].clips[0].duration, 6);
    assert.equal(
      state.tracks[0].clips[0].properties.videoAssetId,
      imported.assetId,
      'AssetId is stable across machines — that is the whole point of R5',
    );
    assert.equal(
      typeof state.tracks[0].clips[0].properties.videoUrl,
      'string',
      'the clip must be playable again, not just labelled',
    );

    // "Continue" must work after this: the imported project is the last opened one,
    // and reloading it by name from durable storage returns the same timeline.
    const reopened = await loadCurrentProject('Restore Me');
    assert.equal(reopened.loaded, true, reopened.message);
    assert.equal(reopened.result?.projectId, restored.projectId);
    assert.equal(reopened.result?.state?.tracks?.length, 1);
    assert.equal(reopened.result?.state?.tracks?.[0].clips[0].id, 'c1');
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('a file that is not a bundle is refused and the open project survives', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);

  try {
    const { imported } = await seedStore(runtime);
    const before = structuredClone(useProjectStore.getState().tracks);

    const outcome = await importProjectBundleIntoStore(makeBlob('this is not a zip archive'));

    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /Import failed/i);
    assert.equal(useProjectStore.getState().toastMessage, outcome.message);

    // The failure must be inert: whatever the user was editing is still there.
    const after = useProjectStore.getState().tracks;
    assert.equal(after[0].clips[0].id, before[0].clips[0].id);
    assert.equal(after[0].clips[0].properties.videoAssetId, imported.assetId);
    assert.deepEqual(after[0].clips[0].trim, before[0].clips[0].trim);
  } finally {
    clearRuntime();
  }
});

await test('a bundle with missing media imports, reports it, and keeps the clip', async () => {
  const source = await createTestRuntime();
  installRuntime(source.runtime);

  let target = null;
  try {
    const { imported } = await seedStore(source.runtime);
    const bundle = await createCurrentProjectBundle('Partial Project');
    assert.equal(bundle.ok, true, bundle.message);

    // A second bundle, exported after the media was evicted from this profile.
    await source.runtime.registry.delete(imported.assetId);
    const partial = await createCurrentProjectBundle('Partial Project');
    assert.equal(partial.ok, true, 'a partial bundle is still worth having');
    assert.equal(partial.assetCount, 0);
    assert.deepEqual(partial.missingAssets, [imported.assetId]);
    assert.match(partial.message, /NOT in the bundle/);

    target = await createTestRuntime();
    installRuntime(target.runtime);
    useProjectStore.getState().hydrateProject(await makeProject({ tracks: [] }));

    const restored = await importProjectBundleIntoStore(partial.blob);
    assert.equal(restored.ok, true, restored.message);
    assert.match(restored.message, /missing and need a relink/);
    assert.deepEqual(restored.missingAssets, [imported.assetId]);

    // The clip is still on the timeline, flagged — never silently dropped.
    const clip = useProjectStore.getState().tracks[0].clips[0];
    assert.equal(clip.id, 'c1');
    assert.equal(clip.properties.mediaMissing, true);
    assert.equal(useProjectStore.getState().totalDuration, 6, 'the timeline must not collapse');
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

report('PERSISTENCE_BUNDLE_CONTROLLER');
