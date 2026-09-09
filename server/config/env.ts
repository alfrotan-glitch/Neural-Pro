/**
 * Server environment contract — `docs/contracts/environment.md`.
 *
 * Secrets are read **only** here. `GEMINI_API_KEY` never leaves the server
 * process: it is not serialised into any response, log line or client bundle.
 */
import crypto from 'crypto';

export interface ServerEnv {
  readonly port: number;
  readonly host: string;
  readonly nodeEnv: 'development' | 'test' | 'production';
  /** Present ⇒ AI operations are enabled. Absent ⇒ 503 AI_NOT_CONFIGURED. */
  readonly geminiApiKey: string | undefined;
  /** HMAC key for session tokens. Ephemeral when not configured (fail closed). */
  readonly sessionSecret: Buffer;
  readonly sessionSecretConfigured: boolean;
  readonly sessionTtlMs: number;
  readonly maxJsonBodyBytes: number;
  readonly trustProxy: boolean;
}

const MAX_JSON_BODY_BYTES = 10 * 1024 * 1024;

function normaliseNodeEnv(value: string | undefined): ServerEnv['nodeEnv'] {
  if (value === 'production') return 'production';
  if (value === 'test') return 'test';
  return 'development';
}

/**
 * Builds the environment snapshot. `warn` is injected so tests can assert the
 * ephemeral-secret warning without touching the console.
 */
export function readServerEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: { warn?: (message: string) => void } = {},
): ServerEnv {
  const nodeEnv = normaliseNodeEnv(source.NODE_ENV);
  const configuredSecret = source.SESSION_SECRET?.trim() ?? '';
  let sessionSecret: Buffer;
  let sessionSecretConfigured = false;

  if (configuredSecret.length >= 32) {
    sessionSecret = Buffer.from(configuredSecret, 'utf8');
    sessionSecretConfigured = true;
  } else {
    // Fail closed: without an operator-provided secret we mint an ephemeral one,
    // so issued tokens stop verifying on every restart instead of becoming
    // guessable. Authorisation is never gated on NODE_ENV (D-003).
    sessionSecret = crypto.randomBytes(32);
    options.warn?.(
      'SESSION_SECRET is not configured (>=32 chars); session tokens are ephemeral and will not survive a restart.',
    );
  }

  const portRaw = Number.parseInt(source.PORT?.trim() ?? '', 10);

  return {
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 3000,
    host: source.HOST?.trim() || '0.0.0.0',
    nodeEnv,
    geminiApiKey: source.GEMINI_API_KEY?.trim() || undefined,
    sessionSecret,
    sessionSecretConfigured,
    sessionTtlMs: 60 * 60 * 1000,
    maxJsonBodyBytes: MAX_JSON_BODY_BYTES,
    trustProxy: source.TRUST_PROXY === 'true',
  };
}

/** Redaction helper for anything that might transit a log line. */
export function redact(value: string | undefined): string {
  if (!value) return '';
  return value.length <= 6 ? '***' : `${value.slice(0, 3)}***`;
}
