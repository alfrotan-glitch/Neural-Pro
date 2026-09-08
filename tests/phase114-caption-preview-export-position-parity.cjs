const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const plan = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionRenderPlan.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const captionIndex = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/index.ts'), 'utf8');

assert.match(plan, /export interface CaptionCanvasPlacement/);
assert.match(plan, /bottomMargin = 80 \* scale/);
assert.match(plan, /centerX = safeWidth \/ 2/);
assert.match(plan, /centerY = safeHeight - bottomMargin/);
assert.match(renderer, /getCaptionCanvasPlacement\(width, height, containerHeight, plan\.transform\.y\)/);
assert.match(renderer, /placement\.centerX \+ transformX/);
assert.match(renderer, /placement\.centerY/);
assert.match(player, /getCaptionCanvasPlacement\(/);
assert.match(player, /bottom: `\$\{captionPlacement\.bottomMargin\}px`/);
assert.match(player, /transform: getPreviewTransformCss\(\{ \.\.\.canonicalTransform, y: 0 \}\)/);
assert.match(player, /marginLeft: '-50%'/);
assert.match(player, /const canvasDimensions = useMemo/);
assert.match(captionIndex, /export \* from '\.\/captionRenderPlan'/);

console.log('PHASE114_CAPTION_PREVIEW_EXPORT_POSITION_PARITY = PASS');
