const path = require('path');
const fs = require('fs');
const ts = require('typescript');
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

const { resolveClipAudioMix, getOfflineAudioSourceDuration } = loadTs(
  path.resolve(__dirname, '../../src/features/video-studio/audio/services/audioMixModel.ts')
);

// 1. Mute propagation test
const baseClip = {
  id: 'c1',
  startAt: 0,
  duration: 5,
  properties: {
    audioUrl: 'https://cdn.example.com/audio.mp3',
    speed: 1,
  },
};

const unmutedMix = resolveClipAudioMix(baseClip, false);
if (unmutedMix.muted !== false) {
  throw new Error('Mix should not be muted when track and clip are active');
}

const trackMutedMix = resolveClipAudioMix(baseClip, true);
if (trackMutedMix.muted !== true) {
  throw new Error('Mix should be muted when track is muted');
}

const clipMutedMix = resolveClipAudioMix({
  ...baseClip,
  properties: { ...baseClip.properties, muted: true },
}, false);
if (clipMutedMix.muted !== true) {
  throw new Error('Mix should be muted when clip is muted');
}

console.log('AUDIO_PARITY_TEST=PASS');
