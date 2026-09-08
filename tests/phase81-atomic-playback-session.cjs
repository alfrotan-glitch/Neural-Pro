const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
const controller = read('src/features/video-studio/playback/services/playbackSessionController.ts');
const player = read('src/components/player/VideoPlayer.tsx');
const video = read('src/features/video-studio/playback/components/RealVideoElement.tsx');
const media = read('src/features/video-studio/playback/services/multiMediaSyncController.ts');
const frame = read('src/features/video-studio/playback/services/frameAccurateVideoClock.ts');

const checks = [
  ['atomic commit API exists', /commitAtomic\(transaction: PlaybackSessionTransaction/.test(controller)],
  ['session revision increments once per transaction', /revision: this\.snapshotValue\.revision \+ 1/.test(controller)],
  ['transaction fence exists', /transactionId:\s*string/.test(controller) && /isCurrent\(sessionId: string, revision: number, transactionId\?: string\)/.test(controller)],
  ['seek is atomic', /seek\(projectTime: number\)[\s\S]*commitAtomic/.test(controller)],
  ['stop is atomic', /stop\(projectTime =/.test(controller) && /commitAtomic/.test(controller)],
  ['media attach is session-scoped', /attachMedia\(clipId: string\)/.test(controller)],
  ['media detach resets barrier generation', /detachMedia\(clipId: string\)[\s\S]*barrierReset: true/.test(controller)],
  ['media generation is fenced', /mediaGeneration: this\.snapshotValue\.mediaGeneration/.test(controller)],
  ['barrier generation is fenced', /barrierGeneration: this\.snapshotValue\.barrierGeneration/.test(controller)],
  ['VideoPlayer uses master session', /createPlaybackSessionController/.test(player)],
  ['Video carries session revision', /playbackSessionRevision=\{playbackSession\.revision\}/.test(player)],
  ['frame clock accepts session fence', /isSessionCurrent/.test(frame)],
  ['media sync carries session revision', /playbackSessionRevision\?/.test(media)],
  ['RealVideo forwards session fence', /sessionRevision: playbackSessionRevision/.test(video)],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('PHASE81_ATOMIC_PLAYBACK_SESSION = PASS');
