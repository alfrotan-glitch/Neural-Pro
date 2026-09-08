const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));

const root = path.resolve(__dirname, '../..');
const coreDurationPath = path.join(root, 'src/core/engine/clipTimelineDuration.ts');
const audioMixPath = path.join(root, 'src/features/video-studio/audio/services/audioMixModel.ts');
const audioMixSource = fs.readFileSync(audioMixPath, 'utf8');

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName,
  }).outputText;
}

function loadCoreDuration() {
  const module = { exports: {} };
  vm.runInNewContext(transpile(fs.readFileSync(coreDurationPath, 'utf8'), coreDurationPath), {
    module,
    exports: module.exports,
    require,
    console,
  }, { filename: coreDurationPath });
  return module.exports;
}

const canonical = loadCoreDuration();
const strippedAudioMixSource = audioMixSource.replace(
  "import { getClipPlaybackRate, getClipSourceRange, getEffectiveClipTimelineDuration } from '../../playback/services/mediaTimeMapper';",
  '',
);
const audioOut = transpile(strippedAudioMixSource, audioMixPath);
const audioModule = { exports: {} };
vm.runInNewContext(audioOut, {
  module: audioModule,
  exports: audioModule.exports,
  require,
  console,
  getClipPlaybackRate: canonical.getCanonicalClipPlaybackRate,
  getClipSourceRange: (clip) => {
    const start = Math.max(0, Number.isFinite(clip.trim?.in) ? clip.trim.in : 0);
    const rawEnd = Number.isFinite(clip.trim?.out) ? clip.trim.out : NaN;
    const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : null;
    return { start, end };
  },
  getEffectiveClipTimelineDuration: canonical.getCanonicalClipTimelineDuration,
}, { filename: audioMixPath });

const { resolveFadeGain } = audioModule.exports;
const shortenedClip = {
  id: 'shortened',
  sourceId: 'source-shortened',
  startAt: 0,
  duration: 10,
  trim: { in: 0, out: 5 },
  transform: { x: 0, y: 0, scale: 100, rotation: 0 },
  properties: { speed: 1, fadeOut: 2, audioUrl: 'test-audio.wav' },
};

const effectiveDuration = canonical.getCanonicalClipTimelineDuration(shortenedClip);
if (effectiveDuration !== 5) throw new Error(`expected effective duration 5, got ${effectiveDuration}`);
if (Math.abs(resolveFadeGain(shortenedClip, 3) - 1) > 1e-9) throw new Error('fade should still be full gain before fade-out window');
if (Math.abs(resolveFadeGain(shortenedClip, 4) - 0.5) > 1e-9) throw new Error('fade midpoint must be based on effective duration');
if (resolveFadeGain(shortenedClip, 4.999) >= 0.001) throw new Error('fade must reach zero at effective end');
if (resolveFadeGain(shortenedClip, 5) !== 0) throw new Error('clip must be inactive at effective end');

assertSourceUsesEffectiveDuration();
console.log('PHASE_P1_AUDIO_FADE_EFFECTIVE_DURATION=PASS');

function assertSourceUsesEffectiveDuration() {
  const source = fs.readFileSync(audioMixPath, 'utf8');
  if (!source.includes('const remaining = Math.max(0, effectiveDuration - localTime);')) {
    throw new Error('audio fade-out source still uses declared clip.duration');
  }
}
