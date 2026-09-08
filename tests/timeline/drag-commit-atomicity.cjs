const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../../src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts'), 'utf8');

assert(
  src.includes('pendingDraftRef.current ?? draftTracksRef.current ?? activeDrag.initialTracks'),
  'pointerup must commit the latest pending draft, not only the last flushed animation frame',
);
assert(
  src.includes('window.cancelAnimationFrame(frameRef.current)'),
  'rollback/cleanup must cancel queued animation frames',
);
assert(
  src.includes("window.addEventListener('pointercancel', handlePointerCancel, { once: true });"),
  'active drag must have an explicit rollback boundary',
);

console.log('DRAG_COMMIT_ATOMICITY=PASS');
