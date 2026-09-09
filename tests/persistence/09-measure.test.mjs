/**
 * Measurement authority (WP-05 §8 final row: "`measure()` returns the real
 * duration for a synthetic 12.345 s asset"; contract R3 / ADR-010, INV-011 input).
 *
 * Duration is measured once, from the bytes, and is then authoritative for clip
 * duration, timeline bounds, export frame count and audio render length. These
 * tests build real WAV bytes — including bytes produced by the app's own
 * `audioBufferToWav` — and assert the measured number, with no stubbed probe.
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
  importMediaFile,
  loadProject,
  relinkClipMedia,
  saveProject,
} from '../../src/features/video-studio/project/services/projectPersistenceService.ts';
import { probeContainerAudio } from '../../src/infra/persistence/mediaProbe.ts';
import { audioBufferToWav } from '../../src/features/video-studio/audio/services/audioRenderService.ts';

suite('measure');

/**
 * Canonical PCM WAV builder (same layout as `audioBufferToWav`).
 * Returns raw bytes so a caller can wrap them in whatever container it needs.
 */
function buildWavBytes({ sampleRate, channels, seconds, bitDepth = 16, extraChunks = [] }) {
  const samples = Math.round(seconds * sampleRate);
  const bytesPerSample = bitDepth / 8;
  const dataBytes = samples * channels * bytesPerSample;

  const chunks = [];
  for (const chunk of extraChunks) {
    chunks.push(new TextEncoder().encode(chunk.id));
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, chunk.payload.length, true);
    chunks.push(size, chunk.payload);
    if (chunk.payload.length % 2 === 1) chunks.push(new Uint8Array(1)); // even alignment
  }

  const fmt = new Uint8Array(16);
  const fmtView = new DataView(fmt.buffer);
  fmtView.setUint16(0, 1, true); // PCM
  fmtView.setUint16(2, channels, true);
  fmtView.setUint32(4, sampleRate, true);
  fmtView.setUint32(8, sampleRate * channels * bytesPerSample, true);
  fmtView.setUint16(12, channels * bytesPerSample, true);
  fmtView.setUint16(14, bitDepth, true);

  const dataHeader = new Uint8Array(8);
  const dataView = new DataView(dataHeader.buffer);
  dataView.setUint32(0, 0x61746164, true); // 'data' little-endian
  dataView.setUint32(4, dataBytes, true);

  const bodySize = 4 + (8 + 16) + extraChunks.reduce((total, c) => total + 8 + c.payload.length + (c.payload.length % 2), 0) + dataBytes;
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, 0x46464952, true); // 'RIFF'
  headerView.setUint32(4, bodySize, true);
  headerView.setUint32(8, 0x45564157, true); // 'WAVE'

  const fmtHeader = new Uint8Array(8);
  const fmtHeaderView = new DataView(fmtHeader.buffer);
  fmtHeaderView.setUint32(0, 0x20746d66, true); // 'fmt '
  fmtHeaderView.setUint32(4, 16, true);

  const parts = [header, fmtHeader, fmt, ...chunks, dataHeader, new Uint8Array(dataBytes)];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildWav(options) {
  return new Blob([buildWavBytes(options)], { type: 'audio/wav' });
}

await test('a synthetic 12.345 s WAV measures exactly 12.345 s from its own bytes', async () => {
  const wav = buildWav({ sampleRate: 8000, channels: 1, seconds: 12.345 });
  const probe = await probeContainerAudio(wav);
  assert.ok(probe, 'a canonical PCM WAV must be measurable without a decoder');
  assert.equal(probe.duration, 12.345);
  assert.equal(probe.sampleRate, 8000);
  assert.equal(probe.channels, 1);
});

await test('stereo and non-canonical chunk order measure correctly', async () => {
  // 48000 Hz divides 12.345 s into a whole number of frames (592560), so the
  // measurement must come back exact. 44100 Hz does NOT (544414.5 frames), so a
  // file "of 12.345 s" at that rate is really 12.345011... s — asserting the
  // literal there would be testing the fixture, not the probe.
  const stereo = await probeContainerAudio(buildWav({ sampleRate: 48000, channels: 2, seconds: 12.345 }));
  assert.equal(stereo.duration, 12.345);
  assert.equal(stereo.channels, 2);
  assert.equal(stereo.sampleRate, 48000);

  const oddRate = await probeContainerAudio(buildWav({ sampleRate: 44100, channels: 2, seconds: 12.345 }));
  assert.equal(oddRate.duration, 544415 / 44100, 'duration is samples/sampleRate, exactly');
  assert.ok(Math.abs(oddRate.duration - 12.345) < 1e-4);

  // Metadata chunks may legally precede `data`; a fixed 44-byte read would miss it.
  const withList = await probeContainerAudio(
    buildWav({
      sampleRate: 8000,
      channels: 1,
      seconds: 12.345,
      extraChunks: [{ id: 'LIST', payload: new TextEncoder().encode('INFOISFTNeural-Pro') }],
    }),
  );
  assert.equal(withList.duration, 12.345, 'chunk walking must find `data` past a LIST chunk');
  assert.equal(withList.sampleRate, 8000);
});

await test('WAV bytes written by the app itself measure back to their real duration', async () => {
  // `audioBufferToWav` is the writer behind extracted and podcast audio (D-024).
  const sampleRate = 48000;
  const frames = Math.round(12.345 * sampleRate);
  const buffer = {
    numberOfChannels: 1,
    sampleRate,
    length: frames,
    duration: frames / sampleRate,
    getChannelData: () => new Float32Array(frames),
  };

  const blob = audioBufferToWav(buffer);
  assert.equal(blob.type, 'audio/wav');
  const probe = await probeContainerAudio(blob);
  assert.equal(probe.duration, 12.345);
  assert.equal(probe.sampleRate, 48000);
  assert.equal(probe.channels, 1);
});

await test('bytes that are not a readable container yield durationUnknown, never a guess', async () => {
  for (const [label, blob] of [
    ['random bytes', makeBlob('this is definitely not a RIFF file', 'audio/wav')],
    ['truncated header', new Blob([new Uint8Array(20)], { type: 'audio/wav' })],
    ['empty', new Blob([], { type: 'audio/wav' })],
  ]) {
    const probe = await probeContainerAudio(blob);
    assert.equal(probe, null, `${label} must not produce a measurement`);
  }

  // And the registry surfaces that as "unknown", which the UI must show — not 0.
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);
  try {
    const imported = await importMediaFile({
      file: makeFile('mystery.mp3', 'not really an mp3', 'audio/mpeg'),
      runtime,
    });
    assert.equal(imported.record.duration, null);
    const measured = await runtime.registry.measure(imported.assetId);
    assert.equal(measured.duration, null, 'unmeasurable audio stays durationUnknown');
  } finally {
    await runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('registry.measure() returns the measured 12.345 s and caches it on the record (R3)', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);
  try {
    const wav = buildWavBytes({ sampleRate: 8000, channels: 1, seconds: 12.345 });
    const imported = await importMediaFile({ file: makeFile('voice.wav', wav, 'audio/wav'), runtime });

    assert.equal(imported.record.duration, 12.345, 'measured once, at import');
    assert.equal(imported.record.sampleRate, 8000);
    assert.equal(imported.record.channels, 1);

    const measured = await runtime.registry.measure(imported.assetId);
    assert.equal(measured.duration, 12.345);
    assert.equal(measured.sampleRate, 8000);
    assert.equal(measured.channels, 1);

    // Authoritative forever after: the record is the source, not a re-derivation.
    const record = await runtime.registry.getRecord(imported.assetId);
    assert.equal(record.duration, 12.345);
  } finally {
    await runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('a clip relinked to the synthetic asset takes its duration from the measurement', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);
  try {
    const broken = await makeProject({
      tracks: [
        makeTrack({
          type: 'audio',
          clips: [
            makeClip({
              id: 'podcast',
              duration: 4,
              trim: { in: 0, out: 4 },
              properties: { name: 'lost.wav', mediaUnresolved: true },
            }),
          ],
        }),
      ],
    });

    const wav = buildWavBytes({ sampleRate: 8000, channels: 1, seconds: 12.345 });
    const result = await relinkClipMedia({
      clipIds: ['podcast'],
      file: makeFile('voice.wav', wav),
      fileName: 'voice.wav',
      mimeType: 'audio/wav',
      tracks: broken.tracks,
      runtime,
    });

    const clip = result.tracks[0].clips[0];
    assert.equal(clip.duration, 12.345, 'clip duration must come from the measured asset');
    assert.deepEqual(clip.trim, { in: 0, out: 12.345 });
    assert.equal(result.record.duration, 12.345);
  } finally {
    await runtime.registry.releaseAll();
    clearRuntime();
  }
});

await test('the measured duration survives save → reload unchanged (INV-011 input)', async () => {
  const { runtime } = await createTestRuntime();
  installRuntime(runtime);
  try {
    const wav = buildWavBytes({ sampleRate: 8000, channels: 1, seconds: 12.345 });
    const imported = await importMediaFile({ file: makeFile('voice.wav', wav, 'audio/wav'), runtime });

    const state = await makeProject({
      tracks: [
        makeTrack({
          id: 'track_audio',
          type: 'audio',
          clips: [
            makeClip({
              id: 'podcast',
              duration: 12.345,
              trim: { in: 0, out: 12.345 },
              properties: { name: 'voice.wav', mediaOriginalName: 'voice.wav', audioAssetId: imported.assetId },
            }),
          ],
        }),
      ],
    });
    assert.equal(state.totalDuration, 12.345);

    const saved = await saveProject({ projectId: state.projectId, name: 'Measure Project', state, settings: {}, exports: [] });
    assert.equal(saved.ok, true, saved.error?.message);

    const reloaded = await loadProject({
      projectId: state.projectId,
      fallbackState: await makeProject({ tracks: [] }),
    });
    assert.equal(reloaded.found, true);
    assert.deepEqual(reloaded.warnings, []);

    const clip = reloaded.state.tracks[0].clips[0];
    assert.equal(clip.properties.audioAssetId, imported.assetId);
    assert.equal(clip.duration, 12.345, 'duration must be identical before the save and after the reload');
    assert.equal(reloaded.state.totalDuration, 12.345);

    const record = await runtime.registry.getRecord(imported.assetId);
    assert.equal(record.duration, 12.345, 'the cached measurement is what the timeline reads');
  } finally {
    await runtime.registry.releaseAll();
    clearRuntime();
  }
});

report('PERSISTENCE_MEASURE');
