/**
 * W2 — Text-to-speech (docs/workflows/tts.md).
 *
 * Replaces `App.tsx:generateAudio`, including its inline `while (attempt < 3)`
 * retry loop: retry is now the runtime's bounded, jittered policy, and every
 * chunk is validated (format, duration, silence) before it is accepted.
 */
import { createAppError } from '../../../domain/errors/appError';
import type { AppError } from '../../../domain/errors/appError';
import type { AiGateway, SpeechLine, SpeechRequest } from '../../../domain/ai/AiGateway';
import { encodeWavFromDecoded, validateSpeechAudio } from '../../../infra/ai/validateSpeech';
import type { DecodedAudio, ValidateSpeechDeps } from '../../../infra/ai/validateSpeech';
import { DEFAULT_RECOVERY_POLICY, DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, TIMEOUT_POLICIES } from '../policies';
import type { WorkflowDefinition, WorkflowStepContext } from '../types';

export const TTS_WORKFLOW_VERSION = 1;
export const TTS_CHUNK_LINES = 10;

export interface TtsInput {
  readonly lines: readonly SpeechLine[];
  readonly voiceConfig: SpeechRequest['voiceConfig'];
}

export interface TtsOutput {
  readonly blob: Blob;
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly chunkCount: number;
}

function validateInput(input: unknown): AppError | null {
  const value = input as Partial<TtsInput>;
  if (!Array.isArray(value?.lines) || value.lines.length === 0) {
    return createAppError({ code: 'EMPTY_INPUT', message: 'Generate or import a script before synthesising audio.', retryable: false });
  }
  if (value.lines.some((line) => typeof line.text !== 'string' || line.text.trim().length === 0)) {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'The script contains an empty line.', retryable: false });
  }
  const mode = value.voiceConfig?.mode;
  if (mode !== 'single' && mode !== 'multi') {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'Choose a voice configuration.', retryable: false });
  }
  return null;
}

function chunkLines(lines: readonly SpeechLine[]): SpeechLine[][] {
  const chunks: SpeechLine[][] = [];
  for (let index = 0; index < lines.length; index += TTS_CHUNK_LINES) {
    chunks.push(lines.slice(index, index + TTS_CHUNK_LINES));
  }
  return chunks;
}

async function synthesise(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const gateway = ctx.deps.gateway as AiGateway | undefined;
  if (!gateway) {
    throw createAppError({ code: 'DEPENDENCY_UNAVAILABLE', message: 'The AI gateway is not available.', retryable: false });
  }
  const validate = (ctx.deps.validateSpeech as ValidateSpeechDeps | undefined) ?? {};
  const input = ctx.input as unknown as TtsInput;

  const chunks = chunkLines(input.lines);
  const decodedChunks: DecodedAudio[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    if (ctx.signal.aborted) throw createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false });

    const chunk = chunks[index] ?? [];
    ctx.report(Math.round((index / chunks.length) * 85), `Synthesising part ${index + 1} of ${chunks.length}…`);

    const result = await gateway.speech({ lines: chunk, voiceConfig: input.voiceConfig }, ctx.signal);
    const validated = await validateSpeechAudio(result.audio, validate);

    decodedChunks.push(validated.decoded);
  }

  if (decodedChunks.length === 0) {
    throw createAppError({ code: 'AI_RESPONSE_INVALID', message: 'No audio was generated.', retryable: false });
  }

  ctx.report(85, 'Assembling audio…');
  return { decodedChunks, chunkCount: decodedChunks.length };
}

function concatenate(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const chunks = ctx.input.decodedChunks as DecodedAudio[] | undefined;
  if (!chunks || chunks.length === 0) {
    return Promise.reject(
      createAppError({ code: 'AI_RESPONSE_INVALID', message: 'No audio chunks were produced.', retryable: false }),
    );
  }

  const sampleRate = chunks[0]?.sampleRate ?? 0;
  const channels = chunks[0]?.channels ?? 1;
  if (chunks.some((chunk) => chunk.sampleRate !== sampleRate || chunk.channels !== channels)) {
    return Promise.reject(
      createAppError({
        code: 'AI_RESPONSE_INVALID',
        message: 'The generated audio chunks do not share one format.',
        retryable: false,
      }),
    );
  }

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    const parts = chunks.map((chunk) => chunk.channelData[channel] ?? new Float32Array(0));
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.length;
    }
    channelData.push(merged);
  }

  const durationSeconds = (channelData[0]?.length ?? 0) / sampleRate;
  ctx.report(95, 'Encoding WAV…');
  return Promise.resolve({
    merged: { sampleRate, channels, durationSeconds, channelData },
    chunkCount: chunks.length,
  });
}

async function finalise(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const merged = ctx.input.merged as DecodedAudio | undefined;
  const encode = (ctx.deps.encodeWav as ((decoded: DecodedAudio) => Blob) | undefined) ?? encodeWavFromDecoded;
  if (!merged) {
    throw createAppError({ code: 'AI_RESPONSE_INVALID', message: 'No audio was assembled.', retryable: false });
  }

  const blob = encode(merged);
  if (blob.size <= 44) {
    throw createAppError({ code: 'AI_RESPONSE_INVALID', message: 'The generated audio file is empty.', retryable: false });
  }

  ctx.report(100, 'Audio ready');
  return {
    blob,
    durationSeconds: merged.durationSeconds,
    sampleRate: merged.sampleRate,
    channels: merged.channels,
    chunkCount: ctx.input.chunkCount as number,
  };
}

export function createTtsWorkflow(): WorkflowDefinition {
  return {
    id: 'tts',
    version: TTS_WORKFLOW_VERSION,
    validateInput,
    retryPolicy: DEFAULT_RETRY_POLICY,
    timeoutPolicy: TIMEOUT_POLICIES.tts ?? { runTimeoutMs: 600_000, graceMs: 10_000 },
    recoveryPolicy: DEFAULT_RECOVERY_POLICY,
    maxConcurrent: 1,
    steps: [
      { id: 'synthesise', name: 'Synthesise speech', run: synthesise, checkpoint: true },
      { id: 'concatenate', name: 'Concatenate audio', run: concatenate, retry: NO_RETRY_POLICY },
      { id: 'finalise', name: 'Encode audio', run: finalise, retry: NO_RETRY_POLICY },
    ],
  };
}

