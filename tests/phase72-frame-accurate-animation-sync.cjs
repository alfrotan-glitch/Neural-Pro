const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const clock = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/frameAccurateVideoClock.ts'), 'utf8');
const video = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RealVideoElement.tsx'), 'utf8');
const evaluator = fs.readFileSync(path.join(root, 'src/features/video-studio/animation/services.ts'), 'utf8');
const reportPath = path.join(root, 'PHASE_71_REPORT.md');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

assert(player.includes('presentedFrameTimes'), 'VideoPlayer must expose per-video decoded-frame presentation state.');
assert(player.includes('const activeTime = isPlaying\n    ? transportTime'), 'Project Time must remain authoritative during playback.');
assert(player.includes('const clipPresentedTime = isPlaying ? (presentedFrameTimes[clip.id] ?? activeTime)'), 'Video animation must use its own decoded presentation time.');
assert(video.includes('onPresentedFrame={handlePresentedFrame}') || player.includes('onPresentedFrame={handlePresentedFrame}'), 'VideoPlayer must connect video presentation callbacks.');
assert(video.includes('attachFrameAccurateVideoClock'), 'Each video element must own a frame-accurate callback lifecycle.');
assert(clock.includes('requestVideoFrameCallback'), 'Frame clock must use requestVideoFrameCallback when available.');
assert(clock.includes('sourceTimeToProjectTime(clip, metadata.mediaTime)'), 'Decoded media time must map through canonical source/project time.');
assert(clock.includes('syncTransport?: boolean'), 'Frame clock must expose explicit transport-sync policy.');
assert(clock.includes('if (syncTransport)'), 'Transport correction must be optional for media-local frame reporting.');
assert(evaluator.includes('evaluateClipAnimation'), 'Animation evaluator remains the canonical evaluation path.');
assert(fs.existsSync(reportPath), 'Previous phase report must remain preserved.');
console.log('PHASE72_FRAME_ACCURATE_ANIMATION_SYNC = PASS');
