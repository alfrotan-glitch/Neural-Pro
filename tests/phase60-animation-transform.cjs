const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/features/video-studio/animation/services.ts'), 'utf8');
const persistence = fs.readFileSync(path.join(root, 'src/features/video-studio/project/services/projectPersistenceService.ts'), 'utf8');
const exportService = fs.readFileSync(path.join(root, 'src/features/video-studio/export/services/exportService.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');

assert.match(source, /export function evaluateElementAnimation/);
assert.match(source, /transform\.scaleX/);
assert.match(source, /transform\.scaleY/);
assert.match(source, /left\.interpolation === 'hold'/i);
assert.match(source, /shortestAngleDelta/);
assert.match(persistence, /animations:\s*state\.animations/);
assert.match(persistence, /project\.animations/);
assert.match(exportService, /animations:\s*state\.animations/);
assert.match(renderer, /evaluateClipAnimation\(state\.animations/);
assert.match(renderer, /evaluateClipAnimation\(context\.state\.animations/);
assert.match(player, /createAtomicRenderSnapshot/);
assert.match(player, /renderSnapshot\.transformByClipId/);

console.log('PHASE60_ANIMATION_TRANSFORM_CONTRACT=PASS');
console.log('PHASE60_PERSISTENCE_ANIMATION_PARITY=PASS');
console.log('PHASE60_PREVIEW_EXPORT_ANIMATION_PARITY=PASS');
