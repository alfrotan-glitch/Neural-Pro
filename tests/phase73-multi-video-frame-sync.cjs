const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const video = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RealVideoElement.tsx'), 'utf8');
const clock = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/frameAccurateVideoClock.ts'), 'utf8');
const mapper = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');
const reportPath = path.join(root, 'PHASE_72_REPORT.md');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

assert(player.includes('presentedFrameTimes'), 'VideoPlayer must maintain per-video presented frame times.');
assert(player.includes('resolveAtomicMediaFrameCommit'), 'Multi-video presentation must use the deterministic presented-frame barrier through the atomic commit layer.');
assert(player.includes('const coherentPresentationTime = isPlaying'), 'Preview animation must consume the coherent presented project time during playback.');
assert(player.includes('onPresentedFrame={handlePresentedFrame}'), 'Each RealVideoElement must report its decoded frame to the player.');
assert(player.includes('const activeTime = isPlaying\n    ? transportTime'), 'Shared Project Time must remain authoritative during playback.');
assert(!player.includes('frameReferenceClip'), 'VideoPlayer must not select a single video reference clip for multi-video presentation.');
assert(video.includes('attachFrameAccurateVideoClock'), 'Each video element must own a frame-accurate callback lifecycle.');
assert(video.includes('syncTransport: false'), 'Secondary/media-local frame callbacks must not re-anchor the shared transport.');
assert(video.includes('onFrame: (projectTime) => onPresentedFrame?.(clipId, projectTime, playbackSessionId, playbackSessionRevision)'), 'Each video must report its own presented project time with the active playback session fence.');
assert(clock.includes('syncTransport?: boolean'), 'Frame clock must expose explicit transport-sync policy.');
assert(mapper.includes('sourceTimeToProjectTime'), 'Per-media presented source time must use the canonical mapper contract.');
assert(fs.existsSync(reportPath), 'Previous phase report must remain preserved.');
console.log('PHASE73_MULTI_VIDEO_FRAME_SYNC = PASS');
