const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const mapper = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');
const driver = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/frameAccurateVideoClock.ts'), 'utf8');
const clock = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/transportClock.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const realVideo = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RealVideoElement.tsx'), 'utf8');

assert.match(mapper, /sourceTimeToProjectTime/);
assert.match(driver, /requestVideoFrameCallback/);
assert.match(driver, /sourceTimeToProjectTime\(clip, metadata\.mediaTime\)/);
assert.match(driver, /syncFromMediaFrame/);
assert.match(driver, /cancelVideoFrameCallback/);
assert.match(driver, /syncTransport\?: boolean/);
assert.match(clock, /syncFromMediaFrame/);
assert.match(realVideo, /attachFrameAccurateVideoClock/);
assert.match(realVideo, /syncTransport: false/);
assert.match(realVideo, /onPresentedFrame/);
assert.match(player, /presentedFrameTimes/);
assert.match(player, /onPresentedFrame=\{handlePresentedFrame\}/);

console.log('FRAME_ACCURATE_PREVIEW=PASS');
