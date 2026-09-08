const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const plan = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionRenderPlan.ts'), 'utf8');
const defs = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionThemeDefinitions.ts'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionPreviewAdapter.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
const subtitle = fs.readFileSync(path.join(root, 'src/components/player/SubtitleRenderer.tsx'), 'utf8');
for (const [name, text, needles] of [
  ['render-plan', plan, ['createCaptionRenderPlan', 'getSegmentedWords', 'clipEnd', 'transform']],
  ['theme-definitions', defs, ['CaptionThemeDefinition', 'karaoke', 'cinematic', 'spring']],
  ['preview-adapter', preview, ['toCaptionPreviewAdapter', 'getCaptionThemeDefinition']],
  ['canvas-renderer', renderer, ['createCaptionRenderPlan', 'const plan = createCaptionRenderPlan']],
  ['preview-renderer', subtitle, ['createCaptionRenderPlan', 'toCaptionPreviewAdapter']],
]) {
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${name} missing ${needle}`);
}
if (renderer.includes('getSegmentedWords(')) throw new Error('Canvas renderer still directly owns caption segmentation');
if (subtitle.includes('getSegmentedWords(')) throw new Error('Preview renderer still directly owns caption segmentation');
console.log('CAPTION_RENDER_CONTRACT_PHASEI=PASS');
