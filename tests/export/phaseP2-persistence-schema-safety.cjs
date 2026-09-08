const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));

const root = path.resolve(__dirname, '../..');
const persistencePath = path.join(root, 'src/features/video-studio/project/services/projectPersistenceService.ts');
const source = fs.readFileSync(persistencePath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('candidate.schemaVersion === undefined'), 'legacy persistence must be recognized explicitly');
assert(source.includes('Unsupported persisted project schema version'), 'unknown future schema must be rejected instead of treated as legacy');

const out = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  fileName: persistencePath,
}).outputText;

// Verify the decision branch in the actual transpiled implementation without requiring browser storage/dependencies.
const moduleObj = { exports: {} };
const fallback = {
  projectId: 'fallback',
  metadata: { title: 'Fallback', resolution: { width: 1920, height: 1080 }, fps: 30 },
  currentTime: 0,
  totalDuration: 0,
  tracks: [],
  selectedNodeIds: [],
  isPlaying: false,
};
const injectedRequire = (request) => {
  if (request.includes('projectStateInvariants')) return { assertValidProjectState: () => {} };
  if (request.includes('projectDuration')) return { calculateProjectDuration: () => 0, clampProjectTime: (t) => t };
  if (request.includes('cyberpunkSubscribeModel')) return { normalizeCyberpunkSubscribeProperties: (value) => value || {} };
  throw new Error(`unexpected require: ${request}`);
};
vm.runInNewContext(out, { module: moduleObj, exports: moduleObj.exports, require: injectedRequire, console, structuredClone }, { filename: persistencePath });
const { deserializeProject } = moduleObj.exports;

let rejected = false;
try {
  deserializeProject(JSON.stringify({ schemaVersion: 999, project: { tracks: [] } }), fallback);
} catch (error) {
  rejected = String(error?.message || error).includes('Unsupported persisted project schema version');
}
assert(rejected, 'unsupported persistence schema must be rejected');
console.log('PHASE_P2_PERSISTENCE_SCHEMA_SAFETY=PASS');
