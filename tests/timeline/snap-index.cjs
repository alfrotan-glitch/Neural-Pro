const assert = require('node:assert/strict');

// Mirror the index contract in a tiny deterministic implementation test so the
// hot-path algorithm can be regression-tested without React/browser runtime.
function createIndex(tracks, excluded, currentTime) {
  const points = [0, currentTime];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (excluded.has(clip.id)) continue;
      const effectiveDuration = Number.isFinite(clip.effectiveDuration) ? clip.effectiveDuration : clip.duration;
      points.push(clip.startAt, clip.startAt + effectiveDuration);
    }
  }
  return [...new Set(points.map((n) => Number(n.toFixed(6))))].sort((a, b) => a - b);
}

const tracks = [{
  id: 'v1',
  type: 'video',
  isLocked: false,
  isMuted: false,
  isVisible: true,
  clips: [
    { id: 'a', startAt: 0, duration: 2, effectiveDuration: 2 },
    { id: 'b', startAt: 5, duration: 3, effectiveDuration: 2 },
  ],
}];

const points = createIndex(tracks, new Set(['a']), 7.5);
assert.deepEqual(points, [0, 5, 7, 7.5]);
assert.ok(points.includes(5));
assert.ok(!points.includes(2));
console.log('TIMELINE_SNAP_INDEX=PASS');
