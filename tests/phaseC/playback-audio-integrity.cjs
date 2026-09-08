const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));
const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const root = path.resolve(__dirname, '../..');

function transpile(file, source = fs.readFileSync(file, 'utf8')) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;
}

function load(file, overrides = {}) {
  const module = { exports: {} };
  const localRequire = createRequire(file);
  vm.runInNewContext(transpile(file), {
    module,
    exports: module.exports,
    require: localRequire,
    console,
    ...overrides,
  }, { filename: file });
  return module.exports;
}

const mapperPath = path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts');
const layerPath = path.join(root, 'src/features/video-studio/playback/compositor/layerOrder.ts');
const mapper = load(mapperPath);
const layer = load(layerPath);

const baseClip = {
  id: 'clip-1', sourceId: 'source-1', startAt: 10, duration: 5,
  trim: { in: 2, out: 12 },
  transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 1 },
  properties: { speed: 2 },
};

assert.equal(mapper.projectTimeToSourceTime(baseClip, 10), 2);
assert.equal(mapper.projectTimeToSourceTime(baseClip, 12.5), 7);
assert.equal(mapper.projectTimeToSourceTime(baseClip, 20), 12);
assert.equal(mapper.sourceTimeToProjectTime(baseClip, 2), 10);
assert.equal(mapper.sourceTimeToProjectTime(baseClip, 12), 15);
assert.equal(mapper.isClipActiveAt({ ...baseClip, properties: { deactivated: true } }, 12), false);
assert.equal(mapper.isClipActiveAt(baseClip, 15), false);
assert.equal(mapper.isClipActiveAt(baseClip, 10), true);

const tracks = [
  {
    id: 't-visible', type: 'video', isLocked: false, isMuted: false, isVisible: true,
    clips: [baseClip, { ...baseClip, id: 'clip-disabled', properties: { deactivated: true } }],
  },
  {
    id: 't-hidden', type: 'audio', isLocked: false, isMuted: false, isVisible: false,
    clips: [{ ...baseClip, id: 'clip-hidden' }],
  },
];
const active = layer.buildOrderedActiveClips(tracks, 12);
assert.equal(JSON.stringify(active.map(x => x.clip.id)), JSON.stringify(['clip-1']));


// Execute the controller against a minimal Web Audio mock. Re-registering the same
// media element after cleanup must reuse the original MediaElementAudioSourceNode.
const controllerSource = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/audio/AudioMixController.ts'), 'utf8');
let createSourceCount = 0;
class FakeNode { connect() {}; disconnect() {}; }
class FakeGain extends FakeNode { constructor() { super(); this.gain = { value: 1 }; } }
class FakePan extends FakeNode { constructor() { super(); this.pan = { value: 0 }; } }
class FakeAnalyser extends FakeNode { constructor() { super(); this.fftSize = 2048; this.frequencyBinCount = 1024; } getByteFrequencyData(array) { array.fill(0); } }
class FakeContext {
  state = 'running';
  destination = new FakeNode();
  createGain() { return new FakeGain(); }
  createStereoPanner() { return new FakePan(); }
  createAnalyser() { return new FakeAnalyser(); }
  createMediaElementSource() { createSourceCount += 1; return new FakeNode(); }
  async resume() {}
}
const controllerModule = load(path.join(root, 'src/features/video-studio/playback/audio/AudioMixController.ts'), { window: { AudioContext: FakeContext } });
const controller = new controllerModule.AudioMixController();
const fakeMedia = { muted: false };
controller.registerMediaElement(fakeMedia, {});
controller.unregisterMediaElement(fakeMedia);
controller.registerMediaElement(fakeMedia, {});
assert.equal(createSourceCount, 1);
assert.equal(controller.getRegisteredElementCount(), 1);

const files = {
  controller: fs.readFileSync(path.join(root, 'src/features/video-studio/playback/audio/AudioMixController.ts'), 'utf8'),
  realAudio: fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RealAudioElement.tsx'), 'utf8'),
  realVideo: fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RealVideoElement.tsx'), 'utf8'),
  audioRender: fs.readFileSync(path.join(root, 'src/features/video-studio/audio/services/projectAudioRenderService.ts'), 'utf8'),
  mediaSync: fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaSyncController.ts'), 'utf8'),
  playback: fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/playbackService.ts'), 'utf8'),
};

assert.match(files.controller, /sourceByElement = new WeakMap/);
assert.match(files.controller, /sourceByElement\.get\(element\) \?\? context\.createMediaElementSource/);
assert.match(files.controller, /this\.sourceByElement\.set\(element, source\)/);
assert.match(files.realAudio, /audioMix\.registerMediaElement\(audio, \{ muted: true \}\)/);
assert.match(files.realVideo, /audioMix\.registerMediaElement\(video, \{ muted: true \}\)/);
assert.doesNotMatch(files.realAudio, /useEffect\(\(\) => \{[\s\S]{0,500}registerMediaElement\(audio, \{ muted: effectiveMuted/);
assert.doesNotMatch(files.realVideo, /useEffect\(\(\) => \{[\s\S]{0,500}registerMediaElement\(video, \{ muted: effectiveMuted/);
assert.match(files.audioRender, /track\.isVisible !== false/);
assert.match(files.audioRender, /clip\.properties\?\.deactivated !== true/);
assert.match(files.audioRender, /buffer\.duration - mix\.trimIn/);
assert.match(files.mediaSync, /clip\.properties\?\.deactivated === true/);
assert.match(files.playback, /clip\.properties\?\.deactivated !== true/);

console.log('PHASE_C_PLAYBACK_AUDIO_INTEGRITY=PASS');
console.log('time-mapping=PASS');
console.log('deactivated-semantics=PASS');
console.log('audio-source-node-reuse=PASS');
console.log('offline-audio-boundaries=PASS');
console.log('runtime-wiring-contracts=PASS');
console.log('single-media-source-node=PASS');
