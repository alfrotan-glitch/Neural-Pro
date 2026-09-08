import assert from 'node:assert/strict';
import { resolvePresentedFrameBarrier } from '../../../src/features/video-studio/playback/services/presentedFrameBarrier';

console.log('--- RUNNING PRESENTED FRAME BARRIER TESTS ---');

// 1. Empty clips ready immediately
const resEmpty = resolvePresentedFrameBarrier({
  clipIds: [],
  presentedFrameTimes: {},
  transportTime: 1.5,
});
assert.equal(resEmpty.ready, true);
assert.equal(resEmpty.time, 1.5);
assert.equal(resEmpty.skewSeconds, 0);
assert.equal(resEmpty.missingClipIds.length, 0);
console.log('PASS: Empty clip set is immediately ready at transport time');

// 2. Missing clip times blocks barrier
const resMissing = resolvePresentedFrameBarrier({
  clipIds: ['clip_1', 'clip_2'],
  presentedFrameTimes: { clip_1: 2.0 },
  transportTime: 2.0,
  fallbackTime: 1.9,
});
assert.equal(resMissing.ready, false);
assert.equal(resMissing.time, 1.9);
assert.deepEqual(resMissing.missingClipIds, ['clip_2']);
console.log('PASS: Missing clip frames block presentation barrier and report missing clip IDs');

// 3. Coherent multi-video frames succeed
const resCoherent = resolvePresentedFrameBarrier({
  clipIds: ['clip_1', 'clip_2'],
  presentedFrameTimes: { clip_1: 2.005, clip_2: 2.015 },
  transportTime: 2.010,
  maxFrameSkewSeconds: 0.05,
  maxTransportLagSeconds: 0.1,
});
assert.equal(resCoherent.ready, true);
assert.equal(resCoherent.time, 2.005);
assert.ok(Math.abs((resCoherent.skewSeconds ?? 0) - 0.01) < 1e-6);
console.log('PASS: Multi-video frames within skew tolerance resolve oldest presentation time');

// 4. Excessive skew rejects barrier
const resSkewed = resolvePresentedFrameBarrier({
  clipIds: ['clip_1', 'clip_2'],
  presentedFrameTimes: { clip_1: 1.0, clip_2: 1.5 },
  transportTime: 1.25,
  maxFrameSkewSeconds: 0.05,
});
assert.equal(resSkewed.ready, false);
console.log('PASS: Excessive skew rejects barrier');

console.log('\nPRESENTED_FRAME_BARRIER_TESTS=PASS');
