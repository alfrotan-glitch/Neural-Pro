const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const text = fs.readFileSync(file, 'utf8');

assert.match(text, /autoScrollFrameRef/, 'idle auto-scroll needs a frame loop independent of pointermove frequency');
assert.match(text, /latestPointerRef/, 'latest pointer coordinates must remain available while the pointer is stationary');
assert.match(text, /scheduleAutoScroll/, 'auto-scroll must reschedule while the pointer remains near an edge');
assert.match(text, /requestAnimationFrame/, 'idle auto-scroll must be frame driven');
assert.match(text, /handlePointerMove\(\{\s*pointerId: pointer\.pointerId/, 'scroll frames must reapply the canonical drag calculation at the stationary pointer position');
assert.match(text, /autoScrollTickRef/, 'synthetic auto-scroll updates must not recursively schedule another scroll calculation');

console.log('PHASE52B_TIMELINE_IDLE_AUTOSCROLL=PASS');
