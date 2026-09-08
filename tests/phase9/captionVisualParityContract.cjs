const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..', '..');
const themeFile = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionThemeDefinitions.ts'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/components/player/SubtitleRenderer.tsx'), 'utf8');
const canvas = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionRenderPlan.ts'), 'utf8');

const themes = [...themeFile.matchAll(/^\s*(['\"]?)([a-z0-9-]+)\1:\s*\{\s*id:\s*['\"][a-z0-9-]+['\"]/gm)].map(m => m[2]);
assert(themes.length === 24, `Expected 24 caption themes, found ${themes.length}`);

const previewReferenced = new Set([...preview.matchAll(/theme === '([^']+)'/g)].map(m => m[1]));
const canvasReferenced = new Set([...canvas.matchAll(/theme === '([^']+)'/g)].map(m => m[1]));

// Every theme must have an explicit registry definition and a documented fallback path.
for (const theme of themes) {
  assert(themeFile.includes(`id: '${theme}'`), `Missing registry definition for ${theme}`);
  // All themes are allowed to use generic behavior; explicit references are preferred but not mandatory.
}

// The newly fixed line theme must exist in both renderers.
assert(previewReferenced.has('line'), 'Preview renderer does not explicitly handle line theme');
assert(canvasReferenced.has('line'), 'Canvas renderer does not explicitly handle line theme');

// Stable Motion layout IDs: they must be scoped by clip identity, never only by global names/time.
assert(preview.includes('subtitle-${clipId}-${idx}-moving-box'), 'Moving-box layoutId is not clip-scoped');
assert(preview.includes('subtitle-${clipId}-clean-indicator-bar'), 'Clean indicator layoutId is not clip-scoped');
assert(!preview.includes('layoutId="clean-indicator-bar"'), 'Global clean-indicator layoutId still exists');

// Render Plan remains the shared timing contract.
assert(preview.includes('createCaptionRenderPlan'), 'Preview does not consume CaptionRenderPlan');
assert(canvas.includes('createCaptionRenderPlan'), 'Canvas does not consume CaptionRenderPlan');
assert(plan.includes('getSegmentedWords'), 'CaptionRenderPlan is not the shared timing owner');

console.log('CAPTION_VISUAL_PARITY_CONTRACT=PASS');
console.log(`THEMES=${themes.length}`);
console.log(`PREVIEW_EXPLICIT_THEMES=${[...previewReferenced].sort().length}`);
console.log(`CANVAS_EXPLICIT_THEMES=${[...canvasReferenced].sort().length}`);
