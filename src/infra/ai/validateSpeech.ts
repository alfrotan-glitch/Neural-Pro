/**
 * TTS response validation — contracts/ai-integration.md §5.
 *
 * The WAV header is derived from the **decoded** buffer, never from an assumed
 * 24 kHz / mono / 16-bit template. A response that cannot be decoded, whose
 * declared duration disagrees with the decoded duration, or that decodes to
 * silence is a typed failure — never a "successful" audio file.
 */
import { createAppError, isAppError } from '../../domain/errors/appError';
import type { SpeechAudio } from '../../domain/ai/AiGateway';

export const ALLOWED_SAMPLE_RATES: readonly number[] = [16_000, 22_050, 24_000, 44_100, 48_000];
export const ALLOWED_CHANNEL_COUNTS: readonly number[] = [1, 2];
export const DURATION_TOLERANCE_SECONDS = 0.25;
export const SILENCE_THRESHOLD = 1e-6;

export interface DecodedAudio {
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
  readonly channelData: readonly Float32Array[];
}

export interface ValidateSpeechDeps {
  /** Injected in tests; the browser default uses `AudioContext.decodeAudioData`. */
  readonly decode?: (bytes: Uint8Array, declared: SpeechAudio) => Promise<DecodedAudio>;
}

export interface ValidatedSpeech {
  readonly wav: Blob;
  /** The decoded representation — authoritative for concatenation and headers. */
  readonly decoded: DecodedAudio;
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
  readonly peakAmplitude: number;
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer);
}

async function browserDecode(bytes: Uint8Array): Promise<DecodedAudio> {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctor) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'This browser cannot verify generated audio, so it was rejected.',
      detail: 'AudioContext unavailable',
    });
  }
  const context = new Ctor();
  try {
    const copy = bytes.slice().buffer as ArrayBuffer;
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      const promise = context.decodeAudioData(copy, resolve, reject);
      void promise?.catch?.(reject);
    });
    const channelData: Float32Array[] = [];
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      channelData.push(decoded.getChannelData(channel));
    }
    return {
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      durationSeconds: decoded.duration,
      channelData,
    };
  } finally {
    void context.close?.();
  }
}

/** Builds a WAV container from decoded float samples (16-bit PCM). */
export function encodeWavFromDecoded(decoded: DecodedAudio): Blob {
  const { sampleRate, channels, channelData } = decoded;
  const frameCount = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + frameCount * channels * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * channels * bytesPerSample, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, frameCount * channels * bytesPerSample, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function validateSpeechAudio(
  audio: SpeechAudio,
  deps: ValidateSpeechDeps = {},
): Promise<ValidatedSpeech> {
  if (!ALLOWED_SAMPLE_RATES.includes(audio.sampleRate)) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The generated audio used an unsupported sample rate.',
      context: { sampleRate: audio.sampleRate },
    });
  }
  if (!ALLOWED_CHANNEL_COUNTS.includes(audio.channels)) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The generated audio used an unsupported channel layout.',
      context: { channels: audio.channels },
    });
  }

  const bytes = base64ToBytes(audio.base64);
  if (bytes.length < 1_024) {
    throw createAppError({ code: 'AI_RESPONSE_INVALID', message: 'The generated audio is too short to be speech.' });
  }

  const decode = deps.decode ?? browserDecode;
  let decoded: DecodedAudio;
  try {
    decoded = await decode(bytes, audio);
  } catch (error) {
    if (isAppError(error)) throw error;
    // An undecodable response is a malformed AI response, not an opaque crash:
    // callers only handle typed errors, and the reason must stay diagnosable.
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The generated audio could not be decoded, so it was rejected.',
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  if (decoded.sampleRate !== audio.sampleRate || decoded.channels !== audio.channels) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The generated audio does not match its declared format.',
      context: {
        declaredRate: audio.sampleRate,
        decodedRate: decoded.sampleRate,
        declaredChannels: audio.channels,
        decodedChannels: decoded.channels,
      },
    });
  }
  if (Math.abs(decoded.durationSeconds - audio.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The generated audio length does not match the reported length.',
      context: {
        declaredSeconds: Number(audio.durationSeconds.toFixed(3)),
        decodedSeconds: Number(decoded.durationSeconds.toFixed(3)),
      },
    });
  }

  let peak = 0;
  for (const channel of decoded.channelData) {
    for (let i = 0; i < channel.length; i += 1) {
      const magnitude = Math.abs(channel[i] ?? 0);
      if (magnitude > peak) peak = magnitude;
    }
  }
  if (peak <= SILENCE_THRESHOLD) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The generated audio was silent, so it was rejected.',
      context: { durationSeconds: Number(decoded.durationSeconds.toFixed(3)) },
    });
  }

  return {
    wav: encodeWavFromDecoded(decoded),
    decoded,
    sampleRate: decoded.sampleRate,
    channels: decoded.channels,
    durationSeconds: decoded.durationSeconds,
    peakAmplitude: peak,
  };
}
