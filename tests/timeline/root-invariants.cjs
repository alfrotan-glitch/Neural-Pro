const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const store = fs.readFileSync(path.join(root, 'src/store/useProjectStore.ts'), 'utf8');
const command = fs.readFileSync(path.join(root, 'src/features/video-studio/project/commands/updateTrackStateCommand.ts'), 'utf8');
const drag = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');
const invariants = fs.readFileSync(path.join(root, 'src/features/video-studio/project/validation/timelineInvariants.ts'), 'utf8');
const projectCommand = fs.readFileSync(path.join(root, 'src/features/video-studio/project/commands/trackSnapshotCommand.ts'), 'utf8');

const checks = [
  ['track state command exists', /class UpdateTrackStateCommand/.test(command)],
  ['track state command mutates Track model', /isLocked:|isVisible:|isMuted:|isCollapsed:/.test(command)],
  ['store executes track state command', /new UpdateTrackStateCommand\(/.test(store)],
  ['track state cache is derived after command', /trackStates:\s*deriveTrackStates\((nextState|normalizedState)\.tracks\)/.test(store)],
  ['timeline invariants exist', /validateTimelineTracks/.test(invariants) && /assertValidTimelineTracks/.test(invariants)],
  ['project command does not depend on timeline feature', !/features\/video-studio\/timeline\//.test(projectCommand)],
  ['drag no longer writes tracks during pointer move', !/setTracksDirect\(nextTracks\)/.test(drag)],
  ['drag uses RAF draft flush', /requestAnimationFrame\(flushFrame\)/.test(drag)],
  ['drag commits through command', /executeCommand\(cmd\)/.test(drag)],
  ['selection normalized at command boundary', /normalizeSelectedNodeIds\(nextState\.tracks, nextState\.selectedNodeIds\)/.test(store)],
  ['selection normalized before validation', /selectedNodeIds:\s*normalizeSelectedNodeIds\(nextState\.tracks, nextState\.selectedNodeIds\)[\s\S]*assertValidProjectState\(normalizedState\)/.test(store)],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { console.error(`[FAIL] ${name}`); failed++; }
  else console.log(`[PASS] ${name}`);
}
if (failed) process.exit(1);
console.log('TIMELINE_ROOT_FIXES=PASS');
