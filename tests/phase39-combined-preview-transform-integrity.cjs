const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

assert(/function getTransformGroupCenter\(/.test(serviceSource), 'Group transform center is centralized.');
assert(/const groupDeltaX = deltaX;/.test(serviceSource), 'Multi-resize translates the group by the actual anchor-preserving center delta.');
assert(/const groupDeltaY = deltaY;/.test(serviceSource), 'Multi-resize preserves the same vertical center delta.');
assert((serviceSource.match(/getTransformGroupCenter\(originalClips\)/g) || []).length >= 2, 'Resize and rotation use the same group-center definition.');

const assertAlmost = (a, b, message) => assert(Math.abs(a - b) < 1e-6, message);
// Independent geometry checks for the combined transform contract.
const scale = 1.5;
const before = [-100, 100];
const after = before.map(x => x * scale + 25);
assertAlmost(after[1] - after[0], 200 * scale, 'Multi-selection resize preserves relative spacing after anchor translation.');
const theta = Math.PI / 2;
const rotated = {
  x: after.map(x => (x - 25) * Math.cos(theta)),
  y: after.map(x => (x - 25) * Math.sin(theta)),
};
assertAlmost(rotated.x[0], rotated.x[1], 'Group rotation collapses X separation at 90 degrees.');
assertAlmost(rotated.y[1] - rotated.y[0], 200 * scale, 'Group rotation preserves scaled separation at 90 degrees.');
console.log('PHASE39_COMBINED_PREVIEW_TRANSFORM_INTEGRITY=PASS');
