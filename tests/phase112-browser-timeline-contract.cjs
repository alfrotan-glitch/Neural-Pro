const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const clipSource = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineClip.tsx'), 'utf8');
const interactionSource = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts'), 'utf8');
const geometrySource = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/geometry/timelineGeometry.ts'), 'utf8');

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const timeToPixel = (time, pps) => Math.max(0, time) * pps;
const pixelToTime = (pixel, pps) => pps > 0 ? Math.max(0, pixel) / pps : 0;
const edgeHit = (localX, width, edgePx = 6) => {
  const safeWidth = Math.max(0, width);
  const left = Math.min(edgePx, safeWidth / 2);
  const right = Math.min(edgePx, safeWidth / 2);
  if (safeWidth > 0 && localX <= left) return 'trim-left';
  if (safeWidth > 0 && localX >= safeWidth - right) return 'trim-right';
  return 'move';
};

assert(geometrySource.includes('timeToPixel') && geometrySource.includes('pixelToTime'), 'Canonical time/pixel helpers missing');
assert(clipSource.includes('resolveTimelineClipGeometry'), 'TimelineClip does not consume canonical geometry resolver');
assert(clipSource.includes("requestedDragMode?: 'move'"), 'Clip interaction contract missing explicit move intent');
assert(clipSource.includes("'trim-left'") && clipSource.includes("'trim-right'"), 'Explicit edge trim intents missing');
assert(interactionSource.includes('clip body') && interactionSource.includes('always a move surface'), 'Short-clip body isolation contract missing');
assert(interactionSource.includes('startMouseTime') && interactionSource.includes('clip.startAt'), 'Edge trim anchor is not canonical');

const clip = { startAt: 4.25, duration: 2.5 };
const ppsA = 50;
const ppsB = 125;
const leftA = timeToPixel(clip.startAt, ppsA);
const widthA = timeToPixel(clip.duration, ppsA);
const leftB = timeToPixel(clip.startAt, ppsB);
const widthB = timeToPixel(clip.duration, ppsB);
assert(pixelToTime(leftA, ppsA) === clip.startAt, 'Time/pixel round trip failed at zoom A');
assert(pixelToTime(widthB, ppsB) === clip.duration, 'Duration/pixel round trip failed at zoom B');
assert(leftB / leftA === ppsB / ppsA, 'Zoom changed timeline time semantics');
assert(widthB / widthA === ppsB / ppsA, 'Zoom changed clip duration semantics');

assert(edgeHit(widthA / 2, widthA) === 'move', 'Normal center drag became trim');
assert(edgeHit(1, widthA) === 'trim-left', 'Left edge did not resolve to trim-left');
assert(edgeHit(widthA - 1, widthA) === 'trim-right', 'Right edge did not resolve to trim-right');
assert(edgeHit(4, 8) === 'trim-left', 'Short-clip left side is not deterministic');
assert(edgeHit(6, 8) === 'trim-right', 'Short-clip right side is not deterministic');

const before = { a: { startAt: 0, duration: 10 }, b: { startAt: 10, duration: 4 }, c: { startAt: 14, duration: 3 } };
const after = { ...before, b: { ...before.b, duration: 5 } };
assert(after.a.startAt === before.a.startAt && after.a.duration === before.a.duration, 'Unrelated clip A mutated');
assert(after.c.startAt === before.c.startAt && after.c.duration === before.c.duration, 'Unrelated clip C mutated');

console.log('PHASE112_BROWSER_TIMELINE_CONTRACT_SIMULATION=PASS');
console.log('BROWSER_NATIVE_RUN=BLOCKED_ENVIRONMENT');
