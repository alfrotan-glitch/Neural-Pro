const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const machine = read('src/features/video-studio/playback/services/playbackTransitionStateMachine.ts');
assert(machine.includes("'paused' | 'forward' | 'reverse' | 'seeking'"), 'transition modes missing');
assert(machine.includes('revision: number;'), 'transition revision missing');
assert(machine.includes('this.snapshotValue.revision + 1'), 'every transition must increment revision');
assert(machine.includes('playForward()') && machine.includes('playReverse()'), 'direction transitions missing');
assert(machine.includes('seek()'), 'seek transition missing');

const clock = read('src/features/video-studio/playback/services/transportClock.ts');
assert(clock.includes('PlaybackTransitionStateMachine'), 'transport must own transition state machine');
assert(clock.includes('currentTransitionRevision'), 'transport must expose transition revision');
assert(clock.includes('this.transitionMachine.seek();'), 'seek must invalidate transition callbacks');
assert(clock.includes('this.transitionMachine.pause();'), 'pause must invalidate transition callbacks');

const frame = read('src/features/video-studio/playback/services/frameAccurateVideoClock.ts');
assert(frame.includes('callbackTransitionRevision'), 'frame callback must capture transition revision');
assert(frame.includes('transport.currentTransitionRevision !== callbackTransitionRevision'), 'stale direction/state callbacks must be rejected');

const session = read('src/features/video-studio/playback/services/multiMediaSyncController.ts');
assert(session.includes('lastTransitionSignature'), 'media session needs transition signature');
assert(session.includes('this.abortController?.abort();'), 'transition changes must abort previous reconcile');
assert(session.includes('this.lastReverseTarget = Number.NaN;'), 'direction changes must reset reverse target');

console.log('PHASE79_PLAYBACK_TRANSITION_STATE_MACHINE = PASS');
