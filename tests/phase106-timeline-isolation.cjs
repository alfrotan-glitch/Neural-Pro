const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fail = (msg) => { throw new Error(msg); };

const drag = read('src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const resize = read('src/features/video-studio/timeline/services/timelineResizeService.ts');
const selection = read('src/features/video-studio/shared/services/selectionInteractionService.ts');

// Wrong Logic -> Correct Logic: ordinary Move must not rewrite duration/trim or unrelated lanes.
const moveBranchStart = drag.indexOf("if (activeDrag.dragMode === 'move')");
const moveBranchEnd = drag.indexOf("} else if (activeDrag.dragMode === 'rate-stretch')");
if (moveBranchStart < 0 || moveBranchEnd < 0) fail('Move branch boundaries are missing.');
const move = drag.slice(moveBranchStart, moveBranchEnd);
if (/duration\s*:|trim\s*:/.test(move)) fail('Ordinary Move must never rewrite duration or trim.');
if (!move.includes('return t;')) fail('Move must preserve unmodified tracks/clips structurally.');

// Resize service must only clone/modify explicitly selected clips and preserve all others.
if (!resize.includes('if (!selected.has(clip.id)) return structuredClone(clip);')) {
  fail('Resize must leave non-selected clips unchanged.');
}
if (!resize.includes('if (track.isLocked) return { ...track, clips: track.clips.map((clip) => structuredClone(clip)) };')) {
  fail('Resize must preserve locked tracks exactly.');
}

// Linked editing is explicit through groupId/syncGroupId; unrelated assets cannot be pulled in merely by type.
if (!selection.includes("if (typeof groupId !== 'string' && typeof syncGroupId !== 'string') {")) {
  fail('Linked selection must require explicit link/group metadata.');
}
if (!selection.includes("return [context.clickedClipId];")) fail('Normal click must replace selection with the clicked clip.');

console.log('PHASE106_TIMELINE_ISOLATION = PASS');
console.log('Move/resize isolation and explicit linked-selection boundaries verified.');
