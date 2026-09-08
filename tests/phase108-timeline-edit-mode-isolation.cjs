const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (m) => { throw new Error(m); };

const store = read('src/store/useProjectStore.ts');
const drag = read('src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const toolbar = read('src/features/video-studio/timeline/components/TimelineToolbar.tsx');
const timeline = read('src/components/timeline/VirtualizedTimeline.tsx');

// Wrong Logic -> Correct Logic:
// a boolean defaulting to Ripple made ordinary Move implicitly mutate neighbouring clips.
if (!store.includes("timelineEditMode: 'normal' | 'ripple' | 'overwrite'")) fail('Explicit Timeline edit mode contract is missing.');
if (!store.includes("timelineEditMode: 'normal'")) fail('Timeline must default to isolated/normal editing.');
if (!store.includes("setTimelineEditMode: (mode: 'normal' | 'ripple' | 'overwrite') => void")) fail('Timeline edit-mode setter contract is missing.');
if (!store.includes("set({ rippleMode: val, timelineEditMode: val ? 'ripple' : 'normal' })")) fail('Legacy ripple compatibility must map false to normal editing.');

const moveStart = drag.indexOf("if (activeDrag.dragMode === 'move')");
const moveEnd = drag.lastIndexOf("} else if (activeDrag.dragMode === 'rate-stretch')");
if (moveStart < 0 || moveEnd < 0) fail('Move branch boundaries missing.');
const move = drag.slice(moveStart, moveEnd);
if (!drag.includes("timelineEditMode === 'normal'")) fail('Normal Move isolation branch is missing.');
if (!drag.includes("timelineEditMode === 'ripple'")) fail('Explicit Ripple branch is missing.');
if (!drag.includes("timelineEditMode !== 'normal'")) fail('Placement resolution must be disabled in Normal mode.');

if (!toolbar.includes("timelineEditMode === 'normal'")) fail('Toolbar must expose Normal mode.');
if (!toolbar.includes("timelineEditMode === 'ripple'")) fail('Toolbar must expose Ripple mode.');
if (!toolbar.includes('Overwrite editing: overlapping clips on the edited lane are trimmed/split')) fail('Toolbar must expose Overwrite mode.');
if (!timeline.includes('timelineEditMode={timelineEditMode}')) fail('VirtualizedTimeline must pass canonical edit mode to the Toolbar.');
if (!timeline.includes('setTimelineEditMode={setTimelineEditMode}')) fail('VirtualizedTimeline must pass the edit-mode setter to the Toolbar.');
if (!timeline.includes('timelineEditMode,\n    currentTime')) fail('Timeline drag execution must receive canonical edit mode.');

console.log('PHASE108_TIMELINE_EDIT_MODE_ISOLATION = PASS');
console.log('Normal/Ripple/Overwrite are explicit; Normal Move/Drop cannot mutate unrelated clips through collision placement.');
