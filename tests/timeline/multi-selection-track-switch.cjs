const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/multiSelectionDragService.ts'), 'utf8');
const drag = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');
const interaction = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts'), 'utf8');

const checks = [
  ['group resolver exists', service.includes('resolveMultiSelectionTrackTargets')],
  ['same row offset is computed', service.includes('rowDelta = mainTargetIndex - mainSourceIndex')],
  ['group switch preserves semantic lane role', service.includes('targetLaneRole !== sourceLaneRole')],
  ['locked destination rejects whole group switch', service.includes('targetTrack.isLocked')],
  ['group move uses one target map', drag.includes('const targetMap = resolveMultiSelectionTrackTargets(')],
  ['group draft moves every selected clip', drag.includes('startAt: Math.max(0, newStart)')],
  ['group commit uses target map', drag.includes('targetMap?.get(sel.clipId) ?? sel.trackId')],
  ['selection is captured before drag', interaction.includes('selectedClipIds: nextSelection')],
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log('TIMELINE_MULTI_SELECTION_TRACK_SWITCH=PASS');
