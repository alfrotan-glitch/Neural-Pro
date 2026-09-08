import assert from 'node:assert/strict';
import { RenderFpsAuthority, DEFAULT_CANONICAL_FPS } from '../../../src/domain/render/fpsAuthority';

console.log('--- RUNNING FPS AUTHORITY UNIT TESTS ---');

// 1. Fallback / Default resolution
assert.equal(RenderFpsAuthority.resolveFps(), DEFAULT_CANONICAL_FPS);
assert.equal(RenderFpsAuthority.resolveFps({}), DEFAULT_CANONICAL_FPS);
assert.equal(RenderFpsAuthority.resolveFps({ settingsFps: -1 }), DEFAULT_CANONICAL_FPS);
assert.equal(RenderFpsAuthority.resolveFps({ settingsFps: NaN }), DEFAULT_CANONICAL_FPS);
console.log('PASS: Fallback to default FPS on missing/invalid input');

// 2. Precedence (settings > project > fallback)
assert.equal(RenderFpsAuthority.resolveFps({ settingsFps: 60, projectFps: 24 }), 60);
assert.equal(RenderFpsAuthority.resolveFps({ settingsFps: null, projectFps: 25 }), 25);
assert.equal(RenderFpsAuthority.resolveFps({ settingsFps: undefined, projectFps: undefined, fallbackFps: 50 }), 50);
console.log('PASS: FPS resolution precedence rules');

// 3. Frame Count calculations
assert.equal(RenderFpsAuthority.getFrameCount(0, 30), 0);
assert.equal(RenderFpsAuthority.getFrameCount(1, 30), 30);
assert.equal(RenderFpsAuthority.getFrameCount(1.001, 30), 31);
assert.equal(RenderFpsAuthority.getFrameCount(10.5, 24), 252);
console.log('PASS: Strict integer frame count calculation');

// 4. Frame Timestamps & Times
assert.equal(RenderFpsAuthority.getFrameTime(0, 30), 0);
assert.equal(RenderFpsAuthority.getFrameTime(30, 30), 1);
assert.equal(RenderFpsAuthority.getFrameTimestampUs(0, 30), 0);
assert.equal(RenderFpsAuthority.getFrameTimestampUs(30, 30), 1_000_000);
assert.equal(RenderFpsAuthority.getFrameTimestampUs(15, 30), 500_000);
console.log('PASS: Microsecond presentation timestamp calculation');

// 5. Timecode formatting (HH:MM:SS:FF)
assert.equal(RenderFpsAuthority.formatTimecode(0, 30), '00:00:00:00');
assert.equal(RenderFpsAuthority.formatTimecode(1, 30), '00:00:01:00');
assert.equal(RenderFpsAuthority.formatTimecode(65.5, 30), '00:01:05:15');
assert.equal(RenderFpsAuthority.formatTimecode(3665.25, 24), '01:01:05:06');
console.log('PASS: Frame-accurate timecode formatting');

console.log('\nFPS_AUTHORITY_UNIT_TESTS=PASS');
