const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const hitTestPath = path.join(root, 'src/features/video-studio/timeline/controllers/timelineHitTest.ts');
const geometryPath = path.join(root, 'src/features/video-studio/timeline/geometry/timelineGeometry.ts');
for (const file of [dragPath, hitTestPath, geometryPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}
const drag = fs.readFileSync(dragPath, 'utf8');
const hit = fs.readFileSync(hitTestPath, 'utf8');
const geometry = fs.readFileSync(geometryPath, 'utf8');
function must(re, text, label) {
  if (!re.test(text)) throw new Error(`FAIL: ${label}`);
}

must(/createTimelineHitTestIndex\(workspaceElement\)[\s\S]*hitTestIndexRef\.current = currentHitTestIndex/, drag, 'pointer move refreshes hit-test after scroll/virtualization changes');
must(/const workspaceRect = workspaceElement\.getBoundingClientRect\(\);/, drag, 'drag uses current workspace geometry instead of stale start rectangle');
must(/const autoScrollEdgePx = 40;/, drag, 'auto-scroll uses a symmetric edge boundary');
must(/TIMELINE_HEADER_WIDTH \+ autoScrollEdgePx/, drag, 'left auto-scroll excludes the timeline header from the content edge');
must(/findTrackAtClientY\(currentHitTestIndex, e\.clientY, workspaceElement\.scrollTop\)/, drag, 'vertical track selection uses current hit-test rows');
must(/const finalHitTestIndex = finalWorkspace[\s\S]*createTimelineHitTestIndex\(finalWorkspace\)/, drag, 'pointerup refreshes drop hit-test before committing destination row');
must(/export function pixelToTime/, geometry, 'canonical pixel-to-time conversion remains centralized');
must(/export function findTrackAtClientY/, hit, 'track hit-test remains a dedicated service');

console.log('PHASE49_TIMELINE_DRAG_COORDINATE_INTEGRITY=PASS');
