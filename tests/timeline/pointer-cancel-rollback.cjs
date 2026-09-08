const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../../src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const src = fs.readFileSync(file, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(src.includes('const handlePointerCancel = (e: PointerEvent) => {'), 'Missing dedicated pointer cancel handler');
assert(src.includes('Cancellation is a rollback boundary, never a commit boundary.'), 'Missing cancellation contract');
assert(src.includes('window.cancelAnimationFrame(frameRef.current);'), 'Pointer cancel must cancel pending animation frame');
assert(src.includes('draftTracksRef.current = null;'), 'Pointer cancel must discard draft tracks');
assert(src.includes('pendingDraftRef.current = null;'), 'Pointer cancel must discard pending draft');
assert(src.includes('setSnapLineTime(null);'), 'Pointer cancel must clear snap indicator state');
assert(src.includes('setActiveDrag(null);'), 'Pointer cancel must terminate active drag');
assert(src.includes("window.addEventListener('pointercancel', handlePointerCancel, { once: true });"), 'pointercancel must use rollback handler');
assert(!src.includes("window.addEventListener('pointercancel', handlePointerUp, { once: true });"), 'pointercancel must never invoke commit handler');
assert(!src.includes("window.removeEventListener('pointercancel', handlePointerUp);"), 'cleanup must remove rollback handler');
console.log('TIMELINE_POINTER_CANCEL_ROLLBACK=PASS');
