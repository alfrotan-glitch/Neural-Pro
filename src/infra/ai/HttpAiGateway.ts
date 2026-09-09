/**
 * HTTP implementation of `AiGateway`.
 *
 * Responsibilities: session acquisition, request envelopes, **bounded** calls
 * (every request has its own timeout on top of the caller's abort signal),
 * and normalisation of every failure into a typed `AppError`. It never retries
 * on its own — retry is the workflow runtime's policy decision.
 */
import { createAppError, toAppError } from '../../domain/errors/appError';
import type { AppError } from '../../domain/errors/appError';
import type {
  AiGateway,
  AiHealth,
  CaptionBlock,
  CaptionsExportSrtRequest,
  CaptionsGenerateRequest,
  CaptionsParseSrtRequest,
  CaptionsRefineRequest,
  CaptionsResult,
  ScriptRequest,
  ScriptResult,
  SpeechRequest,
  SpeechResult,
  SrtExportResult,
} from '../../domain/ai/AiGateway';

export interface HttpAiGatewayOptions {
  /** Base path of the API. Same-origin by default (AI Studio serves both). */
  readonly basePath?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly randomId?: () => string;
  /** Per-operation client-side bound; the server enforces its own too. */
  readonly timeoutsMs?: Readonly<Record<string, number>>;
}

interface SuccessEnvelope<T> {
  ok: true;
  requestId: string;
  data: T;
}

interface ErrorEnvelope {
  ok: false;
  requestId: string;
  error: { code: string; message: string; retryable: boolean; detail?: string };
}

const DEFAULT_TIMEOUTS: Record<string, number> = {
  script: 130_000,
  speech: 190_000,
  captions: 70_000,
  health: 10_000,
  session: 10_000,
};

function newRequestId(randomId?: () => string): string {
  if (randomId) return randomId();
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return `cli_${cryptoRef.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  return `cli_${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

function combineSignals(caller: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; timedOut: () => boolean } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('client-timeout')), timeoutMs);
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener('abort', () => controller.abort(caller.reason), { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted && !(caller?.aborted ?? false),
  };
}

export class HttpAiGateway implements AiGateway {
  private readonly basePath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeouts: Record<string, number>;
  private readonly randomId?: () => string;
  private tokenPromise: Promise<string> | null = null;

  constructor(options: HttpAiGatewayOptions = {}) {
    this.basePath = (options.basePath ?? '/api').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...(options.timeoutsMs ?? {}) };
    if (options.randomId) this.randomId = options.randomId;
  }

  /** Drops the cached token (used after a 401 so the next call re-issues one). */
  resetSession(): void {
    this.tokenPromise = null;
  }

  private async sessionToken(signal?: AbortSignal): Promise<string> {
    if (!this.tokenPromise) {
      this.tokenPromise = this.issueSession(signal).catch((error) => {
        this.tokenPromise = null;
        throw error;
      });
    }
    return this.tokenPromise;
  }

  private async issueSession(signal?: AbortSignal): Promise<string> {
    const response = await this.raw('GET', '/session', undefined, this.timeouts.session ?? 10_000, signal, false);
    const token = (response as { token?: string }).token;
    if (typeof token !== 'string' || token.length === 0) {
      throw createAppError({
        code: 'UNAUTHENTICATED',
        message: 'The server did not issue a session. AI operations are unavailable.',
      });
    }
    return token;
  }

  private async raw(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined,
    authenticated: boolean,
    token?: string,
  ): Promise<unknown> {
    const { signal, timedOut } = combineSignals(callerSignal, timeoutMs);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': newRequestId(this.randomId),
    };
    if (authenticated && token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.basePath}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
    } catch (error) {
      if (signal.aborted && timedOut()) {
        throw createAppError({ code: 'TIMEOUT', message: 'The request took too long and was stopped.' });
      }
      if (callerSignal?.aborted) throw toAppError(error);
      throw createAppError({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'The AI service could not be reached.',
        cause: error,
      });
    }

    const text = await response.text();
    let payload: SuccessEnvelope<unknown> | ErrorEnvelope | null = null;
    try {
      payload = text ? (JSON.parse(text) as SuccessEnvelope<unknown> | ErrorEnvelope) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || !payload || payload.ok !== true) {
      const errorPayload = payload && payload.ok === false ? payload.error : undefined;
      throw createAppError({
        code: (errorPayload?.code as AppError['code']) ?? (response.status === 429 ? 'RATE_LIMITED' : 'AI_UPSTREAM_ERROR'),
        message:
          errorPayload?.message ??
          (response.status === 404
            ? 'That AI operation is not available on this server.'
            : 'The AI service could not complete this request.'),
        retryable: errorPayload?.retryable ?? response.status === 429,
        ...(errorPayload?.detail ? { detail: errorPayload.detail } : {}),
        context: { status: response.status, path },
      });
    }

    return payload.data;
  }

  private async call<T>(
    operation: string,
    path: string,
    body: unknown,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const timeoutMs = this.timeouts[operation] ?? 70_000;
    const token = await this.sessionToken(callerSignal);
    try {
      return (await this.raw('POST', path, body, timeoutMs, callerSignal, true, token)) as T;
    } catch (error) {
      // A revoked/expired session is recoverable exactly once.
      if ((error as AppError).code === 'UNAUTHENTICATED') {
        this.resetSession();
        const fresh = await this.sessionToken(callerSignal);
        return (await this.raw('POST', path, body, timeoutMs, callerSignal, true, fresh)) as T;
      }
      throw error;
    }
  }

  script = (request: ScriptRequest, signal?: AbortSignal): Promise<ScriptResult> =>
    this.call<ScriptResult>('script', '/ai/script', request, signal);

  speech = (request: SpeechRequest, signal?: AbortSignal): Promise<SpeechResult> =>
    this.call<SpeechResult>('speech', '/ai/speech', request, signal);

  health = async (signal?: AbortSignal): Promise<AiHealth> => {
    const data = await this.raw('GET', '/health/ai', undefined, this.timeouts.health ?? 10_000, signal, false);
    const health = data as Partial<AiHealth>;
    return {
      configured: health.configured === true,
      operations: Array.isArray(health.operations) ? health.operations : [],
      simulation: health.simulation === true,
    };
  };

  captions = {
    generate: (request: CaptionsGenerateRequest, signal?: AbortSignal): Promise<CaptionsResult> =>
      this.call<CaptionsResult>('captions', '/captions/generate', request, signal),
    refine: (request: CaptionsRefineRequest, signal?: AbortSignal): Promise<CaptionsResult> =>
      this.call<CaptionsResult>('captions', '/captions/refine', request, signal),
    parseSrt: (request: CaptionsParseSrtRequest, signal?: AbortSignal): Promise<CaptionsResult> =>
      this.call<CaptionsResult>('captions', '/captions/parse-srt', request, signal),
    exportSrt: (request: CaptionsExportSrtRequest, signal?: AbortSignal): Promise<SrtExportResult> =>
      this.call<SrtExportResult>('captions', '/captions/export-srt', request, signal),
  };
}

let defaultGateway: AiGateway | null = null;

export function getAiGateway(): AiGateway {
  if (!defaultGateway) defaultGateway = new HttpAiGateway();
  return defaultGateway;
}

export function setAiGateway(gateway: AiGateway): void {
  defaultGateway = gateway;
}

export type { CaptionBlock };
