const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (m) => { throw new Error(m); };

const geometry = read('src/features/video-studio/timeline/geometry/timelineClipGeometry.ts');
const clip = read('src/features/video-studio/timeline/components/TimelineClip.tsx');
const row = read('src/features/video-studio/timeline/components/TimelineTrackRow.tsx');
const draft = read('src/features/video-studio/timeline/controllers/timelineDraftEngine.ts');
const drag = read('src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');

if (!geometry.includes('leftPx') || !geometry.includes('widthPx') || !geometry.includes('endAt')) fail('Canonical clip geometry contract is incomplete.');
if (!geometry.includes('timeToPixel(startAt, pixelsPerSecond)')) fail('Clip X must derive from project startAt.');
if (!geometry.includes('durationToPixels(duration, pixelsPerSecond)')) fail('Clip width must derive from project duration.');
if (!clip.includes('resolveTimelineClipGeometry(clip, pixelsPerSecond)')) fail('TimelineClip must consume canonical geometry.');
if (!row.includes('resolveTimelineClipGeometry(clip, pixelsPerSecond)')) fail('TrackRow must consume canonical geometry for visibility/markers.');
if (!draft.includes('element.style.left') || !draft.includes('element.style.width')) fail('Draft must use canonical left/width geometry.');
if (/style\.transform\s*=\s*`translate3d/.test(draft)) fail('Horizontal drag must not use a second transform coordinate system.');
if (!drag.includes("if (activeDrag.dragMode === 'move')")) fail('Move transaction is missing.');
if (!drag.includes("activeDrag.dragMode === 'trim-left'") || !drag.includes("activeDrag.dragMode === 'trim-right'")) fail('Explicit resize modes are missing.');

console.log('PHASE107_TIMELINE_CANONICAL_GEOMETRY = PASS');
console.log('Time is canonical; left/width are the only horizontal render projection; visibility and markers share the same resolver.');
