const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const geometry = path.join(root, 'src/features/video-studio/timeline/geometry/timelineGeometry.ts');
const workspace = path.join(root, 'src/features/video-studio/timeline/components/TimelineWorkspace.tsx');
const ruler = path.join(root, 'src/features/video-studio/timeline/components/TimelineRuler.tsx');
const clip = path.join(root, 'src/features/video-studio/timeline/components/TimelineClip.tsx');
const main = path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx');

let failed = 0;
function check(name, condition) {
  if (!condition) { console.error(`[FAIL] ${name}`); failed += 1; }
  else console.log(`[PASS] ${name}`);
}

const g = fs.readFileSync(geometry, 'utf8');
const w = fs.readFileSync(workspace, 'utf8');
const r = fs.readFileSync(ruler, 'utf8');
const c = fs.readFileSync(clip, 'utf8');
const m = fs.readFileSync(main, 'utf8');

check('central geometry service exists', /export function (createTimelineGeometry|timeToPixel|pixelToTime|getVisibleTimeRange)/.test(g));
check('surface width uses max content and viewport', /Math\.max\(TIMELINE_MIN_SURFACE_WIDTH, safeContentWidth, safeViewportWidth\)/.test(g));
check('workspace uses centralized timeToPixel', /timeToPixel\(currentTime/.test(w));
check('workspace uses centralized visible range', /getVisibleTimeRange\(/.test(w));
check('ruler uses centralized geometry', /timeToPixel\(time, basePixelsPerSecond \* timelineZoom\)/.test(r));
check('clip placement uses canonical geometry resolver', /resolveTimelineClipGeometry\(clip, pixelsPerSecond\)/.test(c));
check('clip width uses canonical geometry resolver', /const width = geometry\.widthPx/.test(c));
check('main timeline imports geometry', /timeline\/geometry/.test(m));
check('main timeline no longer scales time by surface width', !/\(relativeX - 160\) \/ timelineWidth/.test(m));
check('playhead converts pixel to time', /pixelToTime\(clickX, pixelsPerSecond\)/.test(m));

if (failed) process.exit(1);
console.log('TIMELINE_GEOMETRY=PASS');
