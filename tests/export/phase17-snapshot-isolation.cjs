const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const store = read('src/store/useExportStore.ts');
const service = read('src/features/video-studio/export/services/exportService.ts');
const app = read('src/components/VideoStudioPro.tsx');
const pipeline = read('src/core/engine/RenderPipeline.ts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

assert(store.includes('settings: structuredClone(settings)'), 'Export job settings are deep-cloned at queue creation');
assert(store.includes('projectSnapshot: structuredClone(projectSnapshot)'), 'Export project snapshot is deep-cloned at queue creation');
assert(service.includes('return structuredClone(snapshot);'), 'Project snapshot factory deep-clones the complete snapshot');
assert(app.includes('activeExportSettingsRef.current = structuredClone(settings);'), 'Active export settings are isolated from the caller object');
assert(app.includes('const projectSnapshot = createExportProjectSnapshot(useProjectStore.getState());'), 'Export captures project snapshot synchronously at job creation');
assert(app.includes('const projectSnapshot = activeExportProjectSnapshotRef.current'), 'Render path reads the captured snapshot');
assert(!app.includes('activeExportProjectSnapshotRef.current = useProjectStore.getState()'), 'Render path does not replace snapshot with live project state');
assert(pipeline.includes('job.projectSnapshot'), 'Render pipeline consumes the queued job snapshot');
console.log('PHASE17_EXPORT_SNAPSHOT_ISOLATION=PASS');
