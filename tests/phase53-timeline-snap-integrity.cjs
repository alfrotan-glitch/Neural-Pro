const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const snapPath = path.join(root, 'src/features/video-studio/timeline/engine/snapIndex.ts');
const resizePath = path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts');

const drag = fs.readFileSync(dragPath, 'utf8');
const snap = fs.readFileSync(snapPath, 'utf8');
const resize = fs.readFileSync(resizePath, 'utf8');

assert.match(drag, /isResizeDeltaFeasible/, 'resize snap must validate candidate feasibility before displaying snap guide');
assert.match(drag, /minimumDuration: 0\.2/, 'snap feasibility must use the interaction minimum duration');
assert.match(drag, /Never display a snap guide that the actual resize cannot honor/, 'invalid snap candidates must be rejected rather than visually advertised');
assert.match(snap, /getEffectiveClipEnd\(clip\)/, 'snap index must use effective playable clip end');
assert.match(resize, /MIN_TIMELINE_CLIP_DURATION = 0\.05/, 'resize engine minimum-duration invariant must remain explicit');

console.log('PHASE53_TIMELINE_SNAP_FEASIBILITY=PASS');
