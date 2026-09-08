const fs = require('fs');
const path = require('path');

const timelineFile = path.join(
  process.cwd(),
  'src/components/timeline/VirtualizedTimeline.tsx',
);
const interactionFile = path.join(
  process.cwd(),
  'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts',
);

const source = fs.readFileSync(timelineFile, 'utf8');
const interactionSource = fs.readFileSync(interactionFile, 'utf8');

const checks = [
  [
    'blank click clears selection',
    /if \(!clickedClip && !e\.ctrlKey && !e\.metaKey && !e\.shiftKey && !e\.altKey\)\s*\{\s*setSelectedNodeIds\(\[\]\);/s,
    source,
  ],
  [
    'locked clip remains selectable',
    /const isLocked = Boolean\(\s*track\.isLocked,?\s*\);/s,
    interactionSource,
  ],
  [
    'selection happens before locked early-return',
    /setSelectedNodeIds\(nextSelection\);[\s\S]*?if \(isLocked\) \{\s*return;/s,
    interactionSource,
  ],
  [
    'locked clip blocks modification',
    /if \(isLocked\) \{\s*return;\s*\}/s,
    interactionSource,
  ],
  [
    'right click resolves clip selection',
    /if \(clipId\) \{[\s\S]*resolveClipSelection\([\s\S]*clickedClipId: clipId,/s,
    source,
  ],
];

let failed = 0;
for (const [name, pattern, content] of checks) {
  if (!pattern.test(content)) {
    console.error(`[FAIL] ${name}`);
    failed += 1;
  } else {
    console.log(`[PASS] ${name}`);
  }
}

if (failed > 0) process.exit(1);
console.log('TIMELINE_MOUSE_SELECTION=PASS');
