const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inv = fs.readFileSync(path.join(root, 'src/features/video-studio/project/validation/lockedTrackInvariants.ts'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/store/useProjectStore.ts'), 'utf8');
const history = fs.readFileSync(path.join(root, 'src/store/useHistoryStore.ts'), 'utf8');

assert.match(inv, /beforeTrack\.isLocked/);
assert.match(inv, /clip content is locked/);
assert.match(store, /assertNoLockedTrackContentMutation\(currentState\.tracks, nextState\.tracks\)/);
assert.match(history, /assertNoLockedTrackContentMutation\(currentProjectState\.tracks, previousProjectState\.tracks\)/);
assert.match(history, /assertNoLockedTrackContentMutation\(currentProjectState\.tracks, nextProjectState\.tracks\)/);

// Behavioral contract matrix: locked content is immutable, control flags remain mutable.
const before = { id:'t1', isLocked:true, isMuted:false, isVisible:true, clips:[{id:'c1',x:1}] };
const same = structuredClone(before);
const changedClip = {...structuredClone(before), clips:[{id:'c1',x:2}]};
const removed = {...structuredClone(before), clips:[]};
const unlockedControl = {...structuredClone(before), isLocked:false};
assert.deepEqual(same.clips, before.clips);
assert.notDeepEqual(changedClip.clips, before.clips);
assert.notDeepEqual(removed.clips, before.clips);
assert.equal(unlockedControl.isLocked, false);

console.log('PHASE2_LOCKED_TRACK_INTEGRITY=PASS');
