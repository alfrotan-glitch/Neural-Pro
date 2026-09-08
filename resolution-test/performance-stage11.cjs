const fs = require('fs');
const files = [
  'src/components/player/VideoPlayer.tsx',
  'src/components/timeline/VirtualizedTimeline.tsx',
  'src/features/video-studio/playback/audio/AudioMixController.ts',
];
const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const assertions = [
  ['no per-frame media query', !/\[activeTime, isPlaying, isMuted, isExporting\]/.test(text)],
  ['audio routing has centralized controller', /class AudioMixController/.test(text)],
  ['no JSON deep clone in drag hot path', !/JSON\.parse\(JSON\.stringify/.test(text)],
  ['lasso uses cached rects', /cachedClipRects/.test(text)],
  ['lasso mousemove is RAF scheduled', /requestAnimationFrame\(processLassoMove\)/.test(text)],
];
let failed = false;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  failed ||= !ok;
}
process.exitCode = failed ? 1 : 0;
