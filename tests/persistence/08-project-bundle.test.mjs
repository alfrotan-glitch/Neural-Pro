/**
 * Portable `.neuralpro` project bundle (WP-05, persistence-architecture §9 gap 1).
 *
 * The bundle is the durability path that does not depend on the browser profile:
 * when IndexedDB is denied, partitioned or evicted, this file is the copy that
 * survives. These tests exercise the real writer/reader and the real import path
 * against a completely empty second profile, which is the scenario that matters:
 * a bundle that only restores into the profile that created it would be useless.
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
import {
  exportProjectBundleFile,
  importMediaFile,
  importProjectBundleFile,
  loadProject,
  registerGeneratedMedia,
  saveProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import {
  BUNDLE_ASSET_PREFIX,
  BUNDLE_MANIFEST_ENTRY,
  BUNDLE_VERSION,
  createZip,
  crc32,
  exportProjectBundle,
  importProjectBundle,
  readZip,
} from '../../src/infra/persistence/projectBundle.ts';
import { checksumOf } from '../../src/infra/persistence/integrity.ts';

suite('project-bundle');

const VIDEO_BYTES = 'video-payload-bytes-0001';
const AUDIO_BYTES = 'audio-payload-bytes-0002';

/** Builds a real saved project: two tracks, two durable assets, one document. */
async function seedProject(runtimeOptions = {}) {
  const created = await createTestRuntime(runtimeOptions);
  installRuntime(created.runtime);

  const video = await importMediaFile({
    file: makeFile('intro.mp4', VIDEO_BYTES),
    runtime: created.runtime,
  });
  const audio = await registerGeneratedMedia({
    blob: makeBlob(AUDIO_BYTES, 'audio/wav'),
    fileName: 'voice.wav',
    mimeType: 'audio/wav',
    producer: 'bundle-test',
    runtime: created.runtime,
  });

  const state = await makeProject({
    tracks: [
      makeTrack({
        id: 'track_video',
        clips: [
          makeClip({
            id: 'c-video',
            duration: 4,
            trim: { in: 0, out: 4 },
            properties: { name: 'intro.mp4', mediaOriginalName: 'intro.mp4', videoAssetId: video.assetId },
          }),
        ],
      }),
      makeTrack({
        id: 'track_audio',
        type: 'audio',
        clips: [
          makeClip({
            id: 'c-audio',
            duration: 3,
            trim: { in: 0, out: 3 },
            properties: { name: 'voice.wav', mediaOriginalName: 'voice.wav', audioAssetId: audio.assetId },
          }),
        ],
      }),
    ],
  });

  const saved = await saveProject({
    projectId: state.projectId,
    name: 'Bundle Project',
    state,
    settings: { export: { resolution: '1080p', fps: 30 } },
    exports: [],
  });
  assert.equal(saved.ok, true, `seed save must succeed: ${saved.error?.message}`);

  return { ...created, saved, state, video, audio };
}

/** Re-packs a bundle with a mutated manifest (CRCs recomputed, so ZIP is valid). */
async function rewriteBundle(blob, mutate) {
  const entries = readZip(new Uint8Array(await blob.arrayBuffer()));
  const manifestEntry = entries.find((entry) => entry.name === BUNDLE_MANIFEST_ENTRY);
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data));
  await mutate(manifest);
  const repacked = entries.map((entry) =>
    entry.name === BUNDLE_MANIFEST_ENTRY
      ? { name: entry.name, data: new TextEncoder().encode(JSON.stringify(manifest)) }
      : entry,
  );
  return new Blob([createZip(repacked)], { type: 'application/zip' });
}

/* ------------------------------------------------------------------ writer */

await test('zip writer: CRC-32 matches the known-answer vector and entries round-trip', async () => {
  // The canonical CRC-32 check value for "123456789" is 0xCBF43926.
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const entries = [
    { name: 'manifest.json', data: new TextEncoder().encode('{"a":1}') },
    { name: 'assets/as_deep-name.mp4', data: new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]) },
  ];
  const restored = readZip(createZip(entries));
  assert.equal(restored.length, 2);
  assert.equal(restored[0].name, 'manifest.json');
  assert.equal(new TextDecoder().decode(restored[0].data), '{"a":1}');
  assert.equal(restored[1].name, 'assets/as_deep-name.mp4');
  assert.deepEqual([...restored[1].data], [...entries[1].data]);
});

await test('zip writer: a single flipped byte fails the CRC check (BUNDLE_CORRUPT)', async () => {
  const name = 'payload.bin';
  const zip = createZip([{ name: name, data: new TextEncoder().encode('0123456789abcdef') }]);
  const tampered = Uint8Array.from(zip);
  // Local header is 30 bytes + the name, so this is the first byte of the payload.
  // (A flipped byte in the NAME is not CRC-covered — ZIP never checksums names —
  // which is why import matches entry names against the manifest.)
  const firstDataByte = 30 + name.length;
  tampered[firstDataByte] = tampered[firstDataByte] ^ 0xff;
  await assert.rejects(() => Promise.resolve().then(() => readZip(tampered)), (error) => {
    assert.equal(error.code, 'BUNDLE_CORRUPT');
    return true;
  });
});

await test('zip reader: arbitrary bytes and a manifest-less archive are both refused', async () => {
  await assert.rejects(
    () => Promise.resolve().then(() => readZip(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))),
    (error) => {
      assert.equal(error.code, 'BUNDLE_CORRUPT');
      return true;
    },
  );
  const withoutManifest = new Blob([createZip([{ name: 'assets/as_x', data: new TextEncoder().encode('x') }])]);
  await assert.rejects(
    () => importProjectBundle({ blob: withoutManifest, registry: null, documents: null }),
    (error) => {
      assert.equal(error.code, 'BUNDLE_CORRUPT');
      assert.match(error.message, /manifest/i);
      return true;
    },
  );
});

/* ------------------------------------------------------------------ export */

await test('export produces one entry per referenced asset plus the manifest', async () => {
  const seeded = await seedProject();
  try {
    const bundle = await exportProjectBundleFile({ projectId: seeded.saved.projectId });
    assert.equal(bundle.ok, true);
    assert.equal(bundle.assetCount, 2);
    assert.deepEqual(bundle.missingAssets, []);
    assert.equal(bundle.fileName.endsWith('.neuralpro'), true);

    const entries = readZip(new Uint8Array(await bundle.blob.arrayBuffer()));
    const names = entries.map((entry) => entry.name).sort();
    assert.deepEqual(
      names,
      [BUNDLE_MANIFEST_ENTRY, `${BUNDLE_ASSET_PREFIX}${seeded.video.assetId}`, `${BUNDLE_ASSET_PREFIX}${seeded.audio.assetId}`].sort(),
    );

    const manifest = JSON.parse(
      new TextDecoder().decode(entries.find((entry) => entry.name === BUNDLE_MANIFEST_ENTRY).data),
    );
    assert.equal(manifest.bundleVersion, BUNDLE_VERSION);
    assert.equal(manifest.projectId, seeded.saved.projectId);
    assert.equal(manifest.documentChecksum, (await checksumOf(manifest.document)).checksum);
    assert.equal(manifest.document.project.tracks[0].clips[0].properties.videoAssetId, seeded.video.assetId);
  } finally {
    await seeded.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('export is byte-deterministic for the same project state (R5)', async () => {
  const seeded = await seedProject();
  try {
    const first = await exportProjectBundle({
      projectId: seeded.saved.projectId,
      registry: seeded.runtime.registry,
      documents: seeded.runtime.documents,
      now: () => 1_700_000_000_000,
    });
    const second = await exportProjectBundle({
      projectId: seeded.saved.projectId,
      registry: seeded.runtime.registry,
      documents: seeded.runtime.documents,
      now: () => 1_700_000_000_000,
    });
    const a = new Uint8Array(await first.blob.arrayBuffer());
    const b = new Uint8Array(await second.blob.arrayBuffer());
    assert.equal(a.length, b.length);
    assert.deepEqual([...a], [...b], 'two exports of the same state must be identical bytes');
  } finally {
    await seeded.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('export refuses to invent a project that was never saved', async () => {
  const seeded = await seedProject();
  try {
    await assert.rejects(
      () =>
        exportProjectBundle({
          projectId: 'proj_does_not_exist',
          registry: seeded.runtime.registry,
          documents: seeded.runtime.documents,
        }),
      (error) => {
        assert.equal(error.code, 'PERSISTENCE_CORRUPT');
        return true;
      },
    );
  } finally {
    clearRuntime();
  }
});

/* ------------------------------------------------------------------ import */

await test('round trip: an EMPTY profile restores identity, order, durations and bytes', async () => {
  const source = await seedProject();
  let target = null;
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });
    assert.equal(bundle.ok, true);

    // A brand-new profile: no document, no asset bytes at all.
    target = await createTestRuntime();
    installRuntime(target.runtime);
    const empty = await target.registry.list();
    assert.deepEqual(empty, [], 'the target profile must start empty');

    const fallback = await makeProject({ tracks: [] });
    const result = await importProjectBundleFile({ file: bundle.blob, fallbackState: fallback });

    assert.equal(result.ok, true, `import must succeed: ${result.error?.message}`);
    assert.equal(result.projectId, source.saved.projectId);
    assert.equal(result.name, 'Bundle Project');
    assert.deepEqual(result.restoredAssets.slice().sort(), [source.video.assetId, source.audio.assetId].sort());
    assert.deepEqual(result.missingAssets, []);

    // The document is durable in the new profile.
    const loaded = await target.runtime.documents.load(source.saved.projectId);
    assert.equal(loaded.found, true);
    assert.equal(loaded.document.projectId, source.saved.projectId);

    // Identity and order survive verbatim.
    const restoredTracks = loaded.document.project.tracks;
    assert.deepEqual(restoredTracks.map((track) => track.id), ['track_video', 'track_audio']);
    assert.equal(restoredTracks[0].clips[0].properties.videoAssetId, source.video.assetId);
    assert.equal(restoredTracks[1].clips[0].properties.audioAssetId, source.audio.assetId);
    assert.equal(restoredTracks[0].clips[0].duration, 4);
    assert.equal(restoredTracks[1].clips[0].duration, 3);
    assert.equal(loaded.document.project.totalDuration, source.state.totalDuration);

    // The bytes are the same bytes, under the same ids.
    const videoBytes = await target.runtime.registry.get(source.video.assetId);
    assert.equal(await videoBytes.text(), VIDEO_BYTES);
    const audioBytes = await target.runtime.registry.get(source.audio.assetId);
    assert.equal(await audioBytes.text(), AUDIO_BYTES);

    // The hydrated state plays: the clip got a FRESH handle to the restored bytes.
    const state = result.state;
    const videoUrl = state.tracks[0].clips[0].properties.videoUrl;
    assert.equal(typeof videoUrl, 'string');
    assert.equal(videoUrl.startsWith('blob:'), true);
    assert.equal(await (await fetch(videoUrl)).text(), VIDEO_BYTES);
    assert.notEqual(state.tracks[0].clips[0].properties.mediaMissing, true);

    // And it is a normal open from here on: load again, get the same project.
    const reopened = await loadProject({ projectId: source.saved.projectId, fallbackState: fallback });
    assert.equal(reopened.found, true);
    assert.deepEqual(reopened.warnings, []);
    assert.equal(reopened.state.tracks[0].clips[0].properties.videoAssetId, source.video.assetId);
    assert.equal(reopened.settings.export.resolution, '1080p');
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('import keeps the bundle AssetId even when identical bytes exist under another id', async () => {
  const source = await seedProject();
  let target = null;
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });

    target = await createTestRuntime();
    installRuntime(target.runtime);

    // The user already imported the very same file into this profile separately.
    const duplicate = await importMediaFile({
      file: makeFile('intro.mp4', VIDEO_BYTES),
      runtime: target.runtime,
    });
    assert.notEqual(duplicate.assetId, source.video.assetId);

    const result = await importProjectBundleFile({
      file: bundle.blob,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, true, `import must succeed: ${result.error?.message}`);

    // The document still resolves — the bundle's identity was NOT swapped for the duplicate's.
    const restored = await target.runtime.registry.get(source.video.assetId);
    assert.equal(await restored.text(), VIDEO_BYTES);
    const record = await target.runtime.registry.getRecord(source.video.assetId);
    assert.equal(record.id, source.video.assetId);
    assert.equal(
      result.state.tracks[0].clips[0].properties.videoAssetId,
      source.video.assetId,
      'the clip must reference the AssetId the document was written with',
    );
    assert.notEqual(result.state.tracks[0].clips[0].properties.mediaMissing, true);
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('import re-uses assets already present instead of writing them twice', async () => {
  const source = await seedProject();
  let target = null;
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });

    target = await createTestRuntime();
    installRuntime(target.runtime);

    const first = await importProjectBundleFile({
      file: bundle.blob,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(first.ok, true);
    assert.equal(first.restoredAssets.length, 2);
    assert.equal(first.reusedAssets.length, 0);

    const second = await importProjectBundleFile({
      file: bundle.blob,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(second.ok, true);
    assert.deepEqual(second.restoredAssets, []);
    assert.deepEqual(second.reusedAssets.slice().sort(), [source.video.assetId, source.audio.assetId].sort());
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

/* ------------------------------------------------------------- integrity */

await test('a tampered document fails its checksum and is refused (BUNDLE_CORRUPT)', async () => {
  const source = await seedProject();
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });
    const tampered = await rewriteBundle(bundle.blob, (manifest) => {
      manifest.document.name = 'Renamed Behind Your Back';
      // documentChecksum deliberately NOT refreshed.
    });

    const target = await createTestRuntime();
    installRuntime(target.runtime);
    const result = await importProjectBundleFile({
      file: tampered,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'BUNDLE_CORRUPT');
    assert.equal(result.state, null);
    // Nothing was written: no half-imported project.
    const loaded = await target.runtime.documents.load(source.saved.projectId);
    assert.equal(loaded.found, false);
    target.runtime.registry.releaseAll();
  } finally {
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('reordered clips fail the order fingerprint even with a valid checksum', async () => {
  const source = await seedProject();
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });
    const reordered = await rewriteBundle(bundle.blob, async (manifest) => {
      manifest.document.project.tracks = [...manifest.document.project.tracks].reverse();
      // Make the document self-consistent again; only the fingerprint still disagrees.
      manifest.documentChecksum = (await checksumOf(manifest.document)).checksum;
    });

    const target = await createTestRuntime();
    installRuntime(target.runtime);
    const result = await importProjectBundleFile({
      file: reordered,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PERSISTENCE_CORRUPT');
    const loaded = await target.runtime.documents.load(source.saved.projectId);
    assert.equal(loaded.found, false, 'a reordered bundle must not become a project');
    target.runtime.registry.releaseAll();
  } finally {
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('a swapped asset payload of the same length is caught by the content hash', async () => {
  const source = await seedProject();
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });
    const swapped = await rewriteBundle(bundle.blob, () => {
      /* manifest untouched — the swap happens in the asset entry below */
    });

    // Replace one asset entry with different bytes of the same length, re-zipping so
    // the ZIP CRC stays valid: only the content hash can catch this.
    const entries = readZip(new Uint8Array(await swapped.arrayBuffer()));
    const assetEntry = entries.find((entry) => entry.name === `${BUNDLE_ASSET_PREFIX}${source.video.assetId}`);
    const repacked = createZip(
      entries.map((entry) =>
        entry === assetEntry
          ? { name: entry.name, data: new TextEncoder().encode('X'.repeat(assetEntry.data.length)) }
          : entry,
      ),
    );

    const target = await createTestRuntime();
    installRuntime(target.runtime);
    const result = await importProjectBundleFile({
      file: new Blob([repacked]),
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'BUNDLE_CORRUPT');
    assert.match(result.error.message, /content hash/i);
    target.runtime.registry.releaseAll();
  } finally {
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('a newer bundleVersion is refused, never guessed (R4)', async () => {
  const source = await seedProject();
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });
    const future = await rewriteBundle(bundle.blob, async (manifest) => {
      manifest.bundleVersion = BUNDLE_VERSION + 1;
      manifest.documentChecksum = (await checksumOf(manifest.document)).checksum;
    });

    const target = await createTestRuntime();
    installRuntime(target.runtime);
    const result = await importProjectBundleFile({
      file: future,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PERSISTENCE_UNSUPPORTED_VERSION');
    assert.equal(result.error.details.foundVersion, BUNDLE_VERSION + 1);
    target.runtime.registry.releaseAll();
  } finally {
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('an AssetId that already holds DIFFERENT bytes is a conflict, not an overwrite', async () => {
  const source = await seedProject();
  let target = null;
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });

    target = await createTestRuntime();
    installRuntime(target.runtime);
    // Same identity, different content — the case where overwriting would silently
    // corrupt the project that already owns that AssetId.
    await target.runtime.registry.put(makeBlob('completely-different-bytes', 'video/mp4'), {
      id: source.video.assetId,
      kind: 'video',
      mimeType: 'video/mp4',
      name: 'intro.mp4',
      source: { type: 'file', fileName: 'intro.mp4' },
      preserveIdentity: true,
    });

    const result = await importProjectBundleFile({
      file: bundle.blob,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PERSISTENCE_CONFLICT');
    assert.equal(result.error.details.assetId, source.video.assetId);

    // The pre-existing bytes are untouched.
    const untouched = await target.runtime.registry.get(source.video.assetId);
    assert.equal(await untouched.text(), 'completely-different-bytes');
    const loaded = await target.runtime.documents.load(source.saved.projectId);
    assert.equal(loaded.found, false);
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('a failed document write leaves no half-imported project', async () => {
  const source = await seedProject();
  let target = null;
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });

    // The first backend write is the document save, so this fails exactly there.
    target = await createTestRuntime({
      backendHooks: { failNextWriteWith: new Error('disk on fire') },
      // After a failed import nothing references anything, so the orphan collector
      // is told exactly that instead of being left to guess.
      referenceProvider: async () => new Set(),
    });
    installRuntime(target.runtime);

    const result = await importProjectBundleFile({
      file: bundle.blob,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.state, null);

    const loaded = await target.runtime.documents.load(source.saved.projectId);
    assert.equal(loaded.found, false, 'a failed import must not create a project');
    const listed = await target.runtime.documents.list();
    assert.deepEqual(listed, []);

    // Asset bytes were written first; they are simply unreferenced and reclaimable.
    const orphaned = await target.runtime.registry.orphaned();
    assert.deepEqual(orphaned.slice().sort(), [source.video.assetId, source.audio.assetId].sort());
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

/* ------------------------------------------------------ incomplete bundles */

await test('an asset whose bytes are gone is reported, never silently dropped', async () => {
  const source = await seedProject();
  let target = null;
  try {
    // The user evicted one asset's bytes before exporting.
    await source.runtime.registry.delete(source.audio.assetId);

    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });
    assert.equal(bundle.ok, true, 'a partial bundle is better than none');
    assert.equal(bundle.assetCount, 1);
    assert.deepEqual(bundle.missingAssets, [source.audio.assetId]);
    assert.equal(bundle.warnings.length, 1);
    assert.equal(bundle.warnings[0].assetId, source.audio.assetId);
    assert.equal(bundle.warnings[0].reason, 'ASSET_MISSING');

    target = await createTestRuntime();
    installRuntime(target.runtime);
    const result = await importProjectBundleFile({
      file: bundle.blob,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, true, 'the project itself must still import');
    assert.deepEqual(result.missingAssets, [source.audio.assetId]);

    // The surviving media works; the missing one is flagged for relink, not erased.
    const state = result.state;
    assert.equal(state.tracks[0].clips[0].properties.videoAssetId, source.video.assetId);
    assert.equal(await (await fetch(state.tracks[0].clips[0].properties.videoUrl)).text(), VIDEO_BYTES);
    assert.equal(state.tracks[1].clips[0].properties.mediaMissing, true, 'the clip must stay, marked unresolved');
    assert.equal(state.tracks[1].clips[0].id, 'c-audio');
    assert.equal(result.warnings.some((warning) => warning.assetId === source.audio.assetId), true);
    // The timeline does not collapse: total duration still accounts for both tracks.
    assert.equal(state.totalDuration, source.state.totalDuration);
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('importing under a new name keeps identity but changes the label', async () => {
  const source = await seedProject();
  let target = null;
  try {
    const bundle = await exportProjectBundleFile({ projectId: source.saved.projectId });

    target = await createTestRuntime();
    installRuntime(target.runtime);
    const result = await importProjectBundleFile({
      file: bundle.blob,
      projectName: 'Bundle Project (restored)',
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.name, 'Bundle Project (restored)');

    const listed = await target.runtime.documents.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'Bundle Project (restored)');
    assert.equal(listed[0].projectId, source.saved.projectId);
    assert.equal(result.state.tracks[0].clips[0].properties.videoAssetId, source.video.assetId);
  } finally {
    if (target) target.runtime.registry.releaseAll();
    source.runtime.registry.releaseAll();
    clearRuntime();
  }
});

report('PERSISTENCE_BUNDLE');
