/**
 * The single choke point to Gemini — ADR-005 / ADR-008.
 *
 * Everything the model sees is built here from `server/config/models.ts` plus the
 * templates in `server/prompts/`. Every call is bounded (timeout), cancellable
 * (abort), counted (structured log line) and validated on the way out
 * (`502 AI_RESPONSE_INVALID`). A failure is **never** converted into content.
 */
import { appError } from '../errors';
import type { AppError } from '../errors';
import { AI_MODELS, ALLOWED_CHANNEL_COUNTS, ALLOWED_SAMPLE_RATES } from '../config/models';
import type { AiOperationId } from '../config/models';
import { ConcurrencyGuard } from '../middleware/rateLimit';
import type { ServerLogger } from '../middleware/requestContext';
import { parseWith } from '../schemas/schema';
import {
  CAPTION_BLOCK_SCHEMA,
  SCRIPT_RESULT_SCHEMA,
  SPEECH_RESULT_SCHEMA,
} from '../schemas/operations';
import type {
  CaptionBlockInput,
  CaptionsGenerateRequest,
  CaptionsRefineRequest,
  ScriptRequest,
  ScriptResult,
  SpeechRequest,
  SpeechResult,
} from '../schemas/operations';
import { arr } from '../schemas/schema';
import { buildScriptContents, buildScriptSystemInstruction } from '../prompts/script';
import { buildSpeechConfig, buildSpeechContents } from '../prompts/speech';
import {
  CAPTION_SYSTEM_INSTRUCTION,
  REFINE_SYSTEM_INSTRUCTION,
  buildCaptionGenerationContents,
  buildCaptionRefinementContents,
} from '../prompts/captions';

export interface GeminiTransportResponse {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export interface GeminiTransport {
  generateContent(params: {
    model: string;
    contents: string;
    config: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<GeminiTransportResponse>;
}

/** Real transport. `@google/genai` is only constructed once, lazily. */
export function createGeminiTransport(apiKey: string): GeminiTransport {
  let clientPromise: Promise<{ models: { generateContent: (p: unknown) => Promise<unknown> } }> | null = null;

  const client = async () => {
    if (!clientPromise) {
      clientPromise = import('@google/genai').then(({ GoogleGenAI }) => {
        const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'neural-pro-server' } } });
        return ai as unknown as { models: { generateContent: (p: unknown) => Promise<unknown> } };
      });
    }
    return clientPromise;
  };

  return {
    async generateContent({ model, contents, config, signal }) {
      const ai = await client();
      return (await ai.models.generateContent({
        model,
        contents,
        config: { ...config, abortSignal: signal },
      })) as GeminiTransportResponse;
    },
  };
}

export interface AiClientOptions {
  readonly apiKey: string | undefined;
  readonly transport?: GeminiTransport;
  readonly logger: ServerLogger;
  readonly concurrency: ConcurrencyGuard;
  readonly now?: () => number;
}

export interface AiCallContext {
  readonly requestId: string;
  readonly tokenId: string;
  readonly signal?: AbortSignal;
}

function combineSignals(caller: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; timedOut: () => boolean } {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(new Error('upstream-timeout')), timeoutMs);
  if (timer && typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  if (caller) {
    if (caller.aborted) timeoutController.abort(caller.reason);
    else caller.addEventListener('abort', () => timeoutController.abort(caller.reason), { once: true });
  }
  return { signal: timeoutController.signal, timedOut: () => timeoutController.signal.aborted && !(caller?.aborted ?? false) };
}

function mapUpstreamError(error: unknown, operation: AiOperationId): AppError {
  const anyError = error as { status?: number; code?: number; name?: string; message?: string };
  const message = String(anyError?.message ?? error ?? '');
  const status = anyError?.status ?? anyError?.code;

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)) {
    return appError({
      code: 'AI_RATE_LIMITED',
      message: 'The AI service is rate limiting requests. Retrying…',
      context: { operation },
    });
  }
  if (status === 400 && /SAFETY|blocked|prohibited/i.test(message)) {
    return appError({
      code: 'AI_SAFETY_BLOCKED',
      message: 'The AI service refused this request because of its content policy.',
      detail: message.slice(0, 300),
      context: { operation },
    });
  }
  if (status === 504 || /DEADLINE_EXCEEDED|timeout/i.test(message)) {
    return appError({ code: 'AI_TIMEOUT', message: 'The AI service took too long to respond.', context: { operation } });
  }
  return appError({
    code: 'AI_UPSTREAM_ERROR',
    message: 'The AI service could not complete this request.',
    detail: message.slice(0, 300),
    context: { operation },
  });
}

/** Parses the declared PCM parameters out of a TTS mime type. */
export function parsePcmMimeType(mimeType: string): { sampleRate: number; channels: number } | null {
  const rateMatch = /rate=(\d+)/i.exec(mimeType);
  const channelMatch = /channels?=(\d+)/i.exec(mimeType);
  const sampleRate = rateMatch?.[1] ? Number.parseInt(rateMatch[1], 10) : Number.NaN;
  if (!Number.isFinite(sampleRate)) return null;
  const channels = channelMatch?.[1] ? Number.parseInt(channelMatch[1], 10) : 1;
  return { sampleRate, channels };
}

/** True when every PCM16 sample is zero — a fabricated "silent" success. */
export function isSilentPcm16(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== 0) return false;
  }
  return true;
}

export interface AiClient {
  readonly configured: boolean;
  script(request: ScriptRequest, ctx: AiCallContext): Promise<ScriptResult>;
  speech(request: SpeechRequest, ctx: AiCallContext): Promise<SpeechResult>;
  captionsGenerate(request: CaptionsGenerateRequest, ctx: AiCallContext): Promise<CaptionBlockInput[]>;
  captionsRefine(request: CaptionsRefineRequest, ctx: AiCallContext): Promise<CaptionBlockInput[]>;
}

export function createAiClient(options: AiClientOptions): AiClient {
  const now = options.now ?? Date.now;
  const transport = options.transport ?? (options.apiKey ? createGeminiTransport(options.apiKey) : undefined);

  const notConfigured = (operation: AiOperationId): AppError =>
    appError({
      code: 'AI_NOT_CONFIGURED',
      message: 'AI features are not configured on this server.',
      context: { operation },
    });

  async function call<T>(params: {
    operation: AiOperationId;
    contents: string;
    config: Record<string, unknown>;
    ctx: AiCallContext;
    validate: (response: GeminiTransportResponse) => T;
  }): Promise<T> {
    const binding = AI_MODELS[params.operation];
    if (!options.apiKey || !transport) throw notConfigured(params.operation);

    const tokenKey = params.ctx.tokenId || 'anonymous';
    if (!options.concurrency.tryAcquire(tokenKey)) {
      throw appError({
        code: 'RATE_LIMITED',
        message: 'This session already has the maximum number of AI requests in flight.',
        context: { operation: params.operation },
      });
    }

    const startedAt = now();
    const { signal, timedOut } = combineSignals(params.ctx.signal, binding.timeoutMs);
    let status: 'ok' | 'error' = 'ok';
    let errorCode: string | undefined;

    try {
      const response = await transport.generateContent({
        model: binding.id,
        contents: params.contents,
        config: params.config,
        signal,
      });
      return params.validate(response);
    } catch (error) {
      status = 'error';
      let mapped: AppError;
      if (signal.aborted) {
        mapped = timedOut()
          ? appError({
              code: 'AI_TIMEOUT',
              message: 'The AI service took too long to respond.',
              context: { operation: params.operation },
            })
          : appError({
              code: 'CANCELLED',
              message: 'The request was cancelled.',
              retryable: false,
              context: { operation: params.operation },
            });
      } else if (isAppErrorShape(error)) {
        mapped = error as AppError;
      } else {
        mapped = mapUpstreamError(error, params.operation);
      }
      errorCode = mapped.code;
      throw mapped;
    } finally {
      options.concurrency.release(tokenKey);
      options.logger.info('ai.call', {
        requestId: params.ctx.requestId,
        operation: params.operation,
        model: binding.id,
        status,
        errorCode,
        durationMs: now() - startedAt,
        timeoutMs: binding.timeoutMs,
      });
    }
  }

  function jsonFrom(response: GeminiTransportResponse, operation: AiOperationId): unknown {
    if (response.promptFeedback?.blockReason) {
      throw appError({
        code: 'AI_SAFETY_BLOCKED',
        message: 'The AI service refused this request because of its content policy.',
        detail: response.promptFeedback.blockReason,
        context: { operation },
      });
    }
    const text = response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || text.trim().length === 0) {
      throw appError({
        code: 'AI_RESPONSE_INVALID',
        message: 'The AI service returned an unexpected response.',
        detail: 'empty response text',
        context: { operation },
      });
    }
    try {
      return JSON.parse(text.replace(/[\r\n\t]+/g, ' '));
    } catch {
      throw appError({
        code: 'AI_RESPONSE_INVALID',
        message: 'The AI service returned an unexpected response.',
        detail: 'response was not valid JSON',
        context: { operation },
      });
    }
  }

  function invalid(operation: AiOperationId, detail: string): AppError {
    return appError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The AI service returned an unexpected response.',
      detail,
      context: { operation },
    });
  }

  return {
    configured: Boolean(options.apiKey && transport),

    script: (request, ctx) =>
      call<ScriptResult>({
        operation: 'script',
        contents: buildScriptContents(request),
        config: {
          systemInstruction: buildScriptSystemInstruction(request),
          responseMimeType: 'application/json',
          maxOutputTokens: AI_MODELS.script.maxOutputTokens,
          responseSchema: {
            type: 'OBJECT',
            properties: {
              metadata: {
                type: 'OBJECT',
                properties: {
                  title: { type: 'STRING' },
                  level: { type: 'STRING' },
                  estimated_duration: { type: 'STRING' },
                  youtube_hook: { type: 'STRING' },
                },
              },
              script: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    speaker: { type: 'STRING' },
                    emotion: { type: 'STRING' },
                    text: { type: 'STRING' },
                  },
                },
              },
            },
          },
        },
        ctx,
        validate: (response) => {
          const parsed = jsonFrom(response, 'script');
          const result = parseWith(SCRIPT_RESULT_SCHEMA, parsed);
          if (!result.ok) throw invalid('script', `schema mismatch: ${result.issues[0]?.path ?? 'root'}`);
          return result.value;
        },
      }),

    speech: (request, ctx) =>
      call<SpeechResult>({
        operation: 'speech',
        contents: buildSpeechContents(request),
        config: {
          systemInstruction: 'You are a professional voice performer. Follow the delivery direction exactly.',
          ...buildSpeechConfig(request),
        },
        ctx,
        validate: (response) => {
          const part = response.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData?.data);
          const inline = part?.inlineData;
          if (!inline?.data) throw invalid('speech', 'no inline audio data in response');

          const mimeType = inline.mimeType ?? '';
          const declared = parsePcmMimeType(mimeType);
          if (!declared) throw invalid('speech', `mime type does not declare a sample rate: ${mimeType}`);
          if (!ALLOWED_SAMPLE_RATES.includes(declared.sampleRate)) {
            throw invalid('speech', `sample rate ${declared.sampleRate} is not in the allowed set`);
          }
          if (!ALLOWED_CHANNEL_COUNTS.includes(declared.channels)) {
            throw invalid('speech', `channel count ${declared.channels} is not in the allowed set`);
          }

          const buffer = Buffer.from(inline.data, 'base64');
          if (buffer.length < 1_024) throw invalid('speech', 'audio payload is too short to be speech');
          if (isSilentPcm16(buffer)) throw invalid('speech', 'audio payload is silent');

          const bytesPerSecond = declared.sampleRate * declared.channels * 2;
          const durationSeconds = buffer.length / bytesPerSecond;
          if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            throw invalid('speech', 'audio duration could not be derived');
          }

          return {
            audio: {
              mimeType,
              base64: inline.data,
              sampleRate: declared.sampleRate,
              channels: declared.channels,
              durationSeconds: Number(durationSeconds.toFixed(3)),
            },
          };
        },
      }),

    captionsGenerate: (request, ctx) =>
      call<CaptionBlockInput[]>({
        operation: 'captions',
        contents: buildCaptionGenerationContents(request),
        config: {
          systemInstruction: CAPTION_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          maxOutputTokens: AI_MODELS.captions.maxOutputTokens,
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                start_time: { type: 'STRING' },
                end_time: { type: 'STRING' },
                text: { type: 'STRING' },
                speaker: { type: 'STRING' },
                words: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      word: { type: 'STRING' },
                      start: { type: 'NUMBER' },
                      end: { type: 'NUMBER' },
                    },
                    required: ['word', 'start', 'end'],
                  },
                },
              },
              required: ['id', 'start_time', 'end_time', 'text'],
            },
          },
        },
        ctx,
        validate: (response) => {
          const parsed = jsonFrom(response, 'captions');
          const result = parseWith(arr(CAPTION_BLOCK_SCHEMA, { minLength: 1, maxLength: 10_000 }), parsed);
          if (!result.ok) throw invalid('captions', `schema mismatch: ${result.issues[0]?.path ?? 'root'}`);
          return result.value;
        },
      }),

    captionsRefine: (request, ctx) =>
      call<CaptionBlockInput[]>({
        operation: 'captions',
        contents: buildCaptionRefinementContents({
          captionsJson: JSON.stringify(request.captions),
          grammarPrompt: request.grammarPrompt ?? '',
          restorePunctuation: request.restorePunctuation ?? true,
        }),
        config: {
          systemInstruction: REFINE_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          maxOutputTokens: AI_MODELS.captions.maxOutputTokens,
        },
        ctx,
        validate: (response) => {
          const parsed = jsonFrom(response, 'captions');
          const result = parseWith(arr(CAPTION_BLOCK_SCHEMA, { minLength: 1, maxLength: 10_000 }), parsed);
          if (!result.ok) throw invalid('captions', `schema mismatch: ${result.issues[0]?.path ?? 'root'}`);
          return result.value;
        },
      }),
  };
}

function isAppErrorShape(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { retryable?: unknown }).retryable === 'boolean'
  );
}
