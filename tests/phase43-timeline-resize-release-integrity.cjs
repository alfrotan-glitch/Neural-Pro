const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const files = {
  drag: path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'),
  resize: path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts'),
  placement: path.join(root, 'src/features/video-studio/timeline/services/timelineTrackPlacementService.ts'),
};
for (const [name, p] of Object.entries(files)) if (!fs.existsSync(p)) throw new Error(`Missing ${name}: ${p}`);
const drag = fs.readFileSync(files.drag, 'utf8');
const resize = fs.readFileSync(files.resize, 'utf8');
const placement = fs.readFileSync(files.placement, 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
must(/const didCommit = initialStr !== finalStr;/, drag, 'explicit commit boundary');
must(/requestAnimationFrame\(\(\) => resetTimelineDraftDom\(committedWorkspace\)\)/, drag, 'deferred draft reset after commit');
must(/nextDuration = Math\.max\(minDuration, clip\.duration \+ options\.deltaTime\)/, resize, 'resize starts from canonical duration');
must(/sourceMediaDuration/, resize, 'source-media duration support');
must(/placeSingleClipOnCrossTrackDrop[\s\S]*laneRole/i, placement, 'cross-track destination uses semantic lane placement');
console.log('PHASE43_TIMELINE_RESIZE_RELEASE_INTEGRITY=PASS');
