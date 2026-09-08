const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const realVideo = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RealVideoElement.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(player.includes('presentedFrameTimes'), 'per-video frame presentation state must exist');
assert(player.includes('presentedFrameTimes[clip.id]'), 'video animation must resolve frame time by clip id');
assert(!player.includes('frameReferenceClip'), 'single frameReferenceClip architecture must be removed');
assert(realVideo.includes('syncTransport: false'), 'individual video frames must not become competing transport owners');
console.log('PHASE_P2_FRAME_REFERENCE_SELECTION=PASS');
