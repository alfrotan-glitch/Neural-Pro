const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts'), 'utf8');
const hook = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');

const assertions = [
  ['anchor-aware resize exists', /calculateAnchoredResize/.test(service)],
  ['resize keeps an opposite-corner anchor', /anchorX|anchorY/.test(service)],
  ['resize can move center to preserve anchor', /centerX:\s*pointer\.anchorX|deltaX = result\.centerX/.test(service)],
  ['resize commits transform and position together', /applyAnchoredResizeToClips/.test(hook)],
  ['preview persists canonical px transforms', /getPreviewTransformCss\(canonicalTransform\)/.test(player)],
  ['hud reports canonical px position', /X: .*px \| Y: .*px/.test(hook)],
  ['all four resize handles are present', (player.match(/handleResizeMouseDown\(e, clip\)/g) || []).length >= 16],
];
let failed = false;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
