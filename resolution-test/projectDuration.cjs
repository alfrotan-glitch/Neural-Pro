const assert = require('node:assert/strict');

function calculateProjectDuration(tracks) {
  let duration = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (!Number.isFinite(clip.startAt) || !Number.isFinite(clip.duration)) continue;
      duration = Math.max(duration, Math.max(0, clip.startAt + clip.duration));
    }
  }
  return duration;
}

const tracks = [
  { clips: [{ startAt: 0, duration: 18.5 }, { startAt: 18.5, duration: 12 }] },
  { clips: [{ startAt: 30.5, duration: 14.5 }] },
  { clips: [{ startAt: 0, duration: 45 }] },
];

assert.equal(calculateProjectDuration(tracks), 45);
assert.equal(calculateProjectDuration([]), 0);
assert.equal(calculateProjectDuration([{ clips: [{ startAt: 10, duration: 5 }] }]), 15);
assert.equal(calculateProjectDuration([{ clips: [{ startAt: 10, duration: NaN }] }]), 0);
console.log('Stage 9 duration tests: PASS');
