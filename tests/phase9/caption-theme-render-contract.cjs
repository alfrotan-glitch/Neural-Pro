const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../..');
const defs = fs.readFileSync(path.join(ROOT, 'src/features/video-studio/captions/services/captionThemeDefinitions.ts'), 'utf8');
const canvas = fs.readFileSync(path.join(ROOT, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
const preview = fs.readFileSync(path.join(ROOT, 'src/components/player/SubtitleRenderer.tsx'), 'utf8');

const themes = [...defs.matchAll(/^\s*(['\"]?)([a-z0-9-]+)\1:\s*\{\s*id:/gm)].map(m => m[2]);
assert.strictEqual(themes.length, 24, `Expected 24 themes, found ${themes.length}`);

// Theme semantics that previously had no explicit Canvas path are now anchored in both renderers.
for (const theme of ['cinematic', 'spring']) {
  assert(canvas.includes(`theme === '${theme}'`), `Canvas renderer missing explicit ${theme} path`);
  assert(preview.includes(`theme === '${theme}'`), `Preview renderer missing explicit ${theme} path`);
}
assert(canvas.includes('fillTextWithLetterSpacing'), 'Cinematic Canvas lettering helper missing');
assert(preview.includes("wordStyle.letterSpacing = '1px'"), 'Cinematic Preview tracking contract missing');
assert(preview.includes("wordStyle.transform = 'scale(1.12)'"), 'Spring Preview scale contract missing');
console.log('CAPTION_THEME_RENDER_CONTRACT=PASS');
console.log(`THEMES=${themes.length}`);
