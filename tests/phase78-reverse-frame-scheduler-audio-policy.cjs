const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(ok, msg) { if (!ok) throw new Error(msg); }

const scheduler = read('src/features/video-studio/playback/services/reverseFrameScheduler.ts');
assert(scheduler.includes('export class ReverseFrameScheduler'), 'reverse frame scheduler missing');
assert(scheduler.includes('frameDurationSeconds'), 'scheduler must expose deterministic frame duration');
assert(scheduler.includes('nextTarget'), 'scheduler next-target contract missing');
assert(scheduler.includes('direction < 0'), 'scheduler must have reverse direction branch');
assert(scheduler.includes('MAX_FPS = 240'), 'scheduler fps boundary missing');

const session = read('src/features/video-studio/playback/services/multiMediaSyncController.ts');
assert(session.includes('playbackFps?: number;'), 'media session fps contract missing');
assert(session.includes('createReverseFrameScheduler(state.playbackFps ?? 30)'), 'reverse scheduler must use project fps');
assert(session.includes('this.reverseScheduler.snap(snapshot.projectTime, -1)'), 'reverse sync must snap to deterministic project frame');
assert(session.includes('lastReverseTarget'), 'reverse target de-duplication missing');

const policy = read('src/features/video-studio/playback/services/playbackAudioPolicy.ts');
assert(policy.includes("'muted-reverse'"), 'reverse audio policy missing');
assert(policy.includes('muted: reverse'), 'reverse audio must be muted while reverse-playing');
assert(policy.includes('shouldPauseMedia: reverse'), 'reverse audio policy must pause media');

const audio = read('src/features/video-studio/playback/components/RealAudioElement.tsx');
assert(audio.includes('playbackDirection?: PlaybackDirection;'), 'audio direction prop missing');
assert(audio.includes('playbackFps?: number;'), 'audio fps prop missing');
assert(audio.includes('resolvePlaybackAudioPolicy'), 'audio policy must be applied to RealAudioElement');
assert(audio.includes('muted: mix.muted || isMuted || playbackAudioPolicy.muted'), 'reverse audio policy must reach audio mix');
assert(audio.includes('playbackFps, playbackSessionId, playbackSessionRevision });'), 'audio sync session must receive fps and playback session fence');

const video = read('src/features/video-studio/playback/components/RealVideoElement.tsx');
assert(video.includes('playbackFps?: number;'), 'video fps prop missing');
assert(video.includes('resolvePlaybackAudioPolicy'), 'video embedded audio must honor reverse policy');
assert(video.includes('playbackFps, playbackSessionId, playbackSessionRevision });'), 'video sync session must receive fps and playback session fence');

const player = read('src/components/player/VideoPlayer.tsx');
assert(player.includes('playbackFps={projectFps}'), 'project fps must reach media presentation components');
assert(player.includes('playbackDirection={playbackDirection}'), 'playback direction must reach audio and video');

console.log('PHASE78_REVERSE_FRAME_SCHEDULER_AUDIO_POLICY = PASS');
