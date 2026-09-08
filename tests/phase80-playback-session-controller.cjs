const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

const controller = read('src/features/video-studio/playback/services/playbackSessionController.ts');
const transport = read('src/features/video-studio/playback/services/transportClock.ts');
const media = read('src/features/video-studio/playback/services/multiMediaSyncController.ts');
const frame = read('src/features/video-studio/playback/services/frameAccurateVideoClock.ts');
const player = read('src/components/player/VideoPlayer.tsx');
const video = read('src/features/video-studio/playback/components/RealVideoElement.tsx');
const audio = read('src/features/video-studio/playback/components/RealAudioElement.tsx');

const checks = [
  ['controller exposes sessionId + revision', /sessionId:\s*string[\s\S]*revision:\s*number/.test(controller)],
  ['controller invalidates revisions', /invalidate\(\)[\s\S]*revision:\s*this\.snapshotValue\.revision \+ 1/.test(controller)],
  ['controller fences stale session work', /isCurrent\(sessionId: string, revision: number, transactionId\?: string\)/.test(controller)],
  ['VideoPlayer creates master session', /createPlaybackSessionController/.test(player)],
  ['VideoPlayer starts session on playback', /\.begin\(true, playbackDirection, transportTime, activeVideoClipIds\)/.test(player)],
  ['VideoPlayer transitions session on intent change', /\.transition\(true, playbackDirection, transportTime\)/.test(player)],
  ['VideoPlayer stops session atomically', /\.stop\(transportTime\)/.test(player)],
  ['Video frames carry session fence', /callbackSessionId = options\.sessionId/.test(frame) && /isSessionCurrent/.test(frame)],
  ['Media session carries session fence', /playbackSessionId\?/.test(media) && /playbackSessionRevision\?/.test(media)],
  ['RealVideo receives master session', /playbackSessionId=\{playbackSession\.sessionId\}/.test(player)],
  ['RealAudio accepts master session', /playbackSessionId\?/.test(audio)],
  ['RealVideo forwards session to frame clock', /sessionId: playbackSessionId/.test(video) && /sessionRevision: playbackSessionRevision/.test(video)],
  ['animation evaluation remains read-only', !/executeCommand\(/.test(read('src/features/video-studio/animation/services.ts'))],
  ['Transport remains the project-time source', /getTransportClock\(\)/.test(frame)],
  ['active video layer declaration precedes barrier use', player.indexOf('const activeVideoLayers = previewCompositorPlan.byRole.video;') < player.indexOf('const activeVideoClipIds = useMemo(')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('PHASE80_PLAYBACK_SESSION_CONTROLLER = PASS');
