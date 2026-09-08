const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const drag = read('src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const hit = read('src/features/video-studio/timeline/controllers/timelineHitTest.ts');
const row = read('src/features/video-studio/timeline/components/TimelineTrackRow.tsx');
const multi = read('src/features/video-studio/timeline/services/multiSelectionDragService.ts');
const project = read('src/features/video-studio/project/services/projectService.ts');

assert.match(drag, /trackLaneRole/);
assert.match(drag, /sourceLaneRole = \(sourceTrack\.laneRole \?\? sourceTrack\.type\)/);
assert.match(drag, /A clip may never be dropped into a different semantic lane/);
assert.match(drag, /const newTrack: Track = \{/);
assert.match(drag, /laneRole: sourceLaneRole as Track\['laneRole'\]/);
assert.match(multi, /orderedTrackIds: readonly string\[\] = tracks\.map/);
assert.match(multi, /sourceLaneRole = sourceTrack\.laneRole \?\? sourceTrack\.type/);
assert.match(multi, /targetLaneRole = targetTrack\.laneRole \?\? targetTrack\.type/);
assert.match(hit, /trackLaneRole: string/);
assert.match(hit, /data-track-lane-role|trackLaneRole/);
assert.match(row, /data-track-lane-role=\{props\.track\.laneRole \?\? props\.track\.type\}/);
assert.match(project, /createDedicatedTimelineTrack/);

console.log('PHASE30_TRACK_PLACEMENT_CONTRACT=PASS');
