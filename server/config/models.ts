/**
 * AI model registry — ADR-008.
 *
 * **This file is the only place a model id may appear** (WP-01 acceptance
 * criterion 4, enforced by `tests/server/static-boundary.test.mts`). The client
 * can never select a model, a system instruction, a tool list, a safety setting
 * or a generation parameter: every request is built from this registry plus the
 * server-side prompt templates in `server/prompts/`.
 */

export type AiOperationId = 'script' | 'speech' | 'captions';

export interface ModelBinding {
  /** Gemini model id. Server-owned; overridable only by server environment. */
  readonly id: string;
  /** Server-owned output budget. Never client-supplied. */
  readonly maxOutputTokens?: number;
  /** Hard bound on a single upstream call. */
  readonly timeoutMs: number;
  /** Per-IP requests / minute. */
  readonly ratePerIpPerMinute: number;
  /** Per-session-token requests / minute. */
  readonly ratePerTokenPerMinute: number;
  /** Concurrent upstream calls allowed per token (contracts/ai-integration.md §7). */
  readonly maxConcurrentPerToken: number;
}

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const AI_MODELS: Readonly<Record<AiOperationId, ModelBinding>> = {
  script: {
    id: env('AI_MODEL_SCRIPT', 'gemini-3.1-pro-preview'),
    maxOutputTokens: intEnv('AI_MAX_OUTPUT_TOKENS_SCRIPT', 8192),
    timeoutMs: intEnv('AI_TIMEOUT_MS_SCRIPT', 120_000),
    ratePerIpPerMinute: intEnv('AI_RATE_IP_TEXT', 30),
    ratePerTokenPerMinute: intEnv('AI_RATE_TOKEN_TEXT', 60),
    maxConcurrentPerToken: intEnv('AI_CONCURRENCY_PER_TOKEN', 2),
  },
  speech: {
    id: env('AI_MODEL_SPEECH', 'gemini-2.5-flash-preview-tts'),
    timeoutMs: intEnv('AI_TIMEOUT_MS_SPEECH', 180_000),
    ratePerIpPerMinute: intEnv('AI_RATE_IP_SPEECH', 10),
    ratePerTokenPerMinute: intEnv('AI_RATE_TOKEN_SPEECH', 20),
    maxConcurrentPerToken: intEnv('AI_CONCURRENCY_PER_TOKEN', 2),
  },
  captions: {
    id: env('AI_MODEL_CAPTIONS', 'gemini-3.5-flash'),
    maxOutputTokens: intEnv('AI_MAX_OUTPUT_TOKENS_CAPTIONS', 4096),
    timeoutMs: intEnv('AI_TIMEOUT_MS_CAPTIONS', 60_000),
    ratePerIpPerMinute: intEnv('AI_RATE_IP_TEXT', 30),
    ratePerTokenPerMinute: intEnv('AI_RATE_TOKEN_TEXT', 60),
    maxConcurrentPerToken: intEnv('AI_CONCURRENCY_PER_TOKEN', 2),
  },
};

export const AI_OPERATIONS: readonly AiOperationId[] = ['script', 'speech', 'captions'];

/**
 * Gemini prebuilt TTS voices the server is willing to accept. The client may pick
 * a *voice* (a product choice) but never a model, config or tool.
 */
export const ALLOWED_VOICES: readonly string[] = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

/** Sample rates the TTS contract accepts (contracts/ai-integration.md §5). */
export const ALLOWED_SAMPLE_RATES: readonly number[] = [16_000, 22_050, 24_000, 44_100, 48_000];
export const ALLOWED_CHANNEL_COUNTS: readonly number[] = [1, 2];
