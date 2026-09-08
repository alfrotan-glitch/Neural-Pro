const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const bounds = fs.readFileSync(path.join(root, 'src/features/video-studio/project/time/clipBounds.ts'), 'utf8');
const snap = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/engine/snapIndex.ts'), 'utf8');
const timeline = fs.readFileSync(path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx'), 'utf8');
const editingEngine = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineEditingEngine.ts'), 'utf8');
const trackRow = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineTrackRow.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/export function getEffectiveClipEnd\(clip: ClipNode\)/.test(bounds), 'effective clip end helper missing');
assert(/getCanonicalClipTimelineDuration\(clip\)/.test(bounds), 'effective clip end must use canonical duration');
assert(/getEffectiveClipEnd\(clip\)/.test(snap), 'snap index must use playable clip end');
assert(/getEffectiveClipEnd\(clip\)/.test(timeline), 'media-backed timeline operations must use playable clip end');
assert(editingEngine.includes('clip.startAt + clip.duration'), 'editing engine must preserve Timeline interval duration semantics');
assert(/resolveTimelineClipGeometry\(clip, pixelsPerSecond\)/.test(trackRow), 'timeline visual layout must use the canonical Timeline geometry resolver');
console.log('PHASE_P1_TIMELINE_PLAYABLE_BOUNDARIES=PASS');
