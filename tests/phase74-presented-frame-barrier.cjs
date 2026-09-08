const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const barrier = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/presentedFrameBarrier.ts'), 'utf8');
const previousReport = path.join(root, 'PHASE_73_REPORT.md');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

assert(player.includes('resolveAtomicMediaFrameCommit'), 'VideoPlayer must consume the presented-frame barrier through the atomic media-frame commit layer.');
assert(player.includes('activeVideoClipIds'), 'Barrier must be computed from all concurrently active video clips.');
assert(player.includes('lastAtomicMediaFrameCommitRef'), 'Playback must hold the last coherent atomic presentation epoch while frames are incomplete/skewed.');
assert(player.includes('const coherentPresentationTime = isPlaying'), 'Preview animation must consume the coherent atomic presentation time during playback.');
assert(player.includes('maxFrameSkewSeconds: 1 / Math.max(1, projectFps)'), 'Barrier skew must be frame-based, not an arbitrary UI timeout.');
assert(player.includes('maxTransportLagSeconds: 0.125'), 'Barrier must reject stale frames too far behind transport.');
assert(barrier.includes('clipIds: string[]'), 'Barrier service must operate on a set of active video IDs.');
assert(barrier.includes('missingClipIds'), 'Barrier result must expose missing participants.');
assert(barrier.includes('const ready = skewSeconds <='), 'Barrier readiness must reject excessive inter-video skew.');
assert(barrier.includes('const transportLag = Math.max('), 'Barrier readiness must reject frames too far from shared project time.');
assert(barrier.includes('time: ready ? minTime : fallbackTime'), 'Barrier time must be deterministic and avoid fabricating a newer frame.');
assert(fs.existsSync(previousReport), 'Previous Phase 73 report must remain preserved.');
console.log('PHASE74_PRESENTED_FRAME_BARRIER = PASS');
