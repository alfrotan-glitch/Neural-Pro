const assert = require('node:assert/strict');

function bitrate(resolution, fps, codec, quality) {
  const base = { '720p': 4e6, '1080p': 8e6, '2K': 16e6, '4K': 35e6, '8K': 80e6 }[resolution];
  const codecFactor = { 'H.264': 1, 'H.265': 0.68, AV1: 0.58 }[codec];
  const fpsFactor = { 24: 0.9, 30: 1, 60: 1.65 }[fps];
  const qualityFactor = { Fast: 0.75, Balanced: 1, 'High Quality': 1.3 }[quality];
  const round = (v) => { const step = v >= 1e7 ? 1e5 : 5e4; return Math.max(step, Math.round(v / step) * step); };
  const recommended = round(base * codecFactor * fpsFactor);
  return Math.min(round(recommended * 2), Math.max(round(recommended * 0.5), round(recommended * qualityFactor)));
}

assert.equal(bitrate('1080p', 30, 'H.264', 'Balanced'), 8_000_000);
assert.equal(bitrate('4K', 60, 'H.264', 'Balanced'), 57_800_000);
assert.equal(bitrate('8K', 60, 'H.264', 'High Quality'), 171_600_000);
assert.ok(bitrate('4K', 30, 'H.265', 'Balanced') < bitrate('4K', 30, 'H.264', 'Balanced'));
assert.ok(bitrate('4K', 30, 'AV1', 'Balanced') < bitrate('4K', 30, 'H.265', 'Balanced'));
assert.ok(bitrate('4K', 60, 'H.264', 'Balanced') > bitrate('4K', 30, 'H.264', 'Balanced'));
assert.ok(bitrate('8K', 60, 'H.264', 'Balanced') > 100_000_000);
console.log('Stage 4 bitrate model tests: PASS');
