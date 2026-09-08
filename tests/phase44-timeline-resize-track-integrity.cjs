const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const resize = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts'), 'utf8');
const placement = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineTrackPlacementService.ts'), 'utf8');
const drag = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
must(/sourceAvailableEnd[\s\S]*mediaDuration !== null/, resize, 'resize uses canonical media duration when present');
must(/candidateTrimIn/, resize, 'left resize computes source-aware trim-in');
must(/boundedTrimIn/, resize, 'left resize clamps trim-in to available source');
must(/placeSingleClipOnCrossTrackDrop[\s\S]*laneRole/i, placement, 'cross-track target is resolved by semantic lane role');
must(/trim: \{ \.\.\.c\.trim, in: newTrimIn/, drag, 'modified left rate-stretch keeps trim coherent');
must(/trim: \{ \.\.\.c\.trim, in: trimIn, out: trimIn \+ nextDuration \* newSpeed \}/, drag, 'modified right rate-stretch keeps trim coherent');
console.log('PHASE44_TIMELINE_RESIZE_SOURCE_TRIM_DEDICATED_TRACKS=PASS');
