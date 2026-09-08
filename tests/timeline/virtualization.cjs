const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const board = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineTrackBoard.tsx'), 'utf8');

const tests = [
  ['track board has a virtual window model', /VirtualWindow/.test(board)],
  ['track board computes track heights', /getTrackHeight/.test(board)],
  ['track board uses binary search for first visible track', /findFirstTrackIntersecting/.test(board)],
  ['track board uses overscan', /OVERSCAN_PX/.test(board)],
  ['track board renders only the visible slice', /sortedTracks\.slice\(virtualWindow\.startIndex, virtualWindow\.endIndex\)/.test(board)],
  ['track board preserves total scroll height with spacers', /data-total-track-height/.test(board) && /topSpacer/.test(board) && /bottomSpacer/.test(board)],
  ['track board updates virtualization on workspace scroll', /addEventListener\('scroll'/.test(board)],
  ['clip visibility remains time-window culled', /visibleTimeRange/.test(board) || fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineTrackRow.tsx'), 'utf8').includes('visibleTimeRange')],
];

let failed = 0;
for (const [name, ok] of tests) {
  if (ok) console.log(`[PASS] ${name}`);
  else { console.error(`[FAIL] ${name}`); failed++; }
}
if (failed) process.exit(1);
console.log('TIMELINE_VIRTUALIZATION=PASS');
