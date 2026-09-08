const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

const drag = read('src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const resize = read('src/features/video-studio/timeline/services/timelineResizeService.ts');
const project = read('src/features/video-studio/project/services/projectService.ts');
const subscribe = read('src/components/subscribe-generator/SettingsPanel.tsx');
const inspector = read('src/components/inspector/InspectorEngine.tsx');
const board = read('src/features/video-studio/timeline/components/TimelineTrackBoard.tsx');

ok(resize.includes('export function resizeSelectedClips'), 'resize service must exist');
ok(resize.includes("side: 'left' | 'right'"), 'resize service must support both edges');
ok(drag.includes("activeDrag.dragMode === 'trim-left' || activeDrag.dragMode === 'trim-right' || activeDrag.dragMode === 'rate-stretch'"), 'pointerup must recognize pure resize modes');
ok(drag.includes('Never run') && drag.includes('Ripple/Overwrite after a trim/rate gesture'), 'resize commit must explicitly bypass placement resolution');
ok(project.includes('export function createDedicatedTimelineTrack'), 'dedicated track factory must be exported');
ok(project.includes('createDedicatedTimelineTrack(tracks, role, clip)') || project.includes('createDedicatedTimelineTrack(tracks, laneRole, newClip)'), 'asset insertion must create a dedicated track');
ok(subscribe.includes("smartInsertClip(tracks, 'subscribe', newClip)") || subscribe.includes("createDedicatedTimelineTrack(tracks, 'subscribe', newClip)"), 'subscribe must use a dedicated lane');
ok(inspector.includes("smartInsertClip(tracks, 'caption', newClip)") || inspector.includes("createDedicatedTimelineTrack(tracks, 'caption', newClip)"), 'manual caption must use a dedicated lane');
ok(board.includes('a.laneRole ?? a.type'), 'track board must sort by semantic lane role');
ok(board.includes("caption: 1") && board.includes("subscribe: 4") && board.includes("sticker: 5"), 'track role order must include dedicated categories');
console.log('PHASE29_TIMELINE_RESIZE_AND_DEDICATED_TRACKS=PASS');
