const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const drag = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');
const hit = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/timelineHitTest.ts'), 'utf8');
const draft = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/timelineDraftEngine.ts'), 'utf8');

function pass(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`[PASS] ${name}`);
}

pass('timeline hit-test index module exists', /export interface TimelineHitTestIndex/.test(hit));
pass('hit-test uses cached workspace rect', /workspace\.getBoundingClientRect\(\)/.test(hit));
pass('hit-test uses binary search for rows', /while \(low <= high\)/.test(hit));
const moveBody = drag.split('const handleMouseMove = (e: MouseEvent) => {')[1]?.split('const handleMouseUp = (e: MouseEvent) => {')[0] || '';
pass('drag does not call elementFromPoint during pointer move', !moveBody.includes('document.elementFromPoint'));
pass('drag does not call getBoundingClientRect during pointer move', !moveBody.includes('getBoundingClientRect'));
pass('drag uses the current hit-test index for pointer moves', /findTrackAtClientY\(currentHitTestIndex/.test(drag));
pass('drag rebuilds row geometry after scroll', /createTimelineHitTestIndex\(workspaceElement\)/.test(drag));
pass('draft DOM context caches track geometry', /trackTops: Map<string, number>/.test(draft));
pass('draft DOM context caches clip elements', /clipElements: Map<string, HTMLElement>/.test(draft));
pass('draft hot path uses cached clip elements', /context\.clipElements\.get\(clipId\)/.test(draft));
const applyHotPath = (draft.split('export function applyTimelineDraftToDom')[1] || '').split('export function resetTimelineDraftDom')[0] || '';
pass('draft hot path does not query clip DOM nodes', !/querySelector/.test(applyHotPath));
console.log('TIMELINE_HIT_TEST_CACHE=PASS');
