const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(ok, msg) { if (!ok) throw new Error(msg); }

const sync = read('src/features/video-studio/playback/services/mediaSyncController.ts');
assert(sync.includes("playbackDirection?: PlaybackDirection;"), 'media sync direction option missing');
assert(sync.includes('const reverseMode = isPlaying && playbackDirection < 0;'), 'reverse media mode missing');
assert(sync.includes('reverseMode ||'), 'reverse mode must force media seek/step');
assert(sync.includes('if (isPlaying && !reverseMode)'), 'forward play path must exclude reverse mode');
assert(sync.includes('if (!media.paused) media.pause();'), 'reverse media must remain paused between deterministic seeks');
assert(sync.includes('playbackDirection: PlaybackDirection'), 'direction contract must be typed');

const session = read('src/features/video-studio/playback/services/multiMediaSyncController.ts');
assert(session.includes('playbackDirection?: PlaybackDirection;'), 'session direction state missing');
assert(session.includes('playbackDirection: snapshot.playbackDirection ?? 1'), 'session must forward direction to media sync');
assert(session.includes('this.generation += 1;'), 'session generation guard missing');
assert(session.includes('controller.signal.aborted || this.disposed || this.state !== snapshot || this.generation !== generation'), 'stale async reconcile must be rejected');

const video = read('src/features/video-studio/playback/components/RealVideoElement.tsx');
assert(video.includes('playbackDirection?: PlaybackDirection;'), 'RealVideoElement direction prop missing');
assert(video.includes('playbackDirection = 1'), 'RealVideoElement direction default missing');
assert(video.includes('playbackDirection, playbackFps, playbackSessionId, playbackSessionRevision });'), 'RealVideoElement must pass direction, fps, and playback session fence into sync session');

const player = read('src/components/player/VideoPlayer.tsx');
assert(player.includes('const playbackDirection = getTransportClock().playbackDirection;'), 'VideoPlayer must read transport direction');
assert(player.includes('playbackDirection={playbackDirection}'), 'VideoPlayer must propagate direction to video media');

const clock = read('src/features/video-studio/playback/services/transportClock.ts');
assert(clock.includes('playReverse()'), 'reverse transport command missing');
assert(clock.includes('this.direction = -1;'), 'reverse direction assignment missing');

console.log('PHASE77_REVERSE_MEDIA_PRESENTATION = PASS');
