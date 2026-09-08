const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');

require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function loadTs(file, overrides = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  const localRequire = createRequire(file);
  vm.runInNewContext(out, { module, exports: module.exports, require: localRequire, console, ...overrides }, { filename: file });
  return module.exports;
}

const mapper = loadTs(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'));
const makeClip = (overrides = {}) => ({
  id: 'c', sourceId: 's', startAt: 10, duration: 5,
  trim: { in: 2, out: 12 },
  transform: { x: 0, y: 0, scale: 100, rotation: 0 },
  properties: { speed: 2 },
  ...overrides,
});

const clip = makeClip();
assert.equal(mapper.getEffectiveClipTimelineDuration(clip), 5);
assert.equal(mapper.projectTimeToSourceTime(clip, 10), 2);
assert(Math.abs(mapper.projectTimeToSourceTime(clip, 14.999999) - 11.999998) < 1e-9);
assert.equal(mapper.isClipActiveAt(clip, 14.999999), true);
assert.equal(mapper.isClipActiveAt(clip, 15), false);
assert.equal(mapper.sourceTimeToProjectTime(clip, 12), 15);
assert.equal(mapper.sourceTimeToProjectTime(clip, 13), 15);

for (const fps of [24, 30, 60]) {
  const frame = 1 / fps;
  const end = clip.startAt + mapper.getEffectiveClipTimelineDuration(clip);
  const lastFrameStart = end - frame;
  assert.equal(mapper.isClipActiveAt(clip, lastFrameStart), true, `${fps}fps last frame start must be active`);
  assert.equal(mapper.isClipActiveAt(clip, end), false, `${fps}fps exclusive end must be inactive`);
}

console.log('PHASE13_RUNTIME_AV_BOUNDARIES=PASS');
