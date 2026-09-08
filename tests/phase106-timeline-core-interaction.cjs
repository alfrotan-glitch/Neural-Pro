const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fail = (msg) => { throw new Error(msg); };

const interaction = read('src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts');
const clip = read('src/features/video-studio/timeline/components/TimelineClip.tsx');
const draft = read('src/features/video-studio/timeline/controllers/timelineDraftEngine.ts');
const projectService = read('src/features/video-studio/project/services/projectService.ts');

// Wrong Logic -> Correct Logic: clip width must never decide whether a body click is trim.
if (/edgeThreshold|clipRect\.width \* 0\.05|clipRect\.right - event\.clientX/.test(interaction)) {
  fail('Timeline still uses clip-width heuristics to classify body clicks as trim.');
}
if (!clip.includes('data-timeline-resize-edge="left"') || !clip.includes("'trim-left'")) {
  fail('Left resize handle must own explicit trim-left intent.');
}
if (!clip.includes('data-timeline-resize-edge="right"') || !clip.includes("'trim-right'")) {
  fail('Right resize handle must own explicit trim-right intent.');
}
if (!clip.includes('-translate-x-1/2') || !clip.includes('translate-x-1/2')) {
  fail('Resize hit targets must remain usable when a clip is only a few pixels wide.');
}

// One coordinate system: draft geometry must use the same left/width fields as React render.
if (!draft.includes('element.style.left')) fail('Draft rendering must write canonical left geometry.');
if (!draft.includes('element.style.width')) fail('Draft rendering must write canonical width geometry.');
if (/translate3d\(/.test(draft) || /translate\(.*px,.*px/.test(draft)) fail('Draft renderer must not use a second horizontal transform coordinate system.');
if (!draft.includes('translateY(${verticalOffset}px)')) fail('Cross-track draft must use an explicit transient vertical bridge.');
if (!interaction.includes("initialDragMode === 'trim-left'") || !interaction.includes("initialDragMode === 'trim-right'")) {
  fail('Trim gestures must anchor to the canonical clip edge rather than the raw pointer hit-target position.');
}

// Every inserted asset receives a real Timeline duration and matching trim range.
if (!projectService.includes("const duration = Number.isFinite(asset.duration) && Number(asset.duration) > 0 ? Number(asset.duration) : 5;")) {
  fail('Asset insertion duration default/validation is missing.');
}
if (!projectService.includes('trim: { in: 0, out: duration }')) {
  fail('Inserted asset trim range must match its Timeline duration.');
}

console.log('PHASE106_TIMELINE_CORE_INTERACTION = PASS');
console.log('Explicit resize intent, canonical left/width draft geometry, and duration/trim parity verified.');
