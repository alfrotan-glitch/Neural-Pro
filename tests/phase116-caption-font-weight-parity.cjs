const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const contract = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionVisualContract.ts'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const subtitle = fs.readFileSync(path.join(root, 'src/components/player/SubtitleRenderer.tsx'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');

assert.match(contract, /export function resolveCaptionFontWeight/);
assert.match(contract, /if \(input\.bold === false\) return '400'/);
assert.match(contract, /return '700'/);
assert.match(preview, /resolveCaptionFontWeight\(\{/);
assert.doesNotMatch(preview, /fontWeight=\{clip\.properties\.bold \? 'bold' : 'normal'\}/);
assert.match(subtitle, /getCaptionVisualContract\(\{/);
assert.match(renderer, /getCaptionVisualContract\(\{ theme, \.\.\.props/);
console.log('PHASE116_CAPTION_FONT_WEIGHT_PARITY=PASS');
