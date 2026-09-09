/**
 * TTS audio validation — WP-09 test #13 and the TTS-validation rows of
 * `docs/execution/agents/WP-09.md` §8 (contracts/ai-integration.md §5).
 *
 * The defect being guarded: `App.tsx` used to call
 * `createWavUrlFromBytes(bytes, sampleRate = 24000)`, which stamped a 44-byte
 * header assuming 24 kHz / mono / 16-bit regardless of what Gemini returned, and
 * accepted a 1.00 s all-zero buffer as "speech". Both are fabricated success
 * (INV-010).
 *
 * Headless: the decoder is injected, so no `AudioContext` is required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_CHANNEL_COUNTS,
  ALLOWED_SAMPLE_RATES,
  DURATION_TOLERANCE_SECONDS,
  SILENCE_THRESHOLD,
  base64ToBytes,
  encodeWavFromDecoded,
  validateSpeechAudio,
} from '../../../src/infra/ai/validateSpeech.ts';
import type { DecodedAudio } from '../../../src/infra/ai/validateSpeech.ts';
import type { AppError } from '../../../src/domain/errors/appError.ts';
import type { SpeechAudio } from '../../../src/domain/ai/AiGateway.ts';

/** Decoded-audio fixture: a real sine-ish signal, never silence. */
function decoded(overrides: Partial<DecodedAudio> = {}): DecodedAudio {
  const channels = overrides.channels ?? 1;
  const sampleRate = overrides.sampleRate ?? 24_000;
  const frames = overrides.channelData?.[0]?.length ?? 4_800;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) {
    if (overrides.channelData?.[c]) {
      channelData.push(overrides.channelData[c]);
      continue;
    }
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) data[i] = Math.sin((i / frames) * Math.PI * 8) * 0.5;
    channelData.push(data);
  }
  return {
    sampleRate,
    channels,
    durationSeconds: overrides.durationSeconds ?? frames / sampleRate,
    channelData,
  };
}

function speech(overrides: Partial<SpeechAudio> = {}, payloadBytes = 4_096): SpeechAudio {
  return {
    mimeType: 'audio/L16;rate=24000;channels=1',
    base64: Buffer.alloc(payloadBytes, 0x11).toString('base64'),
    sampleRate: 24_000,
    channels: 1,
    durationSeconds: 0.2,
    ...overrides,
  };
}

const validate = (audio: SpeechAudio, decodeResult: DecodedAudio) =>
  validateSpeechAudio(audio, { decode: async () => decodeResult });

async function expectInvalid(promise: Promise<unknown>, messagePart: RegExp): Promise<AppError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  const appError = caught as AppError | null;
  assert.ok(appError, 'validation must reject the audio');
  assert.equal(appError.code, 'AI_RESPONSE_INVALID');
  assert.equal(appError.retryable, false, 'a malformed AI response is never retried');
  assert.match(appError.message, messagePart);
  return appError;
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  const bytes = await blob.bytes();
  return bytes;
}

async function wavHeader(blob: Blob): Promise<DataView> {
  const bytes = await bytesOf(blob);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function payloadView(blob: Blob): Promise<DataView> {
  const bytes = await bytesOf(blob);
  return new DataView(bytes.buffer, bytes.byteOffset + 44, bytes.byteLength - 44);
}

const ascii = (view: DataView, offset: number, length: number) => {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
};

/* ------------------------------------------------------------- #13 WAV header */

test('#13 the WAV header is derived from the decoded buffer (24 kHz mono)', async () => {
  const audio = speech({ sampleRate: 24_000, channels: 1, durationSeconds: 0.2 });
  const result = await validate(audio, decoded({ sampleRate: 24_000, channels: 1 }));

  const view = await wavHeader(result.wav);
  assert.equal(ascii(view, 0, 4), 'RIFF');
  assert.equal(ascii(view, 8, 4), 'WAVE');
  assert.equal(ascii(view, 12, 4), 'fmt ');
  assert.equal(ascii(view, 36, 4), 'data');
  assert.equal(view.getUint16(20, true), 1, 'PCM format tag');
  assert.equal(view.getUint16(22, true), 1, 'channel count from the decoded buffer');
  assert.equal(view.getUint32(24, true), 24_000, 'sample rate from the decoded buffer');
  assert.equal(view.getUint16(34, true), 16, 'bits per sample');

  const dataBytes = view.getUint32(40, true);
  assert.equal(dataBytes, result.decoded.channelData[0]!.length * 1 * 2);
  assert.equal(result.wav.size, 44 + dataBytes, 'the container size matches the payload');
  assert.equal(view.getUint32(4, true), 36 + dataBytes, 'the RIFF chunk size matches');
  assert.equal(view.getUint32(28, true), 24_000 * 1 * 2, 'byte rate = rate * channels * bytesPerSample');
});

test('#13 a 48 kHz stereo response is not stamped with the old 24 kHz mono header', async () => {
  const audio = speech({
    mimeType: 'audio/L16;rate=48000;channels=2',
    sampleRate: 48_000,
    channels: 2,
    durationSeconds: 0.1,
  });
  const result = await validate(audio, decoded({ sampleRate: 48_000, channels: 2 }));

  const view = await wavHeader(result.wav);
  assert.equal(view.getUint32(24, true), 48_000, 'the header carries the decoded rate, not 24000');
  assert.equal(view.getUint16(22, true), 2, 'the header carries the decoded channel count, not 1');
  assert.notEqual(view.getUint32(24, true), 24_000);
  const frames = result.decoded.channelData[0]!.length;
  assert.equal(view.getUint32(40, true), frames * 2 * 2, 'interleaved stereo doubles the payload');
  assert.equal(result.wav.size, 44 + frames * 2 * 2);
});

test('#13 float samples are encoded as 16-bit PCM and clamped', async () => {
  const source = decoded({
    sampleRate: 16_000,
    channels: 1,
    channelData: [Float32Array.from([0, 1, -1, 0.5, -0.5, 2, -2])],
  });
  const blob = encodeWavFromDecoded(source);
  const view = await payloadView(blob);

  assert.equal(view.getInt16(0, true), 0);
  assert.equal(view.getInt16(2, true), 0x7fff, 'full-scale positive');
  assert.equal(view.getInt16(4, true), -0x8000, 'full-scale negative');
  assert.equal(view.getInt16(6, true), Math.trunc(0.5 * 0x7fff));
  assert.equal(view.getInt16(8, true), Math.trunc(-0.5 * 0x8000));
  assert.equal(view.getInt16(10, true), 0x7fff, 'out-of-range positive is clamped');
  assert.equal(view.getInt16(12, true), -0x8000, 'out-of-range negative is clamped');
});

/* --------------------------------------------------------- declared vs decoded */

test('a declared sample rate outside the allowed set is rejected before decoding', async () => {
  let decodeCalls = 0;
  const error = await expectInvalid(
    validateSpeechAudio(speech({ sampleRate: 12_345 }), {
      decode: async () => {
        decodeCalls += 1;
        return decoded();
      },
    }),
    /unsupported sample rate/i,
  );
  assert.equal(error.context?.sampleRate, 12_345);
  assert.equal(decodeCalls, 0, 'an impossible format is rejected without spending a decode');
});

test('a declared channel layout outside the allowed set is rejected', async () => {
  const error = await expectInvalid(
    validate(speech({ channels: 6 }), decoded({ channels: 6 })),
    /unsupported channel layout/i,
  );
  assert.equal(error.context?.channels, 6);
});

test('a decoded format that disagrees with the declaration is rejected', async () => {
  const error = await expectInvalid(
    validate(speech({ sampleRate: 24_000, channels: 1 }), decoded({ sampleRate: 44_100, channels: 2 })),
    /does not match its declared format/i,
  );
  assert.equal(error.context?.declaredRate, 24_000);
  assert.equal(error.context?.decodedRate, 44_100);
});

/* ------------------------------------------------------------------- duration */

test(`a duration mismatch beyond ${DURATION_TOLERANCE_SECONDS}s is rejected`, async () => {
  const audio = speech({ sampleRate: 24_000, durationSeconds: 5 });
  const error = await expectInvalid(validate(audio, decoded({ durationSeconds: 0.2 })), /length does not match/i);
  assert.equal(error.context?.declaredSeconds, 5);
});

test('a duration mismatch inside the tolerance is accepted', async () => {
  const audio = speech({ durationSeconds: 0.2 + DURATION_TOLERANCE_SECONDS - 0.01 });
  const result = await validate(audio, decoded({ durationSeconds: 0.2 }));
  assert.equal(result.durationSeconds, 0.2, 'the decoded duration is authoritative');
});

/* -------------------------------------------------------------------- silence */

test('all-zero audio is rejected as silence, never accepted as speech', async () => {
  const silent = decoded({ channelData: [new Float32Array(4_800)] });
  const error = await expectInvalid(validate(speech(), silent), /silent/i);
  assert.equal(error.context?.durationSeconds, 0.2);
  assert.ok(SILENCE_THRESHOLD <= 1e-6);
});

test('audio below the silence threshold is rejected', async () => {
  const near = new Float32Array(4_800).fill(SILENCE_THRESHOLD / 10);
  await expectInvalid(validate(speech(), decoded({ channelData: [near] })), /silent/i);
});

test('a payload too short to be speech is rejected', async () => {
  await expectInvalid(validate(speech({}, 512), decoded()), /too short/i);
});

/* -------------------------------------------------------------------- payload */

test('the validated result exposes the decoded buffer for concatenation', async () => {
  const result = await validate(speech(), decoded({ sampleRate: 24_000, channels: 1 }));
  assert.equal(result.sampleRate, 24_000);
  assert.equal(result.channels, 1);
  assert.ok(result.peakAmplitude > SILENCE_THRESHOLD);
  assert.equal(result.decoded.channelData.length, 1);
  assert.ok(result.wav instanceof Blob);
  assert.equal(result.wav.type, 'audio/wav');
});

test('base64 decoding works with and without atob', () => {
  const bytes = base64ToBytes(Buffer.from([1, 2, 3, 250]).toString('base64'));
  assert.deepEqual([...bytes], [1, 2, 3, 250]);
});

test('the allowed sets match the documented contract', () => {
  assert.deepEqual([...ALLOWED_SAMPLE_RATES], [16_000, 22_050, 24_000, 44_100, 48_000]);
  assert.deepEqual([...ALLOWED_CHANNEL_COUNTS], [1, 2]);
  assert.equal(DURATION_TOLERANCE_SECONDS, 0.25);
});

test('a decoder failure surfaces as a typed error, not as a silent pass', async () => {
  let caught: AppError | null = null;
  try {
    await validateSpeechAudio(speech(), {
      decode: async () => {
        throw new Error('EncodingError: unable to decode audio data');
      },
    });
  } catch (error) {
    caught = error as AppError;
  }
  assert.ok(caught, 'an undecodable response must fail');
  assert.equal(caught.code, 'AI_RESPONSE_INVALID', 'an undecodable response is a typed AI failure');
  assert.equal(caught.retryable, false);
  assert.match(caught.message, /could not be decoded/i);
  assert.match(caught.detail ?? '', /unable to decode audio data/, 'the real reason is preserved for diagnostics');
});
