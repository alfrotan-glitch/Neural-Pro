const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const history = fs.readFileSync(path.join(root, 'src/store/useHistoryStore.ts'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/store/useProjectStore.ts'), 'utf8');
const persistence = fs.readFileSync(path.join(root, 'src/features/video-studio/project/services/projectPersistenceService.ts'), 'utf8');

assert.match(history, /resetHistory: \(\) => void/);
assert.match(history, /resetHistory: \(\) => \{\s*set\(\{ past: \[\], future: \[\] \}\);/);
assert.match(store, /useHistoryStore\.getState\(\)\.resetHistory\(\);/);
assert.match(store, /hydrateProject: \(project: ProjectState\)/);
assert.match(persistence, /createPersistedProjectDocument/);
assert.match(persistence, /loadProjectFromStorage/);

console.log('PHASE19_PERSISTENCE_HISTORY_ISOLATION=PASS');
