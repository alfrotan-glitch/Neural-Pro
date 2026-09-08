const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(ok, msg) { if (!ok) throw new Error(msg); }

const direction = read('src/features/video-studio/playback/services/playbackDirection.ts');
assert(direction.includes("export type PlaybackDirection = 1 | -1;"), 'direction type missing');
assert(direction.includes('advancePlaybackTime'), 'directional advance helper missing');
assert(direction.includes('direction < 0'), 'reverse branch missing');

const clock = read('src/features/video-studio/playback/services/transportClock.ts');
assert(clock.includes('private direction: PlaybackDirection = 1;'), 'transport direction state missing');
assert(clock.includes('playReverse()'), 'reverse play command missing');
assert(clock.includes('playForward()'), 'forward play command missing');
assert(clock.includes('setPlaybackDirection'), 'direction setter missing');
assert(clock.includes('advancePlaybackTime(this.time'), 'transport must advance through directional contract');
assert(clock.includes('this.direction < 0 ? 0 : this.duration'), 'reverse boundary must end at zero');

const frame = read('src/features/video-studio/playback/services/frameAccurateVideoClock.ts');
assert(frame.includes('const direction = transport.playbackDirection;'), 'frame clock must consume transport direction');
assert(frame.includes('wrongWay'), 'directional stale-frame guard missing');
assert(frame.includes('direction < 0'), 'reverse frame ordering guard missing');
assert(frame.includes('lastPresentedProjectTime'), 'presented frame monotonic state missing');

const evaluator = read('src/features/video-studio/animation/services.ts');
assert(evaluator.includes('const localTime = Math.max(0, projectTime - clip.startAt);'), 'animation evaluator project/local contract changed unexpectedly');

console.log('PHASE76_DIRECTIONAL_PLAYBACK = PASS');
