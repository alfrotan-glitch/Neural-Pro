/**
 * API route integrity — static source-boundary guard.
 *
 * MIGRATED 2026-09-09 (WP-01: server boundary rewrite).
 *
 * The previous version of this suite asserted the *pre-freeze* surface:
 *   • `POST /api/generateContent`, a client-controlled Gemini passthrough that let
 *     the browser choose model, system instruction, tools and generation config;
 *   • `app.use('/api/export', exportRouter)` with `/start`, `/upload-frame`,
 *     `/upload-frames`, `/upload-audio`, `/finish` — server-side FFmpeg encoding;
 *   • legacy caption routes (`/api/generate-captions`, `/api/refine-captions`,
 *     `/api/parse-srt`, `/api/export-srt`) that answered `200` with
 *     `degraded: true` simulated captions when no API key was configured.
 *
 * All three were removed on purpose, so the old assertions cannot be kept:
 *   • Gemini is reachable only through operation-specific, schema-validated
 *     routes (ARCHITECTURE FREEZE → AI Integration, ADR-005/ADR-009);
 *   • media processing is browser-native, so every `/api/export/*` route is
 *     `410 Gone` (ADR-004, SHIM-004);
 *   • simulated AI output is a fabricated success and is forbidden (INV-010,
 *     `docs/contracts/errors.md`): a missing key is `503 AI_NOT_CONFIGURED`.
 *
 * The behavioural contract for each item below is executed by
 * `tests/server/contract.test.mts` (`npm run test:server`, 15 HTTP-level tests
 * with an injected transport). This file stays the static guard: it fails if a
 * removed surface reappears or a new unregistered route is added.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const app = read('server/app.ts');
const server = read('server.ts');
const gone = read('server/operations/gone.ts');
const health = read('server/operations/health.ts');
const ai = read('server/operations/ai.ts');
const captions = read('server/operations/captions.ts');
const schemas = read('server/schemas/operations.ts');
const schemaLib = read('server/schemas/schema.ts');
const inspector = read('src/components/inspector/InspectorEngine.tsx');
const sidebar = read('src/components/workspace/ResourceSidebar.tsx');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

/* ------------------------------------------------- the allowed surface exists */

assert(app.includes("app.use('/api', api)"), 'the API is mounted at /api');
assert(app.includes('registerHealthRoutes(api'), 'health routes are registered');
assert(app.includes('registerGoneRoutes(api'), 'removed-route shims are registered');
assert(app.includes('registerAiRoutes(api'), 'AI routes are registered');
assert(app.includes('registerCaptionRoutes(api'), 'caption routes are registered');
assert(app.includes("api.get(\n    '/session'") || app.includes("'/session'"), 'session issuance route exists');

assert(health.includes("router.get('/health'"), 'GET /api/health exists');
assert(health.includes("router.get('/health/ai'"), 'GET /api/health/ai exists');
assert(health.includes('configured: options.aiClient.configured'), 'health reports whether AI is configured, never a fake yes');

assert(ai.includes("'/ai/script'"), 'POST /api/ai/script exists');
assert(ai.includes("'/ai/speech'"), 'POST /api/ai/speech exists');
for (const route of ['generate', 'refine', 'parse-srt', 'export-srt']) {
  assert(captions.includes(`'/captions/${route}'`), `POST /api/captions/${route} exists`);
}
for (const route of ['/ai/script', '/ai/speech']) {
  assert(ai.includes(`requireSession(options.issuer,`), `POST ${route} requires a scoped session`);
}
assert(captions.includes('requireSession(options.issuer,'), 'caption routes require a scoped session');
for (const route of ['/ai/script', '/ai/speech']) {
  assert(ai.includes('rateLimit({ limiter: options.limiter'), `POST ${route} is rate limited`);
}
assert(captions.includes('rateLimit({ limiter: options.limiter'), 'caption routes are rate limited');

/* ------------------------------------------- the removed surface stays removed */

// Comments may name a removed route (that is the migration note); *code* may not.
const stripComments = (source) =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');
const serverCode = stripComments(server);
assert(!serverCode.includes('generateContent'), 'no /api/generateContent passthrough is mounted in server.ts');
assert(!serverCode.includes('exportRouter'), 'no server-side export router is mounted');
assert(!/child_process/.test(server + app + ai + captions), 'the server boundary spawns no subprocess');

for (const route of [
  '/generateContent',
  '/export/start',
  '/export/upload-frame',
  '/export/upload-frames',
  '/export/upload-audio',
  '/export/finish',
  '/generate-captions',
  '/refine-captions',
  '/parse-srt',
  '/export-srt',
]) {
  assert(gone.includes(`'${route}'`), `removed route answers 410: ${route}`);
}
assert(gone.includes('GONE_STATUS = 410'), 'removed routes answer with an explicit 410, not 404 or 200');
assert(gone.includes('SHIM-004'), 'removed routes carry the SHIM-004 migration marker');

/* ------------------------------------------------------- validation is enforced */

assert(schemaLib.includes('unknown keys are rejected'), 'request schemas are strict: unknown keys are rejected');
assert(schemas.includes('SCRIPT_REQUEST_SCHEMA'), 'script requests have a schema');
assert(schemas.includes('SPEECH_REQUEST_SCHEMA'), 'speech requests have a schema');
assert(schemas.includes('CAPTIONS_GENERATE_SCHEMA'), 'caption generate requests have a schema');
assert(schemas.includes('CAPTIONS_PARSE_SRT_SCHEMA'), 'SRT parse requests have a schema');
assert(schemas.includes('CAPTIONS_EXPORT_SRT_SCHEMA'), 'SRT export requests have a schema');
assert(schemas.includes('duration: num({ min: 0.1, max: 86_400 })'), 'caption duration bounds are enforced (0.1s..24h)');
assert(schemas.includes('captionBlockArraySchema'), 'caption blocks are validated as a bounded array');
assert(schemas.includes('projectFps'), 'projectFps is part of every caption schema (D-022: no default fps)');
assert(captions.includes('assertCaptionTiming('), 'caption timing invariants are asserted server-side');

/* ------------------------------------------ no fabricated / degraded AI output */

const serverTree = [app, server, gone, health, ai, captions, read('server/ai/geminiClient.ts'), read('server/prompts/captions.ts')].join('\n');
assert(!/degraded:\s*true/.test(serverTree), 'no route answers with degraded/simulated AI content');
assert(!/simulated/i.test(ai + captions), 'no route fabricates AI output');
assert(ai.includes('AI_NOT_CONFIGURED') || read('server/ai/geminiClient.ts').includes('AI_NOT_CONFIGURED'), 'a missing API key is a typed 503, not simulated content');

/* ------------------------------------------------- clients go through the gateway */

for (const [name, source] of [['InspectorEngine', inspector], ['ResourceSidebar', sidebar]]) {
  assert(!source.includes("fetch('/api"), `${name} no longer calls fetch('/api/...') directly`);
  assert(/getAiGateway|runCaptions/.test(source), `${name} goes through the AI gateway / caption workflow`);
}
assert(inspector.includes('toAppError'), 'InspectorEngine converts thrown failures into typed AppErrors');
assert(sidebar.includes('The caption service returned no caption blocks'), 'ResourceSidebar rejects an empty caption result instead of accepting it');
assert(sidebar.includes('showToast("❌ Transcription failed: " + err.message)'), 'ResourceSidebar reports the real failure to the user');
for (const [name, source] of [['InspectorEngine', inspector], ['ResourceSidebar', sidebar]]) {
  assert(!/degraded|simulated|fallback subtitles/i.test(source), `${name} has no simulated-content branch`);
}

/* --------------------------------------------- the model is a server-side decision */

const vite = read('vite.config.ts');
assert(!stripComments(vite).includes('GEMINI_API_KEY'), 'the client bundle never inlines the Gemini API key');
assert(!/process\.env\.GEMINI_API_KEY/.test(inspector + sidebar), 'no component reads the API key');

console.log('PHASE_E_API_ROUTE_INTEGRITY=PASS');
