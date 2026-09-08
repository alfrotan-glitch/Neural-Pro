const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const path = require('path');

function loadModule(rel, injected = {}) {
  const file = path.join(path.resolve(__dirname, '..'), rel);
  const source = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: (request) => injected[request] ?? require(request) };
  vm.runInNewContext(out, sandbox, { filename: file });
  return module.exports;
}

const geometry = loadModule('src/features/video-studio/timeline/geometry/timelineGeometry.ts');
const viewport = loadModule('src/features/video-studio/timeline/geometry/timelineViewportGeometry.ts', { './timelineGeometry': geometry });

const pps = geometry.getPixelsPerSecond(35, 2);
if (pps !== 70) throw new Error('pixels-per-second contract failed');

const x = viewport.clientXToTimelinePixel({
  clientX: 260,
  workspaceRectLeft: 0,
  scrollLeft: 100,
  pixelsPerSecond: 50,
});
if (x !== 200) throw new Error(`client→timeline mapping failed: ${x}`);

const clientX = viewport.timelinePixelToClientX(200, 0, 100);
if (clientX !== 260) throw new Error(`timeline→client mapping failed: ${clientX}`);

const range = viewport.getVisibleTimelineTimeRange({
  scrollLeft: 100,
  viewportWidth: 960,
  pixelsPerSecond: 50,
  overscanSeconds: 0,
});
if (range.start !== 2) throw new Error(`visible start failed: ${range.start}`);
if (range.end !== 18) throw new Error(`visible end failed: ${range.end}`);

if (viewport.getTimelineContentViewportWidth(960) !== 800) {
  throw new Error('content viewport width must exclude the 160px track header');
}

const zoomed = viewport.clientXToTimelinePixel({
  clientX: 500,
  workspaceRectLeft: 20,
  scrollLeft: 300,
  pixelsPerSecond: 100,
});
const t = zoomed / 100;
if (t !== 6.2) throw new Error(`zoom/scroll pointer time failed: ${t}`);

console.log('PHASE113_TIMELINE_VIEWPORT_GEOMETRY = PASS');
