const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..', '..');
const preview = fs.readFileSync(path.join(root, 'src/components/player/SubtitleRenderer.tsx'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionRenderPlan.ts'), 'utf8');
const canvas = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');

assert(preview.includes('createCaptionRenderPlan'), 'Preview must consume CaptionRenderPlan');
assert(preview.includes('activeWords.map((word) => String(word.word ?? \'\')).join(\' \')'), 'Plain-text Preview fallback must consume canonical activeWords');
assert(!preview.includes('textContent.split(/([,،\\.\\!\\?؛]+)/)'), 'Preview must not maintain an independent sentence segmentation algorithm');
assert(plan.includes('getSegmentedWords'), 'CaptionRenderPlan must remain the canonical timing/segmentation owner');
assert(canvas.includes('createCaptionRenderPlan'), 'Canvas export must consume CaptionRenderPlan');

console.log('CAPTION_PREVIEW_EXPORT_SINGLE_PLAN=PASS');
