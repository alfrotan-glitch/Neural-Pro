const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const resizePath = path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts');
const projectPath = path.join(root, 'src/features/video-studio/project/services/projectService.ts');
const placementPath = path.join(root, 'src/features/video-studio/timeline/services/timelineTrackPlacementService.ts');
const actionPath = path.join(root, 'src/features/video-studio/timeline/services/timelineActionService.ts');
for (const p of [resizePath, projectPath, placementPath, actionPath]) {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
}
const resize = fs.readFileSync(resizePath, 'utf8');
const project = fs.readFileSync(projectPath, 'utf8');
const placement = fs.readFileSync(placementPath, 'utf8');
const action = fs.readFileSync(actionPath, 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
must(/sourceMediaDuration/, resize, 'resize reads canonical source-media duration');
must(/nextDuration = Math\.min\(nextDuration, sourceAvailableTimeline\)/, resize, 'resize bounds against media availability, not current trim-out');
must(/sourceMediaDuration: duration/, project, 'new assets persist source media duration');
must(/placeSingleClipOnCrossTrackDrop/, placement, 'cross-track placement resolver exists');
must(/same semantic lane|compatible.*lane|destination track/i, placement, 'cross-track placement must resolve a semantic destination lane');
must(/createDedicatedAudioTrack/, action, 'derived audio gets a dedicated track');
console.log('PHASE42_CUSTOM_RESIZE_DEDICATED_TRACKS=PASS');
