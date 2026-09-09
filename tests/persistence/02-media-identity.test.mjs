/**
 * Media identity, transient-reference rejection and object-URL ownership.
 *
 * Closes D-006 and INV-008/INV-009:
 *   - no blob:/data:/file: string may reach a persisted document,
 *   - clips reference AssetIds, and reload mints a FRESH handle to the same bytes,
 *   - every minted object URL is tracked and revoked.
 */

import {
  assert,
  createInstrumentedUrlEnvironment,
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
import {
  importMediaFile,
  loadProject,
  relinkClipMedia,
  releaseProjectMediaHandles,
  saveProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import {
  assertNoTransientReferences,
  findTransientReferences,
  serializeProjectDocument,
} from '../../src/infra/persistence/documentContract.ts';
import { classifyMediaUrl } from '../../src/domain/assets/types.ts';

suite('media-identity');

await test('a blob: URL in clip properties is imported as an asset, never persisted', async () => {
  const urlEnvironment = createInstrumentedUrlEnvironment();
  const { runtime } = await createTestRuntime({ urlEnvironment });

  // This is exactly what the legacy UI paths do: mint a handle and put it in properties.
  const blob = makeBlob('payload-video-bytes');
  const objectUrl = URL.createObjectURL(blob);
  assert.equal(classifyMediaUrl(objectUrl), 'transient');

  const state = await makeProject({
    tracks: [
      makeTrack({
        id: 'track_video',
        clips: [
          makeClip({
            id: 'c1',
            duration: 6,
            trim: { in: 0, out: 6 },
            properties: { name: 'upload.mp4', videoUrl: objectUrl },
          }),
        ],
      }),
    ],
  });

  const saved = await saveProject({ projectId: 'proj_media', name: 'Media', state, runtime, skipGarbageCollection: true });
  assert.equal(saved.ok, true, saved.error?.message);
  assert.equal(saved.importedAssetIds.length, 1, 'the transient handle must have been imported');

  const clip = saved.normalizedTracks[0].clips[0];
  assert.match(clip.properties.videoAssetId, /^as_/, 'clip must reference an AssetId');
  assert.equal(clip.properties.videoUrl, objectUrl, 'the live session keeps its working handle');

  const stored = await runtime.documents.load('proj_media');
  const persistedClip = stored.document.project.tracks[0].clips[0];
  assert.equal(persistedClip.properties.videoUrl, undefined, 'blob: URL must never be persisted');
  assert.match(persistedClip.properties.videoAssetId, /^as_/);
  assert.deepEqual(findTransientReferences(stored.document), [], 'no transient reference may exist in the document');

  // The bytes really are in the asset store.
  const assetId = persistedClip.properties.videoAssetId;
  const bytes = await runtime.registry.get(assetId);
  assert.ok(bytes, 'asset bytes must be stored');
  assert.equal(await bytes.text(), 'payload-video-bytes');
});

await test('reload mints a FRESH object URL that resolves to the same bytes', async () => {
  const { runtime } = await createTestRuntime();
  const blob = makeBlob('same-bytes-every-time');
  const assetId = await runtime.registry.put(blob, {
    kind: 'video',
    mimeType: 'video/mp4',
    name: 'clip.mp4',
    duration: 6,
    source: { type: 'file', fileName: 'clip.mp4' },
  });

  const state = await makeProject({
    tracks: [makeTrack({ clips: [makeClip({ duration: 6, trim: { in: 0, out: 6 }, properties: { name: 'clip.mp4', videoAssetId: assetId } })] })],
  });
  await saveProject({ projectId: 'proj_fresh', name: 'Fresh', state, runtime, skipGarbageCollection: true });

  const loaded = await loadProject({ projectId: 'proj_fresh', name: 'Fresh', fallbackState: state, runtime });
  const url = loaded.state.tracks[0].clips[0].properties.videoUrl;
  assert.equal(typeof url, 'string');
  assert.equal(classifyMediaUrl(url), 'transient', 'the runtime handle is an object URL');
  assert.deepEqual(loaded.warnings, [], 'a resolvable asset must not raise a warning');

  const response = await fetch(url);
  assert.equal(await response.text(), 'same-bytes-every-time', 'the fresh handle must serve the stored bytes');
});

await test('serialisation refuses a document that still contains a transient reference', async () => {
  const state = await makeProject({
    tracks: [
      makeTrack({
        clips: [makeClip({ properties: { name: 'x', videoUrl: 'blob:https://app.test/dead' } })],
      }),
    ],
  });
  // Serialize with the stripping stage bypassed, to prove the gate itself fails closed.
  const forged = {
    schemaVersion: 2,
    projectId: 'p',
    name: 'n',
    project: { ...state, tracks: [{ ...state.tracks[0], clips: [{ ...state.tracks[0].clips[0], properties: { deep: { nested: ['blob:x'] } } }] }] },
    assets: [],
    settings: {},
    exports: [],
  };

  assert.throws(() => assertNoTransientReferences(forged), (error) => {
    assert.equal(error.code, 'PERSISTENCE_TRANSIENT_REFERENCE');
    assert.ok(error.message.includes('deep.nested[0]'), `path should be reported, got: ${error.message}`);
    return true;
  });
});

await test('data: URLs are also rejected as durable references', async () => {
  const found = findTransientReferences({ a: { b: 'data:video/mp4;base64,AAAA' } });
  assert.equal(found.length, 1);
  assert.equal(found[0].prefix, 'data:');
});

await test('remote https media stays a remote reference and mints no object URL', async () => {
  const urlEnvironment = createInstrumentedUrlEnvironment();
  const { runtime } = await createTestRuntime({ urlEnvironment });
  const before = urlEnvironment.stats();

  const state = await makeProject({
    tracks: [
      makeTrack({
        clips: [makeClip({ properties: { name: 'remote.mp4', videoUrl: 'https://cdn.example.test/remote.mp4' } })],
      }),
    ],
  });
  const saved = await saveProject({ projectId: 'proj_remote', name: 'Remote', state, runtime, skipGarbageCollection: true });
  assert.equal(saved.ok, true);

  const stored = await runtime.documents.load('proj_remote');
  assert.equal(
    stored.document.project.tracks[0].clips[0].properties.videoUrl,
    'https://cdn.example.test/remote.mp4',
    'remote URLs are durable and preserved verbatim',
  );

  const loaded = await loadProject({ projectId: 'proj_remote', name: 'Remote', fallbackState: state, runtime });
  assert.equal(loaded.state.tracks[0].clips[0].properties.videoUrl, 'https://cdn.example.test/remote.mp4');
  assert.deepEqual(urlEnvironment.stats(), before, 'a remote asset must not mint an object URL');
});

await test('importMediaFile stores bytes before returning and dedupes identical content', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);
  try {
    const first = await importMediaFile({ file: makeFile('take-1.mp4', 'identical-bytes') });
    assert.match(first.assetId, /^as_/);
    assert.equal(first.record.byteSize, 'identical-bytes'.length);
    assert.equal(first.record.source.type, 'file');

    // Re-importing the same bytes must reuse the identity instead of duplicating storage.
    const second = await importMediaFile({ file: makeFile('take-2.mp4', 'identical-bytes') });
    assert.equal(second.assetId, first.assetId, 'identical content must dedupe to one AssetId');

    const records = await runtime.registry.list();
    assert.equal(records.filter((record) => record.contentHash === first.record.contentHash).length, 1);
  } finally {
    clearRuntime();
  }
});

await test('object-URL balance is zero across import → save → reload → close', async () => {
  const urlEnvironment = createInstrumentedUrlEnvironment();
  const { runtime } = await createTestRuntime({ urlEnvironment });
  installRuntime(runtime);

  try {
    const blob = makeBlob('balance-bytes');
    const objectUrl = URL.createObjectURL(blob); // the "legacy UI" handle
    const state = await makeProject({
      tracks: [makeTrack({ clips: [makeClip({ duration: 3, trim: { in: 0, out: 3 }, properties: { name: 'b.mp4', videoUrl: objectUrl } })] })],
    });

    const saved = await saveProject({ projectId: 'proj_balance', name: 'Balance', state, runtime, skipGarbageCollection: true });
    assert.equal(saved.ok, true);

    const loaded = await loadProject({ projectId: 'proj_balance', name: 'Balance', fallbackState: state, runtime });
    assert.ok(loaded.state.tracks[0].clips[0].properties.videoUrl, 'a handle was minted on load');
    assert.ok(runtime.registry.trackedUrlCount() > 0, 'the minted handle must be tracked');

    const released = await releaseProjectMediaHandles();
    assert.ok(released >= 1, `expected handles to be released, got ${released}`);
    assert.equal(runtime.registry.trackedUrlCount(), 0, 'no handle may remain tracked after close');
  } finally {
    clearRuntime();
  }
});

await test('the registry is the only minting site: releasing twice is a no-op, not a crash', async () => {
  const urlEnvironment = createInstrumentedUrlEnvironment();
  const { runtime } = await createTestRuntime({ urlEnvironment });
  const blob = makeBlob('x');
  const assetId = await runtime.registry.put(blob, {
    kind: 'video', mimeType: 'video/mp4', name: 'x.mp4', duration: 1, source: { type: 'file', fileName: 'x.mp4' },
  });

  const url = await runtime.registry.resolveUrl(assetId);
  assert.equal(runtime.registry.trackedUrlCount(), 1);
  runtime.registry.releaseUrl(assetId, url);
  assert.equal(runtime.registry.trackedUrlCount(), 0);
  // Releasing again must not double-revoke (the instrumented env would throw).
  runtime.registry.releaseUrl(assetId, url);
  assert.equal(runtime.registry.trackedUrlCount(), 0);
});

await test('releaseAll revokes every tracked handle on project close', async () => {
  const urlEnvironment = createInstrumentedUrlEnvironment();
  const { runtime } = await createTestRuntime({ urlEnvironment });
  const assetId = await runtime.registry.put(makeBlob('y'), {
    kind: 'audio', mimeType: 'audio/mpeg', name: 'y.mp3', duration: 2, source: { type: 'file', fileName: 'y.mp3' },
  });
  await runtime.registry.resolveUrl(assetId);
  await runtime.registry.resolveUrl(assetId);
  assert.equal(runtime.registry.trackedUrlCount(), 2);
  const released = runtime.registry.releaseAll();
  assert.equal(released, 2);
  assert.equal(urlEnvironment.stats().live, 0, 'no live object URL may survive close');
});

await test('a missing asset is reported, keeps the clip, and does not fake success', async () => {
  const { runtime } = await createTestRuntime();
  const state = await makeProject({
    tracks: [
      makeTrack({
        clips: [
          makeClip({
            id: 'ghost',
            duration: 4,
            trim: { in: 0, out: 4 },
            properties: { name: 'gone.mp4', videoAssetId: 'as_00000000-0000-4000-8000-000000000000' },
          }),
        ],
      }),
    ],
  });

  const saved = await saveProject({ projectId: 'proj_ghost', name: 'Ghost', state, runtime, skipGarbageCollection: true });
  assert.equal(saved.ok, true, 'the document is still valid; the warning carries the problem');
  assert.equal(saved.warnings.length, 1);
  assert.equal(saved.warnings[0].reason, 'ASSET_MISSING');

  const loaded = await loadProject({ projectId: 'proj_ghost', name: 'Ghost', fallbackState: state, runtime });
  assert.equal(loaded.warnings.length, 1, 'reload must still report the missing media');
  assert.equal(loaded.warnings[0].reason, 'ASSET_MISSING');
  assert.equal(loaded.state.tracks[0].clips[0].properties.mediaMissing, true);

  // The clip and its timing survive: losing the media must not lose the edit.
  assert.equal(loaded.state.tracks[0].clips.length, 1);
  assert.equal(loaded.state.totalDuration, 4);
});

await test('relink restores a missing clip and re-derives duration from the new asset', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);
  try {
    const missing = await makeProject({
      tracks: [
        makeTrack({
          clips: [
            makeClip({
              id: 'broken',
              duration: 4,
              trim: { in: 0, out: 4 },
              properties: { name: 'lost.mp4', mediaUnresolved: true, mediaUnresolvedReason: 'TRANSIENT_URL_UNRESOLVED' },
            }),
          ],
        }),
      ],
    });

    // A registry whose probe reports a real duration, as a browser would measure.
    const originalProbe = runtime.registry.probeFrom.bind(runtime.registry);
    runtime.registry.probeFrom = async (blob, mime) => ({
      ...(await originalProbe(blob, mime)),
      duration: 12.345,
    });

    const result = await relinkClipMedia({
      clipIds: ['broken'],
      file: makeFile('restored.mp4', 'restored-bytes'),
      fileName: 'restored.mp4',
      mimeType: 'video/mp4',
      tracks: missing.tracks,
      runtime,
    });

    const clip = result.tracks[0].clips[0];
    assert.match(clip.properties.videoAssetId, /^as_/);
    assert.equal(clip.properties.mediaUnresolved, undefined, 'the unresolved marker must be cleared');
    assert.equal(clip.properties.mediaMissing, undefined);
    assert.equal(clip.duration, 12.345, 'duration must come from the measured asset');
    assert.deepEqual(clip.trim, { in: 0, out: 12.345 });
    assert.equal(result.record.duration, 12.345);
  } finally {
    clearRuntime();
  }
});

await test('serializeProjectDocument strips runtime-only keys but keeps durable markers', async () => {
  const state = await makeProject({
    tracks: [
      makeTrack({
        clips: [
          makeClip({
            properties: {
              name: 'mixed',
              videoUrl: 'https://cdn.example.test/a.mp4',
              mediaMissing: true,
              mediaMissingReason: 'ASSET_MISSING',
              mediaUnresolved: true,
              mediaUnresolvedReason: 'ASSET_MISSING',
              mediaOriginalName: 'original.mp4',
              mediaResolvedAt: 12345,
            },
          }),
        ],
      }),
    ],
  });

  const document = serializeProjectDocument({
    projectId: 'p', name: 'n', state, assets: [], settings: {}, exports: [],
  });
  const properties = document.project.tracks[0].clips[0].properties;
  assert.equal(properties.mediaMissing, undefined, 'runtime flag must not be persisted');
  assert.equal(properties.mediaResolvedAt, undefined);
  assert.equal(properties.mediaUnresolved, true, 'the durable marker must survive');
  assert.equal(properties.mediaOriginalName, 'original.mp4');
  assert.equal(properties.videoUrl, 'https://cdn.example.test/a.mp4');
});

report('PERSISTENCE_MEDIA_IDENTITY');
