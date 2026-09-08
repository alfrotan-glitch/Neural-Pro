const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/audio/AudioMixController.ts'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'src/components/player/AudioWaveOverlay.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/createAnalyser\(\)/.test(controller), 'AudioMixController must create an analyser for real media signal');
assert(/analyser\.fftSize\s*=\s*256/.test(controller), 'Audio analyser must have deterministic sample size');
assert(/source\.connect\(analyser\)/.test(controller) && /analyser\.connect\(gain\)/.test(controller), 'Analyser must remain in the existing audio chain');
assert(/getAggregateRmsLevel\(\)/.test(controller), 'AudioMixController must expose normalized signal level');
assert(/getByteTimeDomainData\(samples\)/.test(controller), 'Signal level must come from actual media samples');
assert(/const mix = getAudioMixController\(\);[\s\S]{0,300}mix\.getAggregateRmsLevel\(\)/.test(overlay), 'AudioWaveOverlay must consume the real audio signal');
assert(/effectiveAudioEnergy\s*=\s*Math\.max\(audioLevel/.test(overlay), 'Wave amplitude must incorporate measured RMS signal energy');
console.log('PHASE_P2_AUDIO_WAVEFORM_SIGNAL=PASS');
