const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const duration = fs.readFileSync(path.join(root, 'src/core/engine/clipTimelineDuration.ts'), 'utf8');
const resize = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts'), 'utf8');
const geometry = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaFrameGeometry.ts'), 'utf8');
const placement = fs.readFileSync(path.join(root, 'src/features/video-studio/project/services/projectService.ts'), 'utf8');
const pipeline = fs.readFileSync(path.join(root, 'src/core/engine/RenderPipeline.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const lockRoot = lock.packages[''];

assert.match(geometry, /MEDIA_FRAME_SIZE_PERCENT\s*=\s*85/, 'Preview media geometry must match canonical 85% export composition');
assert.match(duration, /sourceMediaDuration/, 'Canonical duration must consume persisted source media duration');
assert.match(duration, /persistedSourceDuration > start \? persistedSourceDuration - start/, 'Persisted source duration must be reduced by trim.in before timeline-rate mapping');
assert.match(resize, /hasPersistedMediaDuration[\s\S]*!hasPersistedMediaDuration/, 'Timeline resize must treat persisted media duration as media-backed even without a live URL');
assert.match(placement, /const trackRole = track\.laneRole \?\? track\.type;/, 'Smart insertion must resolve semantic lane role before reuse');
assert.match(placement, /return trackRole === role;/, 'Smart insertion must reject cross-role effect/video track reuse');
assert.match(pipeline, /const downloadUrl = URL\.createObjectURL\(blob\);[\s\S]*URL\.revokeObjectURL\(downloadUrl\);[\s\S]*return false;/, 'Stale render run must revoke its blob URL before returning');
assert.match(server, /express\.json\(\{ limit: MAX_TEXT_REQUEST_BYTES \}\)/, 'Text APIs must have a bounded route-scoped JSON parser');
assert.match(server, /requireApiRateLimit/, 'AI/SRT APIs must be rate-limited');
assert.match(server, /MAX_BINARY_EXPORT_REQUEST_BYTES/, 'Binary export parser must have an explicit larger limit');
assert.ok(server.includes("'/api/generateContent': 30"), 'AI endpoint rate-limit key must match the mounted application path');
assert.equal(pkg.dependencies.vite, undefined, 'Vite should not be a production dependency after dev-only runtime loading');
assert.equal(pkg.devDependencies.vite, '^6.2.0', 'Vite must remain available for development/build tooling');
assert.equal(lockRoot.dependencies?.vite, undefined, 'Lockfile must not retain Vite as a production dependency');
assert.equal(lockRoot.devDependencies?.vite, '^6.2.0', 'Lockfile must track Vite as development-only');
assert.match(server, /if \(process\.env\.NODE_ENV !== 'production'\)[\s\S]*await import\('vite'\)/, 'Production server must not statically load Vite');

console.log('PHASE118_REPAIRED_DEFECT_REGRESSIONS=PASS');
