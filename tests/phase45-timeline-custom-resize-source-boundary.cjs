const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const resize = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineResizeService.ts'), 'utf8');
const drag = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');
function must(re, text, label) { if (!re.test(text)) throw new Error(`FAIL: ${label}`); }
must(/current trim\.out is not the media boundary/i, resize, 'documents trim.out is not the source boundary');
must(/const sourceAvailableEnd = mediaDuration !== null[\s\S]*: null;/, resize, 'unknown source duration does not fall back to current trim.out');
must(/const sourceBounded = mediaDuration !== null;/, resize, 'only authoritative media duration bounds resize');
must(/sourceBounded\s*\?\s*Math\.min\(candidateTrimIn, maxTrimIn\)/, resize, 'left resize clamps only when source duration is authoritative');
must(/trim: \{ \.\.\.c\.trim, in: newTrimIn, out: newTrimIn \+ nextDuration \* newSpeed \}/, drag, 'rate-stretch left writes an internally coherent trim window');
console.log('PHASE45_TIMELINE_CUSTOM_RESIZE_SOURCE_BOUNDARY=PASS');
