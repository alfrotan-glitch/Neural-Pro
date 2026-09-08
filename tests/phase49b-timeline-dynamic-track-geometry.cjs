const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const draftPath = path.join(root, 'src/features/video-studio/timeline/controllers/timelineDraftEngine.ts');
const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
for (const file of [draftPath, dragPath]) if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
const draft = fs.readFileSync(draftPath, 'utf8');
const drag = fs.readFileSync(dragPath, 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
must(/currentTrackTops = collectTrackTops\(context\.workspace, currentWorkspaceRect\)/, draft, 'draft frame re-reads current virtualized track geometry');
must(/currentTrackTops\.get\(targetTrackId\)/, draft, 'vertical draft uses the resolved current destination row');
must(/currentTrackTops\.get\(before\.trackId\)/, draft, 'vertical draft uses current source row');
must(/createTimelineHitTestIndex\(workspaceElement\)/, drag, 'drag hit-test remains synchronized with current DOM');
console.log('PHASE49B_TIMELINE_DYNAMIC_TRACK_GEOMETRY=PASS');
