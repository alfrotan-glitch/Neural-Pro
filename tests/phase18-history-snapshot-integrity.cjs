const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

assert.match(read('src/features/video-studio/project/commands/trackSnapshotCommand.ts'), /this\.previousTracks\s*=\s*\[\.\.\.structuredClone\(previousTracks\)\]/);
assert.match(read('src/features/video-studio/project/commands/trackSnapshotCommand.ts'), /this\.nextTracks\s*=\s*\[\.\.\.structuredClone\(nextTracks\)\]/);

assert.match(read('src/features/video-studio/project/commands/updateClipPropertiesCommand.ts'), /this\.previousSnapshots\s*=\s*cloneValue/);
assert.match(read('src/features/video-studio/project/commands/updateClipPropertiesCommand.ts'), /this\.nextSnapshots\s*=\s*cloneValue/);

assert.match(read('src/features/video-studio/overlays/commands/updateCyberpunkSubscribePropertiesCommand.ts'), /this\.previous\s*=\s*structuredClone/);
assert.match(read('src/features/video-studio/overlays/commands/updateCyberpunkSubscribePropertiesCommand.ts'), /this\.next\s*=\s*structuredClone/);

const clipCommands = read('src/features/video-studio/timeline/commands/clipCommands.ts');
assert.match(clipCommands, /structuredClone\(\{ \.\.\.targetClip, startAt: targetStart \}\)/);
assert.match(clipCommands, /this\.prevTransform\s*=\s*structuredClone/);
assert.match(clipCommands, /this\.originalClip\s*=\s*structuredClone/);

const history = read('src/store/useHistoryStore.ts');
assert.match(history, /command\.undo\(currentProjectState\)/);
assert.match(history, /command\.execute\(currentProjectState\)/);
assert.match(history, /assertValidProjectState\(normalizedPreviousState\)/);
assert.match(history, /assertValidProjectState\(normalizedNextState\)/);
assert.match(history, /future: \[command, \.\.\.future\]/);
assert.match(history, /past: \[\.\.\.past, command\]/);

console.log('PHASE18_HISTORY_SNAPSHOT_INTEGRITY=PASS');
