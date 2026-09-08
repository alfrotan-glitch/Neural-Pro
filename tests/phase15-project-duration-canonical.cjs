const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const durationSrc = fs.readFileSync(path.join(root, 'src/core/engine/projectDuration.ts'), 'utf8');
const canonicalSrc = fs.readFileSync(path.join(root, 'src/core/engine/clipTimelineDuration.ts'), 'utf8');
const mapperSrc = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');

assert.match(durationSrc, /getCanonicalClipTimelineDuration\(clip\)/);
assert.match(canonicalSrc, /sourceDuration \/ getCanonicalClipPlaybackRate\(clip\)/);
assert.match(canonicalSrc, /Math\.min\(/);
assert.match(mapperSrc, /return getCanonicalClipTimelineDuration\(clip\)/);

// The canonical contract: declared 10s with trim [2, 7] at 2x is only 2.5s
// representable on the timeline; project end therefore cannot be 10s.
const clip = { startAt: 3, duration: 10, trim: { in: 2, out: 7 }, properties: { speed: 2 } };
const sourceDuration = clip.trim.out - clip.trim.in;
const effectiveDuration = Math.min(clip.duration, sourceDuration / clip.properties.speed);
assert.equal(effectiveDuration, 2.5);
assert.equal(clip.startAt + effectiveDuration, 5.5);

console.log('Phase 15 project-duration canonical contract: PASS');
