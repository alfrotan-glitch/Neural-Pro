const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sessionPath = path.join(root, 'src/features/video-studio/playback/services/multiMediaSyncController.ts');
const playerPath = path.join(root, 'src/components/player/VideoPlayer.tsx');
const audioElementPath = path.join(root, 'src/features/video-studio/playback/components/RealAudioElement.tsx');
const videoElementPath = path.join(root, 'src/features/video-studio/playback/components/RealVideoElement.tsx');
const syncPath = path.join(root, 'src/features/video-studio/playback/services/mediaSyncController.ts');

const session = fs.readFileSync(sessionPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');
const audioElement = fs.readFileSync(audioElementPath, 'utf8');
const videoElement = fs.readFileSync(videoElementPath, 'utf8');
const sync = fs.readFileSync(syncPath, 'utf8');

assert.match(session, /class MediaSyncSession/);
assert.match(session, /reconcileInFlight/);
assert.match(session, /correctionIntervalMs/);
assert.match(session, /requestAnimationFrame\(this\.tick\)/);
assert.match(session, /syncMediaElementToClip/);

// React should update the stable session, not create an AbortController per transport update.
assert.doesNotMatch(player, /syncAbortRef/);
assert.doesNotMatch(player, /syncMediaElementToClip\(/);
assert.doesNotMatch(player, /createMediaSyncSession/);
assert.match(audioElement, /session\.update\(\{[\s\S]*clip,[\s\S]*projectTime: activeTime,[\s\S]*isPlaying/);
assert.match(videoElement, /session\.update\(\{[\s\S]*clip,[\s\S]*projectTime: activeTime,[\s\S]*isPlaying/);
assert.match(audioElement, /syncSessionRef\.current\?\.forceSync\(\)/);
assert.match(videoElement, /syncSessionRef\.current\?\.forceSync\(\)/);

// The underlying sync controller must still perform drift correction instead of blindly seeking every frame.
assert.match(sync, /drift > tolerance/);
assert.match(sync, /media\.play\(\)/);
assert.match(sync, /media\.pause\(\)/);

console.log('TIMELINE_PLAYER_MULTI_MEDIA_SYNC=PASS');
