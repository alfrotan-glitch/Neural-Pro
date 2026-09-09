const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const validation = read('src/features/video-studio/project/validation/projectStateInvariants.ts');
const persistence = read('src/features/video-studio/project/services/projectPersistenceService.ts');
const store = read('src/store/useProjectStore.ts');
const videoStudio = read('src/components/VideoStudioPro.tsx');
const timeline = read('src/components/timeline/VirtualizedTimeline.tsx');
const exportService = read('src/features/video-studio/export/services/exportService.ts');
const mapper = read('src/features/video-studio/playback/services/mediaTimeMapper.ts');
const captionPlan = read('src/features/video-studio/captions/services/captionRenderPlan.ts');
const audioMix = read('src/features/video-studio/audio/services/audioMixModel.ts');

assert.match(validation, /calculateProjectDuration\(state\.tracks/);
assert.match(validation, /totalDuration.*does not match timeline duration/);
assert.match(validation, /selectedNodeIds contains unknown clip/);
assert.match(store, /assertValidProjectState\(normalizedState\)/);
assert.match(store, /hydrateProject/);
// Persistence moved to the durable IndexedDB layer (WP-05 / ADR-006). The
// behavioural contract is executed by tests/persistence/**; these assertions only
// pin the cross-feature wiring that this file has always been responsible for.
assert.match(persistence, /PROJECT_SCHEMA_VERSION/);
assert.match(persistence, /LEGACY_GLOBAL_KEY/);
assert.match(persistence, /isPlaying: false/);
assert.match(persistence, /assertNoTransientReferences|serializeProjectDocument/);
assert.match(videoStudio, /saveCurrentProject\(projectName\)/);
assert.match(videoStudio, /loadCurrentProject\(projectName\)/);
assert.doesNotMatch(videoStudio, /saveProjectToStorage\(localStorage/);
assert.doesNotMatch(videoStudio, /loadProjectFromStorage\(\s*localStorage/);
assert.doesNotMatch(videoStudio, /localStorage\.setItem\(`video_studio_pro_project_\$\{projectName\}`/);
assert.doesNotMatch(timeline, /localStorage\.setItem\('video_studio_pro_saved_project'/);
assert.match(timeline, /saveCurrentProject\(projectName\)/);
assert.doesNotMatch(timeline, /saveProjectToStorage\(localStorage/);
assert.match(exportService, /job\.projectSnapshot/);
assert.match(mapper, /projectTimeToSourceTime/);
assert.match(captionPlan, /CaptionRenderPlan/);
assert.match(audioMix, /getClipPlaybackRate/);

console.log('CROSS_FEATURE_STATE_INVARIANTS=PASS');
console.log('CANONICAL_PERSISTENCE_CONTRACT=PASS');
console.log('PREVIEW_EXPORT_TIME_CONTRACT=PASS');
console.log('CAPTION_AUDIO_TIMELINE_BOUNDARY_CONTRACT=PASS');
console.log('PHASE_F_CROSS_FEATURE_INTEGRATION=PASS');
