const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('node:module');

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
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  const localRequire = createRequire(file);
  const sandbox = { module, exports: module.exports, require: localRequire, console, ...overrides };
  vm.runInNewContext(out, sandbox, { filename: file });
  return module.exports;
}

const mapperPath = path.resolve('src/features/video-studio/playback/services/mediaTimeMapper.ts');
const modelPath = path.resolve('src/features/video-studio/audio/services/audioMixModel.ts');
const mapper = loadTs(mapperPath);
const modelSource = fs.readFileSync(modelPath, 'utf8').replace("import { getClipPlaybackRate, getClipSourceRange, getEffectiveClipTimelineDuration } from '../../playback/services/mediaTimeMapper';", '');
const modelOut = ts.transpileModule(modelSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  fileName: modelPath,
}).outputText;
const modelModule = { exports: {} };
vm.runInNewContext(modelOut, { module: modelModule, exports: modelModule.exports, require: createRequire(modelPath), console, getClipPlaybackRate: mapper.getClipPlaybackRate, getClipSourceRange: mapper.getClipSourceRange, getEffectiveClipTimelineDuration: mapper.getEffectiveClipTimelineDuration }, { filename: modelPath });
const { resolveClipAudioMix, resolveFadeGain, getOfflineAudioSourceDuration } = modelModule.exports;

const clip = {
  id: 'c1', sourceId: 's1', startAt: 10, duration: 5,
  trim: { in: 2, out: 12 },
  transform: { x: 0, y: 0, scale: 100, rotation: 0 },
  properties: { speed: 2, levelDb: -6, pan: 0.25, fadeIn: 1, fadeOut: 1 },
};

const results = [];
results.push(['gain', Math.abs(resolveClipAudioMix(clip, false, 10).gain - Math.pow(10, -6/20)) < 1e-9]);
results.push(['pan', resolveClipAudioMix(clip, false, 10).pan === 0.25]);
results.push(['fade-start', resolveFadeGain(clip, 10) === 0]);
results.push(['fade-middle', Math.abs(resolveFadeGain(clip, 12.5) - 1) < 1e-9]);
results.push(['fade-end', resolveFadeGain(clip, 14.999) < 0.01]);
results.push(['speed', resolveClipAudioMix(clip, false).playbackRate === 2]);
results.push(['source-duration', getOfflineAudioSourceDuration(clip) === 10]);
results.push(['track-muted', resolveClipAudioMix(clip, true, 12).muted === true]);

const failed = results.filter(([, ok]) => !ok);
console.log('PHASE_D_AUDIO_PARITY', failed.length ? 'FAIL' : 'PASS');
for (const [name, ok] of results) console.log(name, ok ? 'PASS' : 'FAIL');
if (failed.length) process.exit(1);
