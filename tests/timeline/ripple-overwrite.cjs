const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../../src/features/video-studio/timeline/services/timelineEditingEngine.ts');
const source = fs.readFileSync(servicePath, 'utf8');

assert.match(source, /applyRipplePlacement/);
assert.match(source, /applyOverwritePlacement/);
assert.match(source, /preserveLockedClips/);
assert.match(source, /generateUUID/);
assert.match(source, /minClipDuration/);
assert.doesNotMatch(source, /Date\.now\(\).*Math\.random/);
assert.match(source, /Overwrite.*destructive mode|Fully covered by active clip: remove/s);
assert.match(source, /Active clip punches a hole in the middle/);
assert.match(source, /Track-level mutation guard/);
assert.match(source, /Clip-level locking is not part of the current ClipNode model/);

const service = fs.readFileSync(path.resolve(__dirname, '../../src/features/video-studio/timeline/services/timelineService.ts'), 'utf8');
assert.match(service, /applyRipplePlacement/);
assert.match(service, /applyOverwritePlacement/);

console.log('TIMELINE_RIPPLE_OVERWRITE_ENGINE=PASS');
