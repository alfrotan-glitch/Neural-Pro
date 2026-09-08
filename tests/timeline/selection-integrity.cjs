const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const validation = read('src/features/video-studio/project/validation/projectStateInvariants.ts');
const store = read('src/store/useProjectStore.ts');
const history = read('src/store/useHistoryStore.ts');

assert.match(validation, /export function normalizeSelectedNodeIds\(/);
assert.match(validation, /knownClipIds = new Set\(tracks\.flatMap/);
assert.match(validation, /seen = new Set<string>\(\)/);

// Selection must be normalized at the public setter boundary.
assert.match(store, /setSelectedNodeIds: \(ids: UUID\[\]\) => \{[\s\S]*normalizeSelectedNodeIds\(state\.tracks, ids\)/);

// Command execution must reconcile selection BEFORE assertValidProjectState.
const executeStart = store.indexOf('executeCommand: (command: Command) => {');
const executeEnd = store.indexOf('\n  }\n}));', executeStart);
assert.ok(executeStart >= 0 && executeEnd > executeStart, 'executeCommand block must be found');
const executeBody = store.slice(executeStart, executeEnd);
const normalizePos = executeBody.indexOf('selectedNodeIds: normalizeSelectedNodeIds');
const validatePos = executeBody.indexOf('assertValidProjectState(normalizedState)');
assert.ok(normalizePos >= 0 && validatePos >= 0 && normalizePos < validatePos, 'selection normalization must occur before validation');

// Undo/redo share the same transaction boundary.
assert.match(history, /selectedNodeIds: normalizeSelectedNodeIds\(previousProjectState\.tracks/);
assert.match(history, /selectedNodeIds: normalizeSelectedNodeIds\(nextProjectState\.tracks/);

// Hydration also uses the same canonical normalizer.
assert.match(store, /selectedNodeIds: normalizeSelectedNodeIds\(tracks, state\.selectedNodeIds\)/);
assert.match(store, /selectedNodeIds: normalizeSelectedNodeIds\(project\.tracks, project\.selectedNodeIds\)/);

console.log('TIMELINE_SELECTION_TRANSACTION_INTEGRITY=PASS');
