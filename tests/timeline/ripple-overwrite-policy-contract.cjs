const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const engine = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineEditingEngine.ts'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineService.ts'), 'utf8');

assert.match(engine, /return !trackLocked;/, 'Mutation must never bypass a locked track.');
assert.match(engine, /let effectiveActiveStart = active\.startAt;/, 'Ripple must derive a legal active start at the canonical boundary.');
assert.match(engine, /effectiveActiveStart = clipEnd\(clip\);/, 'Ripple must resolve an editable left overlap using clip end.');
assert.match(engine, /never trims or deletes[\s\S]*exists before the active clip/i, 'Ripple must document its non-destructive preceding-clip rule.');
assert.match(service, /applyOverwritePlacement\(syntheticTrack, activeClipId, DEFAULT_POLICY\)/, 'Timeline service must use the canonical overwrite policy.');
assert.doesNotMatch(service, /preserveLockedClips:\s*false/, 'Timeline service must not have a second destructive overwrite policy.');

console.log('TIMELINE_RIPPLE_OVERWRITE_POLICY_CONTRACT=PASS');
