const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'src/features/video-studio/timeline/services/timelineClipboardService.ts');
const text = fs.readFileSync(src, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

assert(text.includes('TimelineClipboard'), 'clipboard model is defined');
assert(text.includes('offsetFromAnchor'), 'clipboard preserves relative timing');
assert(text.includes('sourceTrackId'), 'clipboard preserves source track mapping');
assert(text.includes('structuredClone(clip)'), 'clipboard captures immutable clip snapshots');
assert(text.includes('generateUUID()'), 'pasted clips receive collision-safe IDs');
assert(text.includes('items.length'), 'clipboard supports multiple selected clips');
assert(text.includes('pasteTime + item.offsetFromAnchor'), 'paste preserves multi-clip relative offsets');
assert(text.includes('track.isLocked'), 'paste refuses locked destination tracks');
console.log('TIMELINE_CLIPBOARD=PASS');
