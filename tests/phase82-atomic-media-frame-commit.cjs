const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
const commit = read('src/features/video-studio/playback/services/atomicMediaFrameCommit.ts');
const player = read('src/components/player/VideoPlayer.tsx');
const barrier = read('src/features/video-studio/playback/services/presentedFrameBarrier.ts');

const checks = [
  ['atomic commit service exists', /resolveAtomicMediaFrameCommit/.test(commit)],
  ['commit includes session revision', /sessionRevision: input\.session\.revision/.test(commit)],
  ['commit includes barrier generation', /barrierGeneration: input\.session\.barrierGeneration/.test(commit)],
  ['commit includes transaction fence', /transactionId: input\.session\.transactionId/.test(commit)],
  ['commit exposes epoch key', /epochKey/.test(commit) && /join\(': '\)/.test(commit) === false],
  ['current check fences all session dimensions', /commit\.sessionId === session\.sessionId[\s\S]*commit\.sessionRevision === session\.revision[\s\S]*commit\.barrierGeneration === session\.barrierGeneration[\s\S]*commit\.transactionId === session\.transactionId/.test(commit)],
  ['VideoPlayer consumes atomic commit', /resolveAtomicMediaFrameCommit/.test(player)],
  ['VideoPlayer retains only current committed epoch', /isAtomicMediaFrameCommitCurrent\(lastAtomicMediaFrameCommitRef\.current, playbackSession\)/.test(player)],
  ['VideoPlayer no longer consumes barrier directly', !/resolvePresentedFrameBarrier/.test(player)],
  ['barrier remains pure', !/setState|executeCommand|updateNodesProperty/.test(barrier)],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('PHASE82_ATOMIC_MEDIA_FRAME_COMMIT = PASS');
