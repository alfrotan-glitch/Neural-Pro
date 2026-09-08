const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts');
const hookPath = path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts');
const service = fs.readFileSync(servicePath, 'utf8');
const hook = fs.readFileSync(hookPath, 'utf8');

const assertions = [
  ['move uses real element geometry', /elementRect.*canvasRect/s.test(service)],
  ['move clamps left/right within canvas', /minDx = canvas\.left - element\.left[\s\S]*maxDx = canvas\.left \+ canvas\.width/.test(service)],
  ['move clamps top/bottom within canvas', /minDy = canvas\.top - element\.top[\s\S]*maxDy = canvas\.top \+ canvas\.height/.test(service)],
  ['move snaps to center and quarter guides', /canvas\.left \+ canvas\.width \/ 2[\s\S]*canvas\.left \+ canvas\.width \* 0\.25[\s\S]*canvas\.left \+ canvas\.width \* 0\.75/.test(service)],
  ['resize uses rotation-aware fixed-anchor geometry', /const anchorLocalX = handle\.includes\('w'\) \? pointer\.width \/ 2 : -pointer\.width \/ 2[\s\S]*const anchorLocalY = handle\.includes\('n'\) \? pointer\.height \/ 2 : -pointer\.height \/ 2/.test(service)],
  ['resize remains canvas-bounded', /if \(!fitsCanvas\(nextScale\)\)[\s\S]*for \(let i = 0; i < 22; i \+= 1\)/.test(service)],
  ['interactive bounds come from resize-handle parent', /const element = type === 'resize'[\s\S]*target\.parentElement[\s\S]*const elementNode = element \?\? target[\s\S]*const bounds = elementNode\.getBoundingClientRect\(\)/.test(hook)],
  ['move passes target bounds and canvas bounds', /elementRect: session\.elementRect[\s\S]*canvasRect: \{ left: rect\.left/.test(hook)],
  ['resize passes canvas bounds', /calculateAnchoredResize\(initialScale, session\.pointerSnapshot, e\.clientX, e\.clientY, rect\)/.test(hook)],
];
let failed = false;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
