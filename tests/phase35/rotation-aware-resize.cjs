const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));

const sourcePath = path.resolve('src/features/video-studio/playback/services/previewTransformInteractionService.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: sourcePath,
}).outputText;
const tmp = path.join(os.tmpdir(), `preview-resize-${process.pid}.cjs`);
fs.writeFileSync(tmp, output, 'utf8');
const service = require(tmp);
fs.unlinkSync(tmp);

const rect = (left, top, width, height) => ({ left, top, width, height });
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// 90deg rotation: the fixed NW anchor must remain at the same world point.
const center = rect(400, 350, 200, 100);
const pointerStart = { x: 450, y: 500 }; // rotated SE corner at 90deg
const snap = service.createPointerSnapshot(pointerStart.x, pointerStart.y, center, 'se', {
  width: 200,
  height: 100,
  rotation: 90,
});
const anchorBefore = {
  x: snap.centerX + (snap.width / 2 * Math.cos(Math.PI / 2) - snap.height / 2 * Math.sin(Math.PI / 2)) * -1,
  y: snap.centerY + (snap.width / 2 * Math.sin(Math.PI / 2) + snap.height / 2 * Math.cos(Math.PI / 2)) * -1,
};
const result = service.calculateAnchoredResize(100, snap, 350, 650);
const rotationRad = Math.PI / 2;
const cos = Math.cos(rotationRad), sin = Math.sin(rotationRad);
const anchorLocalX = -snap.width / 2, anchorLocalY = -snap.height / 2;
const anchorWorldX = snap.centerX + anchorLocalX * cos - anchorLocalY * sin;
const anchorWorldY = snap.centerY + anchorLocalX * sin + anchorLocalY * cos;
const resultingAnchorX = result.centerX + anchorLocalX * (result.scale / 100) * cos - anchorLocalY * (result.scale / 100) * sin;
const resultingAnchorY = result.centerY + anchorLocalX * (result.scale / 100) * sin + anchorLocalY * (result.scale / 100) * cos;
assert(close(anchorWorldX, resultingAnchorX) && close(anchorWorldY, resultingAnchorY), 'rotated SE resize moved the fixed NW anchor');
assert(result.scale > 100, 'rotated resize did not increase scale');

// 45deg resize must stay deterministic and respect the canvas boundary.
const snap45 = service.createPointerSnapshot(570, 470, rect(470, 370, 200, 100), 'se', {
  width: 200,
  height: 100,
  rotation: 45,
});
const bounded = service.calculateAnchoredResize(100, snap45, 1000, 1000, rect(300, 300, 400, 300));
assert(bounded.scale <= 400 + 1e-6, 'scale exceeded hard maximum');
assert(Number.isFinite(bounded.centerX) && Number.isFinite(bounded.centerY), 'bounded resize produced non-finite center');

console.log('PHASE35_ROTATION_AWARE_RESIZE=PASS');
