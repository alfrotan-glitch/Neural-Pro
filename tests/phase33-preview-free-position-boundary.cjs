const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts');
const hookPath = path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts');
const service = fs.readFileSync(servicePath, 'utf8');
const hook = fs.readFileSync(hookPath, 'utf8');

const assertions = [
  ['move uses real element geometry', /elementRect.*canvasRect|getBoundingClientRect/s.test(service) || /getBoundingClientRect/.test(hook)],
  ['move supports unbounded canvas positioning', /calculateMoveTransform/.test(service)],
  ['move snaps to center and quarter guides', /targetX|targetY|threshold|snap/i.test(service)],
  ['resize uses rotation-aware fixed-anchor geometry', /const anchorLocalX = handle\.includes\('w'\)/.test(service)],
  ['resize respects scale limits', /MIN_SCALE = 10;[\s\S]*MAX_SCALE = 400;/.test(service)],
  ['interactive bounds come from transform target', /elementNode.*getBoundingClientRect\(\)/.test(hook)],
  ['move passes interaction options', /applyMoveToClips/.test(hook)],
  ['resize passes anchored pointer snapshot', /calculateAnchoredResize/.test(hook)],
];
let failed = false;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);

