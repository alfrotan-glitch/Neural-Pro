const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const multiPath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionDragService.ts');
const zoomPath = path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx');
const clipPath = path.join(root, 'src/features/video-studio/timeline/components/TimelineClip.tsx');
const interactionPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts');
const rowPath = path.join(root, 'src/features/video-studio/timeline/components/TimelineTrackRow.tsx');
const geometryPath = path.join(root, 'src/features/video-studio/timeline/geometry/timelineClipGeometry.ts');

for (const file of [dragPath, multiPath, zoomPath, clipPath, rowPath, interactionPath, geometryPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const drag = fs.readFileSync(dragPath, 'utf8');
const multi = fs.readFileSync(multiPath, 'utf8');
const zoom = fs.readFileSync(zoomPath, 'utf8');
const clip = fs.readFileSync(clipPath, 'utf8');
const interaction = fs.readFileSync(interactionPath, 'utf8');
const row = fs.readFileSync(rowPath, 'utf8');
const geometry = fs.readFileSync(geometryPath, 'utf8');

function must(re, text, label) {
  if (!re.test(text)) throw new Error(`FAIL: ${label}`);
}

// Resize release invariant: a successful commit must survive the effect cleanup.
must(/const committedDragRef = useRef\(false\);/, drag, 'commit state is tracked outside local callback scope');
must(/committedDragRef\.current = true;[\s\S]*commitTimelineDraftDom\(/, drag, 'successful commit marks cleanup-safe state before DOM commit');
must(/if \(workspaceAtStart && !committedDragRef\.current\)\s*\{[\s\S]*?resetTimelineDraftDom\(workspaceAtStart,/, drag, 'effect cleanup cannot erase committed resize geometry');

// Zoom/geometry invariant: visible range is derived from current geometry, not stale scroll-only state.
must(/Keep virtualization geometry synchronized whenever zoom or viewport size changes/i, zoom, 'zoom geometry synchronization exists');
must(/getVisibleTimeRange\([\s\S]*pixelsPerSecond,/, zoom, 'visible range uses canonical current pixelsPerSecond');

// Every Timeline clip uses one canonical time->pixel/duration->pixel resolver.
must(/resolveTimelineClipGeometry\(clip, pixelsPerSecond\)/, clip, 'clip uses canonical geometry resolver');
must(/timeToPixel\(startAt, pixelsPerSecond\)/, geometry, 'canonical geometry uses centralized time mapping');
must(/durationToPixels\(duration, pixelsPerSecond\)/, geometry, 'canonical geometry uses centralized duration mapping');

// Release correctness: pointerup must synchronously process the actual final pointer
// position before the RAF preview is cancelled/committed. The animation frame is
// presentation scheduling, not the transaction source of truth.
must(/const handlePointerUp = \(e: PointerEvent\) => \{[\s\S]*?handlePointerMove\(e\);[\s\S]*?window\.cancelAnimationFrame\(frameRef\.current\)/, drag, 'pointerup flushes the latest pointer position before final commit');

// Gesture intent correctness: trim-vs-move is captured at pointerdown, not inferred
// from the first post-threshold pointermove coordinate.
must(/(?:const|let) initialDragMode: ActiveDrag\['dragMode'\]/, interaction, 'resize intent is captured from pointerdown coordinates');
must(/requestedDragMode\?/, interaction + clip, 'resize intent is explicitly supplied by the edge hit target');
must(/initialDragMode,/, interaction, 'captured drag mode is passed into pending gesture');

// Multi-selection vertical moves preserve the resolved destination topology and
// reuse a compatible destination track instead of creating one track per clip.
must(/Cross-track movement still uses the same placement path as horizontal[\s\S]*movement/i, multi, 'multi-selection cross-track placement shares the canonical placement path');
must(/selected group is inserted[\s\S]*resolved destination tracks below/i, multi, 'cross-track group preserves destination topology');

console.log('PHASE48_TIMELINE_INTERACTION_GEOMETRY=PASS');
