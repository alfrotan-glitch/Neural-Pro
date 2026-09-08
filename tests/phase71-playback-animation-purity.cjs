const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const player = read('src/components/player/VideoPlayer.tsx');
const evaluator = read('src/features/video-studio/animation/services.ts');
const clock = read('src/features/video-studio/playback/services/transportClock.ts');

assert(player.includes('const activeTime = isPlaying\n    ? transportTime\n    : (hoverTime !== null ? hoverTime : currentTime);'),
  'Playback Project Time must remain authoritative; decoded-frame times are media-local presentation metadata.');
assert(player.includes('presentedFrameTimes'),
  'Playback must retain per-video presented-frame timestamps.');
assert(player.includes('const clipPresentedTime = isPlaying ? (presentedFrameTimes[clip.id] ?? activeTime) : activeTime;'),
  'Media presentation must retain each clip’s presented frame time.');
assert(player.includes('createAtomicRenderSnapshot') && player.includes('renderSnapshot.transformByClipId'),
  'Animation transforms must be evaluated through the canonical render snapshot.');
assert(evaluator.includes("a.interpolation === 'bezier'"),
  'Rotation evaluation must honor Bezier interpolation just like other animated properties.');
assert(evaluator.includes('bezierProgress(rawT, a, b)'),
  'Rotation Bezier segments must use the canonical Bezier evaluator.');
assert(clock.includes('private readonly tick = (now: number): void =>'),
  'Playback progression must remain owned by the central TransportClock.');
assert(!/setCurrentTime\([^)]*canonicalTransform|executeCommand\([^)]*evaluateClipAnimation/.test(player),
  'Playback rendering must not mutate canonical transform/keyframe state.');

console.log('PHASE71_PLAYBACK_ANIMATION_PURITY=PASS');
