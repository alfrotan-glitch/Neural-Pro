/**
 * Stage 12 security tests — server boundary hardening (static guard).
 *
 * MIGRATED 2026-09-09 (WP-01: server boundary rewrite).
 *
 * The original suite protected the *server-side FFmpeg export pipeline*: it
 * required `spawn('ffmpeg')`, an `EXPORT_API_TOKEN` bearer check, an
 * `EXPORT_SESSION_PATTERN` upload session, frame/audio data-URL decoding, an
 * output-size cap and per-route export rate limits. That whole pipeline was
 * deleted by design — media processing is browser-native (ADR-004) and the
 * Architecture Freeze forbids the server from running subprocesses — so those
 * assertions are no longer expressible.
 *
 * What this file now enforces is the *stronger* invariant that replaced them:
 * the server has no shell/execution surface at all, the AI path is the only
 * server-authoritative one, and no secret can reach the client. The runtime
 * behaviour (auth, rate limits, 410s, payload limits, upstream failure mapping)
 * is executed by `tests/server/contract.test.mts` — `npm run test:server`.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Comments may name a removed control; only code counts. */
const stripComments = (source) =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');

const server = stripComments(read('server.ts'));
const app = read('server/app.ts');
const session = read('server/auth/session.ts');
const rateLimit = read('server/middleware/rateLimit.ts');
const requestContext = read('server/middleware/requestContext.ts');
const models = read('server/config/models.ts');
const gemini = read('server/ai/geminiClient.ts');
const schemas = read('server/schemas/schema.ts');
const vite = stripComments(read('vite.config.ts'));

const serverTree = [
  'server/app.ts',
  'server/errors.ts',
  'server/config/models.ts',
  'server/config/env.ts',
  'server/auth/session.ts',
  'server/middleware/rateLimit.ts',
  'server/middleware/requestContext.ts',
  'server/middleware/respond.ts',
  'server/ai/geminiClient.ts',
  'server/operations/ai.ts',
  'server/operations/captions.ts',
  'server/operations/health.ts',
  'server/operations/gone.ts',
  'server/captions/srt.ts',
]
  .map((file) => stripComments(read(file)))
  .join('\n');

const assertions = [
  /* 1. no execution surface whatsoever (replaces "uses spawn ffmpeg") */
  ['no child_process import anywhere in the server boundary', !/child_process/.test(serverTree + server)],
  ['no spawn() call anywhere in the server boundary', !/\bspawn\s*\(/.test(serverTree + server)],
  // `.exec(` is a RegExp method; only a standalone exec()/execSync() call matters.
  ['no exec()/execSync() call anywhere in the server boundary', !/(^|[^.\w])exec(?:Sync)?\s*\(/.test(serverTree + server)],
  ['no ffmpeg invocation anywhere in the server boundary', !/ffmpeg/.test(serverTree + server)],
  ['no shell command string is built', !/ffmpegCmd|\$\{[^}]*\}\s*&&/.test(serverTree + server)],
  ['the server writes nothing to /tmp', !/['"`]\/tmp\//.test(serverTree + server)],

  /* 2. the export upload surface is gone, not merely protected */
  ['no EXPORT_API_TOKEN bearer scheme remains', !serverTree.includes('EXPORT_API_TOKEN')],
  ['no export upload session machinery remains', !serverTree.includes('EXPORT_SESSION_PATTERN')],
  ['no frame/audio data-URL decoding remains', !serverTree.includes('decodeBase64DataUrl')],

  /* 3. authentication is unconditional and timing-safe */
  ['session tokens are HMAC-signed', session.includes("crypto.createHmac('sha256'")],
  ['token comparison is timing-safe', session.includes('crypto.timingSafeEqual')],
  ['session tokens are short-lived', /ttlMs|expiresInMs|exp\b/.test(session)],
  ['session tokens carry scopes', session.includes('scopes')],
  ['auth is never gated on NODE_ENV', !/NODE_ENV\s*!==\s*'production'[\s\S]{0,200}requireSession/.test(serverTree + server)],

  /* 4. rate limiting and concurrency are enforced per route */
  ['per-IP rate limit buckets exist', rateLimit.includes('perIpPerMinute')],
  ['per-token rate limit buckets exist', rateLimit.includes('perTokenPerMinute')],
  ['rate-limited responses set Retry-After', rateLimit.includes('Retry-After')],
  ['rate-limited responses are typed RATE_LIMITED', rateLimit.includes("'RATE_LIMITED'")],
  ['upstream concurrency is bounded', rateLimit.includes('class ConcurrencyGuard')],

  /* 5. the client can never choose the model or the execution policy */
  ['model ids are declared in exactly one server module', models.includes('AI_MODELS')],
  ['no other server module hardcodes a model id', !/gemini-[\w.-]+/.test(serverTree.replace(stripComments(models), ''))],
  ['no client source hardcodes a model id', !/gemini-[\w.-]+/.test(
    ['src/domain/ai/AiGateway.ts', 'src/infra/ai/HttpAiGateway.ts', 'src/app/workflows/definitions/tts.ts']
      .map(read)
      .join('\n'),
  )],
  ['request schemas are strict: unknown keys are rejected', schemas.includes('unknown keys are rejected')],

  /* 6. no secret can reach the browser or the logs */
  ['the API key never enters the client bundle', !vite.includes('GEMINI_API_KEY') && !vite.includes('process.env.GEMINI')],
  ['the API key is read from the server environment only', /geminiApiKey/.test(read('server/config/env.ts'))],
  ['log lines are secret-redacted', requestContext.includes('redactSecrets')],
  ['the redactor covers key/token/authorization/secret patterns', /api\[_-\]\?key\|authorization\|secret\|token\|bearer/.test(requestContext)],

  /* 7. payloads and upstream output are bounded */
  ['the JSON body parser has an explicit limit', app.includes('express.json({ limit: MAX_TEXT_REQUEST_BYTES })')],
  ['the limit is a named constant, not a default', app.includes("MAX_TEXT_REQUEST_BYTES = '10mb'")],
  ['speech sample rates are validated against an allowlist', gemini.includes('ALLOWED_SAMPLE_RATES.includes')],
  ['speech channel counts are validated against an allowlist', gemini.includes('ALLOWED_CHANNEL_COUNTS.includes')],
  ['silent audio is rejected instead of accepted as output', gemini.includes('isSilentPcm16(buffer)')],
  ['an unconfigured AI key is a typed 503, never simulated output', gemini.includes('notConfigured(')],

  /* 8. security headers and no framework fingerprint */
  ['x-powered-by is disabled', app.includes("app.disable('x-powered-by')")],
  ['security headers are applied to every response', app.includes('securityHeaders(')],
];

const failed = assertions.filter(([, ok]) => !ok);
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
}

if (failed.length) process.exit(1);
console.log('Stage 12 security tests: PASS');
