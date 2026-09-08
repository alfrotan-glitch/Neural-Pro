const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const text = fs.readFileSync(dragPath, 'utf8');

assert.match(text, /lastAutoScrollAtRef/, 'auto-scroll must track elapsed time rather than pointer-event count');
assert.match(text, /performance\.now\(\)/, 'auto-scroll must use a monotonic wall-clock source');
assert.match(text, /elapsedSeconds = Math\.min\(0\.05/, 'auto-scroll delta must be bounded per event to prevent large jumps');
assert.match(text, /autoScrollMaxSpeedPxPerSecond = 480/, 'auto-scroll must use a stable physical speed ceiling');
assert.match(text, /scrollVelocity\(leftDistance\) \* elapsedSeconds/, 'left auto-scroll must scale by elapsed time');
assert.match(text, /scrollVelocity\(rightDistance\) \* elapsedSeconds/, 'right auto-scroll must scale by elapsed time');
assert.match(text, /scrollVelocity\(topDistance\) \* elapsedSeconds/, 'top auto-scroll must scale by elapsed time');
assert.match(text, /scrollVelocity\(bottomDistance\) \* elapsedSeconds/, 'bottom auto-scroll must scale by elapsed time');
assert.match(text, /TIMELINE_HEADER_WIDTH \+ autoScrollEdgePx/, 'left auto-scroll must not consume timeline header space');
assert.match(text, /lastAutoScrollAtRef\.current = null/, 'auto-scroll timing state must reset at gesture boundaries');

console.log('PHASE52_TIMELINE_AUTOSCROLL_TIME_BASED=PASS');
