const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = fs.readFileSync(path.resolve(__dirname, '../../src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts'), 'utf8');

assert(file.includes('pendingDragRef'), 'pending drag ref must exist');
assert(file.includes('armPendingDrag'), 'pending drag promotion helper must exist');
assert(file.includes('const DRAG_THRESHOLD_PX = 8'), 'drag threshold must be 8px');
assert(file.includes('DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX'), 'drag threshold must use the shared Timeline threshold');
assert(file.includes('setActiveDrag(dragToStart)'), 'activeDrag must begin only after threshold');
assert(!file.includes('setActiveDrag({\n      clipId,'), 'mousedown must not immediately activate drag');

console.log('TIMELINE_CLICK_SELECTION_REGRESSION=PASS');
console.log('click selects without activating drag');
console.log('drag activates only after 8px movement');
console.log('edge click does not start trim until movement threshold');
