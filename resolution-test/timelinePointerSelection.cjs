const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts'), 'utf8');
const clip = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineClip.tsx'), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(clip.includes('onPointerDown={(event) => handleClipMouseDown'), 'TimelineClip must use pointerdown for clip interaction');
expect(hook.includes("window.addEventListener('pointermove'"), 'pending interaction must listen to pointermove');
expect(hook.includes("window.addEventListener('pointerup'"), 'pending interaction must listen to pointerup');
expect(hook.includes("window.addEventListener('pointercancel'"), 'pending interaction must cancel on pointercancel');
expect(hook.includes('DRAG_THRESHOLD_PX = 8'), 'drag threshold must be 8px');
expect(hook.includes('setActiveDrag(dragToStart)'), 'active drag must start only after threshold');
expect(!hook.includes('setActiveDrag({'), 'mousedown must not directly activate drag');
const downStart = hook.indexOf('const handleClipMouseDown = useCallback');
const armIndex = hook.indexOf('armPendingDrag({', downStart);
const downBody = hook.slice(downStart, armIndex);
expect(!downBody.includes('structuredClone(tracks)'), 'mousedown must not deep-clone the timeline into ActiveDrag');
expect(hook.includes('initialTracks: structuredClone(tracks)'), 'timeline snapshot must still be created when drag actually activates');
expect(hook.includes('const createActiveDrag = useCallback'), 'active drag creation must be deferred to a dedicated promotion step');
expect(hook.includes('pending.clipRect.left') && hook.includes('pending.clipRect.right'), 'trim hit-testing must use the pending clip geometry');
expect(hook.includes('const edgeThreshold = Math.min(8'), 'trim must use a bounded edge threshold');
expect(clip.includes('cursor-grab'), 'clip must retain move affordance');

if (failures.length) {
  console.error('TIMELINE_POINTER_SELECTION=FAIL');
  failures.forEach((x) => console.error(' - ' + x));
  process.exit(1);
}
console.log('TIMELINE_POINTER_SELECTION=PASS');
