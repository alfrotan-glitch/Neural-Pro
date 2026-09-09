/**
 * Save → Reload → Continue.
 *
 * Everything the user would notice as "the project changed on me" is asserted
 * here: identity, track order, clip order, per-clip duration, total duration,
 * selection, settings and animation tracks.
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
  deriveProjectId,
  loadProject,
  saveProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import { getCanonicalClipTimelineDuration } from '../../src/core/engine/clipTimelineDuration.ts';
import { calculateProjectDuration } from '../../src/core/engine/projectDuration.ts';
import { getPreviewLayerZIndex, getTrackLayerRole } from '../../src/features/video-studio/playback/compositor/layerOrder.ts';

suite('round-trip');

/** Builds a project whose clips deliberately arrive OUT of startAt order. */
async function buildUnorderedProject() {
  const clips = [
    makeClip({ id: 'c_late', startAt: 12, duration: 3, trim: { in: 0, out: 3 } }),
    makeClip({ id: 'c_early', startAt: 0, duration: 5, trim: { in: 0, out: 5 } }),
    makeClip({ id: 'c_mid', startAt: 5, duration: 2, trim: { in: 0, out: 2 } }),
  ];
  const videoTrack = makeTrack({ id: 'track_video', clips });
  const audioTrack = makeTrack({
    id: 'track_audio',
    type: 'audio',
    clips: [
      makeClip({ id: 'a1', startAt: 1, duration: 8, trim: { in: 0, out: 8 }, properties: { name: 'music', audioUrl: 'https://example.test/music.mp3' } }),
    ],
  });
  const textTrack = makeTrack({
    id: 'track_text',
    type: 'text',
    clips: [
      makeClip({ id: 't2', startAt: 4, duration: 2, trim: { in: 0, out: 2 }, properties: { textContent: 'second' } }),
      makeClip({ id: 't1', startAt: 0, duration: 2, trim: { in: 0, out: 2 }, properties: { textContent: 'first' } }),
    ],
  });
  // Track order is z-order: video below text on purpose, then audio last.
  return makeProject({
    tracks: [videoTrack, textTrack, audioTrack],
    selectedNodeIds: ['c_mid', 't1'],
    currentTime: 3,
  });
}

await test('project identity, name and revision survive a save/load cycle', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('My Show');
  const state = await buildUnorderedProject();

  const saved = await saveProject({ projectId, name: 'My Show', state, runtime, skipGarbageCollection: true });
  assert.equal(saved.ok, true, `save failed: ${saved.error?.message}`);
  assert.equal(saved.revision, 1);

  const loaded = await loadProject({ projectId, name: 'My Show', fallbackState: state, runtime });
  assert.equal(loaded.found, true);
  assert.equal(loaded.state.projectId, state.projectId);
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.recovered, false);
  assert.equal(loaded.error, null);
});

await test('track order and clip order are reproduced index-for-index', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('Order Show');
  const state = await buildUnorderedProject();
  await saveProject({ projectId, name: 'Order Show', state, runtime, skipGarbageCollection: true });

  const loaded = await loadProject({ projectId, name: 'Order Show', fallbackState: state, runtime });
  const before = state.tracks.map((track) => `${track.id}:${track.clips.map((clip) => clip.id).join('|')}`);
  const after = loaded.state.tracks.map((track) => `${track.id}:${track.clips.map((clip) => clip.id).join('|')}`);
  assert.deepEqual(after, before, 'track/clip ordering changed across a reload');

  // Clips are NOT re-sorted by startAt: array index is the layering order.
  assert.deepEqual(
    loaded.state.tracks[0].clips.map((clip) => clip.id),
    ['c_late', 'c_early', 'c_mid'],
  );
});

await test('preview/export z-order is identical before save and after reload', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('Z Order Show');
  const state = await buildUnorderedProject();
  await saveProject({ projectId, name: 'Z Order Show', state, runtime, skipGarbageCollection: true });
  const loaded = await loadProject({ projectId, name: 'Z Order Show', fallbackState: state, runtime });

  const zOf = (tracks, time) =>
    tracks.flatMap((track, trackIndex) =>
      track.clips
        .map((clip, clipIndex) => ({ clip, clipIndex, trackIndex }))
        .filter(({ clip }) => time >= clip.startAt && time < clip.startAt + clip.duration)
        .map(({ clip, clipIndex, trackIndex }) => ({
          id: clip.id,
          z: getPreviewLayerZIndex(getTrackLayerRole(trackOf(tracks, trackIndex)), trackIndex, clipIndex),
        })),
    );

  function trackOf(tracks, index) {
    return tracks[index];
  }

  for (const time of [0.5, 3, 5.5, 12.5]) {
    assert.deepEqual(zOf(loaded.state.tracks, time), zOf(state.tracks, time), `z-order drifted at t=${time}`);
  }
});

await test('per-clip effective duration and project duration are unchanged by a reload', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('Duration Show');
  const state = await buildUnorderedProject();
  await saveProject({ projectId, name: 'Duration Show', state, runtime, skipGarbageCollection: true });
  const loaded = await loadProject({ projectId, name: 'Duration Show', fallbackState: state, runtime });

  const flat = (tracks) => tracks.flatMap((track) => track.clips);
  const before = flat(state.tracks).map((clip) => [clip.id, getCanonicalClipTimelineDuration(clip)]);
  const after = flat(loaded.state.tracks).map((clip) => [clip.id, getCanonicalClipTimelineDuration(clip)]);
  assert.deepEqual(after, before, 'effective clip durations changed across a reload');

  assert.equal(loaded.state.totalDuration, state.totalDuration);
  assert.equal(loaded.state.totalDuration, calculateProjectDuration(loaded.state.tracks));
});

await test('currentTime, selection and transport flag are restored safely', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('Selection Show');
  const state = await buildUnorderedProject();
  await saveProject({ projectId, name: 'Selection Show', state, runtime, skipGarbageCollection: true });

  const loaded = await loadProject({ projectId, name: 'Selection Show', fallbackState: state, runtime });
  assert.equal(loaded.state.currentTime, 3);
  assert.deepEqual(loaded.state.selectedNodeIds, ['c_mid', 't1']);
  assert.equal(loaded.state.isPlaying, false, 'isPlaying must never be persisted as true (R6)');
});

await test('a selection pointing at a deleted clip is dropped, not left dangling', async () => {
  const { runtime, backend } = await createTestRuntime();
  const projectId = await deriveProjectId('Stale Selection');
  const state = await buildUnorderedProject();
  await saveProject({ projectId, name: 'Stale Selection', state, runtime, skipGarbageCollection: true });

  // Simulate a document whose selection references a clip that no longer exists.
  const stored = await runtime.documents.load(projectId);
  const tampered = structuredClone(stored.document);
  tampered.project.selectedNodeIds = ['c_mid', 'ghost-clip'];
  const { sealDocument } = await import('../../src/infra/persistence/documentContract.ts');
  const envelope = await sealDocument(tampered, {
    projectId,
    name: 'Stale Selection',
    revision: stored.revision + 1,
    savedAt: Date.now(),
  });
  await backend.put(`project:${projectId}`, JSON.stringify(envelope));

  const loaded = await loadProject({ projectId, name: 'Stale Selection', fallbackState: state, runtime });
  assert.deepEqual(loaded.state.selectedNodeIds, ['c_mid']);
});

await test('project settings round-trip and unknown values are ignored, not guessed', async () => {
  const { runtime, backend } = await createTestRuntime();
  const projectId = await deriveProjectId('Settings Show');
  const state = await buildUnorderedProject();
  const settings = { export: { resolution: '4K', fps: 60, codec: 'AV1', quality: 'High Quality', audioBitrate: '320k', format: 'webm', videoBitrateMode: 'custom', videoBitrate: 12_000_000 } };

  await saveProject({ projectId, name: 'Settings Show', state, settings, runtime, skipGarbageCollection: true });
  const loaded = await loadProject({ projectId, name: 'Settings Show', fallbackState: state, runtime });
  assert.deepEqual(loaded.settings.export, settings.export);

  // A future build may persist a value this build does not know; it must be dropped.
  const stored = await runtime.documents.load(projectId);
  const tampered = structuredClone(stored.document);
  tampered.settings.export.resolution = '16K';
  tampered.settings.export.format = 'avi';
  const { sealDocument } = await import('../../src/infra/persistence/documentContract.ts');
  const envelope = await sealDocument(tampered, { projectId, name: 'Settings Show', revision: stored.revision + 1, savedAt: Date.now() });
  await backend.put(`project:${projectId}`, JSON.stringify(envelope));

  const reloaded = await loadProject({ projectId, name: 'Settings Show', fallbackState: state, runtime });
  assert.equal(reloaded.settings.export.resolution, '16K', 'the document keeps the stored value verbatim');

  const { applyProjectSettings } = await import('../../src/features/video-studio/project/services/projectSaveController.ts');
  const before = (await import('../../src/store/useExportStore.ts')).useExportStore.getState();
  applyProjectSettings(reloaded.settings);
  const after = (await import('../../src/store/useExportStore.ts')).useExportStore.getState();
  assert.equal(after.resolution, before.resolution, 'an unknown resolution must not be written to the store');
  assert.equal(after.format, before.format, 'an unknown format must not be written to the store');
});

await test('animations and keyframe selection survive the round trip', async () => {
  const { runtime } = await createTestRuntime();
  const projectId = await deriveProjectId('Animation Show');
  const animations = [
    {
      id: 'anim-1',
      elementId: 'c_early',
      tracks: [
        { property: 'transform.x', keyframes: [{ id: 'kf-1', time: 0, value: 0, easing: 'linear' }] },
      ],
    },
  ];
  const state = await buildUnorderedProject();
  const withAnimation = { ...state, animations, selectedKeyframeIds: ['kf-1'] };

  await saveProject({ projectId, name: 'Animation Show', state: withAnimation, runtime, skipGarbageCollection: true });
  const loaded = await loadProject({ projectId, name: 'Animation Show', fallbackState: state, runtime });
  assert.deepEqual(loaded.state.animations, animations);
  assert.deepEqual(loaded.state.selectedKeyframeIds, ['kf-1']);
});

await test('two projects with the same default projectId do not overwrite each other', async () => {
  const { runtime } = await createTestRuntime();
  const [idA, idB] = await Promise.all([deriveProjectId('Project A'), deriveProjectId('Project B')]);
  assert.notEqual(idA, idB, 'project ids derived from different names must differ');

  const stateA = await makeProject({ tracks: [makeTrack({ id: 'track-a', clips: [makeClip({ id: 'a', duration: 2, trim: { in: 0, out: 2 } })] })] });
  const stateB = await makeProject({ tracks: [makeTrack({ id: 'track-b', clips: [makeClip({ id: 'b', duration: 9, trim: { in: 0, out: 9 } })] })] });

  await saveProject({ projectId: idA, name: 'Project A', state: stateA, runtime, skipGarbageCollection: true });
  await saveProject({ projectId: idB, name: 'Project B', state: stateB, runtime, skipGarbageCollection: true });

  const [loadedA, loadedB] = await Promise.all([
    loadProject({ projectId: idA, name: 'Project A', fallbackState: stateA, runtime }),
    loadProject({ projectId: idB, name: 'Project B', fallbackState: stateB, runtime }),
  ]);
  assert.equal(loadedA.state.tracks[0].id, 'track-a');
  assert.equal(loadedB.state.tracks[0].id, 'track-b');
  assert.equal(loadedB.state.totalDuration, 9);

  const projects = await runtime.documents.list();
  assert.equal(projects.length, 2);
});

await test('loading a project that was never saved reports found:false instead of an empty project', async () => {
  const { runtime } = await createTestRuntime();
  const state = await makeProject();
  const loaded = await loadProject({ projectId: 'proj_missing', name: 'Never Saved', fallbackState: state, runtime });
  assert.equal(loaded.found, false);
  assert.equal(loaded.state, null);
  assert.equal(loaded.error, null);
});

report('PERSISTENCE_ROUND_TRIP');
