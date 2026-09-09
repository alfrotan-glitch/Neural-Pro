/**
 * Phase 118 — repaired-defect regressions.
 *
 * MIGRATED 2026-09-09 (WP-01 server boundary + WP-04 export queue).
 *
 * Four assertions had to move because the code they pointed at was deliberately
 * deleted or relocated; every other assertion is unchanged.
 *
 *  1. "Stale render run must revoke its blob URL before returning" used to match
 *     `RenderPipeline.ts`, which both rendered and wrote job status. The pipeline
 *     is now a thin adapter over the export workflow: it creates no object URLs
 *     at all. Ownership is split — the workflow's `deliver` step creates the URL
 *     and the export store revokes it when the URL is replaced, retried, removed
 *     or the queue is cleared (one owner, no double-free, no leak).
 *  2. `express.json({ limit: MAX_TEXT_REQUEST_BYTES })` moved from `server.ts` to
 *     `server/app.ts` (the app factory).
 *  3. `requireApiRateLimit` was replaced by the shared `rateLimit()` middleware in
 *     `server/middleware/rateLimit.ts`, applied per route with per-IP *and*
 *     per-token buckets.
 *  4. `MAX_BINARY_EXPORT_REQUEST_BYTES` and the `'/api/generateContent': 30`
 *     rate-limit key no longer exist: the server accepts no binary payloads and
 *     `/api/generateContent` answers `410 Gone` (ADR-004/ADR-005, SHIM-004).
 *     The replacement invariants are "no binary parser is mounted" and "every
 *     operation route is rate limited".
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const duration = fs.readFileSync(path.join(root, 'src/core/engine/clipTimelineDuration.ts'), 'utf8');
const resize = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts'), 'utf8');
const geometry = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaFrameGeometry.ts'), 'utf8');
const placement = fs.readFileSync(path.join(root, 'src/features/video-studio/project/services/projectService.ts'), 'utf8');
const pipeline = fs.readFileSync(path.join(root, 'src/core/engine/RenderPipeline.ts'), 'utf8');
const exportWorkflow = fs.readFileSync(path.join(root, 'src/app/workflows/definitions/export.ts'), 'utf8');
const exportStore = fs.readFileSync(path.join(root, 'src/store/useExportStore.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'server/app.ts'), 'utf8');
const rateLimit = fs.readFileSync(path.join(root, 'server/middleware/rateLimit.ts'), 'utf8');
const gone = fs.readFileSync(path.join(root, 'server/operations/gone.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const lockRoot = lock.packages[''];

assert.match(geometry, /MEDIA_FRAME_SIZE_PERCENT\s*=\s*85/, 'Preview media geometry must match canonical 85% export composition');
assert.match(duration, /sourceMediaDuration/, 'Canonical duration must consume persisted source media duration');
assert.match(duration, /persistedSourceDuration > start \? persistedSourceDuration - start/, 'Persisted source duration must be reduced by trim.in before timeline-rate mapping');
assert.match(resize, /hasPersistedMediaDuration[\s\S]*!hasPersistedMediaDuration/, 'Timeline resize must treat persisted media duration as media-backed even without a live URL');
assert.match(placement, /const trackRole = track\.laneRole \?\? track\.type;/, 'Smart insertion must resolve semantic lane role before reuse');
assert.match(placement, /return trackRole === role;/, 'Smart insertion must reject cross-role effect/video track reuse');

/* (1) blob-URL ownership: the workflow delivers, the store revokes. */
assert.doesNotMatch(pipeline, /createObjectURL/, 'RenderPipeline is an adapter and must not create object URLs');
assert.match(exportWorkflow, /ctx\.deps\.createObjectUrl[\s\S]*URL\.createObjectURL\(value\)/, 'The export workflow owns object-URL creation, through an injectable factory');
assert.match(exportWorkflow, /single owner, no double-free/, 'Object-URL ownership is documented as single-owner');
assert.equal(exportStore.match(/URL\.revokeObjectURL/g)?.length, 4, 'The store revokes on replace, retry, remove and clearQueue');
assert.match(exportStore, /existing\.downloadUrl !== updates\.downloadUrl/, 'Replacing a download URL revokes the superseded one');
assert.match(exportStore, /Cancellation is \*not\* a store operation/, 'Job status is written by the scheduler alone (ADR-011, D-010)');

/* (2)(3)(4) server boundary: relocated limits, real rate limits, removed surfaces. */
assert.match(app, /express\.json\(\{ limit: MAX_TEXT_REQUEST_BYTES \}\)/, 'Text APIs must have a bounded route-scoped JSON parser');
assert.match(app, /MAX_TEXT_REQUEST_BYTES = '10mb'/, 'The body limit is an explicit named constant');
assert.match(rateLimit, /export function rateLimit/, 'A shared rate-limit middleware exists');
assert.match(rateLimit, /perIpPerMinute/, 'Rate limits are enforced per IP');
assert.match(rateLimit, /perTokenPerMinute/, 'Rate limits are enforced per token');
assert.match(rateLimit, /Retry-After/, 'Rate-limited responses carry Retry-After');
assert.doesNotMatch(app, /express\.raw|express\.urlencoded/, 'The server mounts no binary body parser (media is browser-native)');
assert.match(gone, /router\.all\('\/generateContent'/, '/api/generateContent is 410 Gone, not a rate-limited passthrough');
assert.match(gone, /GONE_STATUS = 410/, 'Removed surfaces answer 410');
assert.match(server, /if \(process\.env\.NODE_ENV !== 'production'\)[\s\S]*await import\('vite'\)/, 'Production server must not statically load Vite');

/* Build hygiene (unchanged). */
assert.equal(pkg.dependencies.vite, undefined, 'Vite should not be a production dependency after dev-only runtime loading');
assert.equal(pkg.devDependencies.vite, '^6.2.0', 'Vite must remain available for development/build tooling');
assert.equal(lockRoot.dependencies?.vite, undefined, 'Lockfile must not retain Vite as a production dependency');
assert.equal(lockRoot.devDependencies?.vite, '^6.2.0', 'Lockfile must track Vite as development-only');
assert.equal(pkg.dependencies['better-sqlite3'], undefined, 'No native SQLite dependency: the server persists nothing');

console.log('PHASE118_REPAIRED_DEFECT_REGRESSIONS=PASS');
