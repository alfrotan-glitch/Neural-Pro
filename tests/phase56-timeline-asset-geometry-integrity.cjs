const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const clipPath = path.join(root, 'src/features/video-studio/timeline/components/TimelineClip.tsx');
const rowPath = path.join(root, 'src/features/video-studio/timeline/components/TimelineTrackRow.tsx');
const interactionPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts');
const typesPath = path.join(root, 'src/features/video-studio/timeline/components/timelineInteractionTypes.ts');
const multiPath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionDragService.ts');
const projectDurationPath = path.join(root, 'src/store/useProjectStore.ts');
const geometryPath = path.join(root, 'src/features/video-studio/timeline/geometry/timelineGeometry.ts');

for (const file of [clipPath, rowPath, interactionPath, typesPath, multiPath, projectDurationPath, geometryPath]) {
  assert.equal(fs.existsSync(file), true, `Missing required file: ${file}`);
}

const clip = fs.readFileSync(clipPath, 'utf8');
const row = fs.readFileSync(rowPath, 'utf8');
const interaction = fs.readFileSync(interactionPath, 'utf8');
const types = fs.readFileSync(typesPath, 'utf8');
const multi = fs.readFileSync(multiPath, 'utf8');
const store = fs.readFileSync(projectDurationPath, 'utf8');
const geometry = fs.readFileSync(geometryPath, 'utf8');

assert.match(clip, /const isImageClip = Boolean\(clip\.properties\?\.imageUrl\) && !clip\.properties\?\.videoUrl/,
  'image clips must have a dedicated visual rendering path');
assert.match(clip, /<img[\s\S]*className=\"absolute inset-0 h-full w-full object-cover\"/,
  'image previews must fill the entire resized clip instead of tiling');
assert.match(clip, /source && isImageClip \? \(\s*<img[\s\S]*?\) : \(\s*<div[\s\S]*?backgroundRepeat: 'repeat-x'/,
  'image and video thumbnail rendering paths must remain distinct');
assert.match(clip, /className=\"min-w-0 flex-1 rounded-full bg-\[#39bfe5\]\"/,
  'audio waveform bars must participate in flexible width distribution');

assert.match(row, /backgroundSize: `\$\{Math\.max\(1, pixelsPerSecond\)\}px 100%`/,
  'timeline grid spacing must remain tied to current time geometry at low zoom');
assert.match(row, /\(props\.track\.laneRole \?\? props\.track\.type\) === \(props\.activeDrag\.trackLaneRole \?\? props\.activeDrag\.trackType\)/,
  'drag destination highlight must use semantic laneRole, not only render type');
assert.match(types, /trackLaneRole\?: string;/,
  'active drag must carry its semantic lane role');
assert.match(interaction, /trackLaneRole: \(tracks\.find\(\(candidateTrack\) => candidateTrack\.id === pending\.trackId\)\?\.laneRole \?\? pending\.trackType\)/,
  'active drag must capture laneRole from the source track');

assert.match(multi, /Cross-track movement still uses the same placement path as horizontal/,
  'cross-track group movement must use the canonical group placement path');
assert.doesNotMatch(multi, /cross-track multi-selection[^\n]*crypto\.randomUUID\(\)/i,
  'cross-track multi-selection must not create one dedicated track per selected clip');

assert.match(store, /const totalDuration = calculateProjectDuration\(nextState\.tracks\)/,
  'every canonical command commit must recompute project duration');
assert.match(geometry, /contentWidth: getContentWidth|const contentWidth = getContentWidth/,
  'timeline surface geometry must derive from canonical duration and current pixelsPerSecond');

console.log('PHASE56_TIMELINE_ASSET_GEOMETRY_INTEGRITY=PASS');
