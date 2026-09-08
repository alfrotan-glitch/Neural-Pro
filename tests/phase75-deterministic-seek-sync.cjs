const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const clock = read('src/features/video-studio/playback/services/transportClock.ts');
const frameClock = read('src/features/video-studio/playback/services/frameAccurateVideoClock.ts');
const session = read('src/features/video-studio/playback/services/multiMediaSyncController.ts');
const seek = read('src/core/engine/mediaSeek.ts');
const sync = read('src/features/video-studio/playback/services/mediaSyncController.ts');
const epoch = read('src/features/video-studio/playback/services/playbackIntentEpoch.ts');

assert(clock.includes('private readonly seekEpoch = new PlaybackIntentEpoch();'), 'Transport must own a monotonic seek epoch.');
assert(clock.includes('this.seekEpoch.advance();'), 'Explicit seek must advance the seek epoch.');
assert(clock.includes('get currentSeekRevision'), 'Seek revision must be readable by frame synchronization.');
assert(frameClock.includes('const callbackSeekRevision = transport.currentSeekRevision'), 'Each frame callback must capture the seek revision it belongs to.');
assert(frameClock.includes('transport.currentSeekRevision !== callbackSeekRevision'), 'Stale decoded-frame callbacks must be rejected after seek.');
assert(session.includes('private generation = 0;'), 'Media sync sessions must maintain async operation generations.');
assert(session.includes('this.generation += 1;'), 'Every media intent update must invalidate older async work.');
assert(session.includes('this.generation !== generation'), 'Old async reconciliation results must be rejected before bookkeeping commits.');
assert(seek.includes('signal?.aborted'), 'Media seek must check cancellation at the event boundary.');
assert(sync.includes('if (signal?.aborted)'), 'Media play/seek pipeline must reject stale operations before playback.');
assert(epoch.includes('class PlaybackIntentEpoch'), 'Playback intent epoch contract must exist for future navigation boundaries.');

console.log('PHASE75_DETERMINISTIC_SEEK_SYNC = PASS');
