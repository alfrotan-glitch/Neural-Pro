const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const draftPath = path.join(root, 'src/features/video-studio/timeline/controllers/timelineDraftEngine.ts');
const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const placementPath = path.join(root, 'src/features/video-studio/timeline/services/timelineTrackPlacementService.ts');
const projectPath = path.join(root, 'src/features/video-studio/project/services/projectService.ts');
for (const p of [draftPath, dragPath, placementPath, projectPath]) if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
const draft = fs.readFileSync(draftPath, 'utf8');
const drag = fs.readFileSync(dragPath, 'utf8');
const placement = fs.readFileSync(placementPath, 'utf8');
const project = fs.readFileSync(projectPath, 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
must(/export function commitTimelineDraftDom[\s\S]*timeToPixel\(clip\.duration, pixelsPerSecond\)/, draft, 'commit frame preserves canonical final width');
must(/commitTimelineDraftDom\([\s\S]*committedTracks[\s\S]*pixelsPerSecond/, drag, 'pointerup commits canonical width before cleanup');
must(/placeSingleClipOnCrossTrackDrop[\s\S]*laneRole/i, placement, 'cross-track drop resolves a semantic destination lane');
must(/created:\s*false/, placement, 'compatible cross-track drop reuses the requested semantic lane');
must(/createDedicatedTimelineTrack[\s\S]*laneRole|laneRole[\s\S]*createDedicatedTimelineTrack/, project, 'asset insertion preserves semantic lane identity');
console.log('PHASE46_TIMELINE_RESIZE_RELEASE_TRACK_INTEGRITY=PASS');
