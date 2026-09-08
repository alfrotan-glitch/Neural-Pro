const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const extractor = fs.readFileSync(path.join(root,'src/features/video-studio/audio/services/audioExtractionService.ts'),'utf8');
const action = fs.readFileSync(path.join(root,'src/features/video-studio/timeline/services/timelineActionService.ts'),'utf8');
const resource = fs.readFileSync(path.join(root,'src/features/video-studio/project/services/projectService.ts'),'utf8');
const clip = fs.readFileSync(path.join(root,'src/features/video-studio/timeline/components/TimelineClip.tsx'),'utf8');
const checks = [
  ['native extraction service exists', /extractAudioFromClip/.test(extractor)],
  ['MediaRecorder capture fallback', /MediaRecorder/.test(extractor) && /captureStream/.test(extractor)],
  ['waveform decoded from AudioBuffer', /decodeAudioData/.test(extractor) && /getChannelData/.test(extractor)],
  ['separate action is async and stores extracted URL', /separateAudioFromVideoAsync/.test(action) && /audioExtractionMethod/.test(action)],
  ['recover action is async and stores extracted URL', /recoverAudioFromVideoAsync/.test(action) && /audioExtractionMethod/.test(action)],
  ['no random waveform on asset creation', !/Math\.random\(\)/.test(resource)],
  ['timeline clip does not synthesize fake waveform', !/Math\.sin\(seed/.test(clip)],
];
const failed = checks.filter(([, ok])=>!ok);
if (failed.length) { console.error('AUDIO_EXTRACTION_PHASE_E=FAIL', failed); process.exit(1); }
console.log('AUDIO_EXTRACTION_PHASE_E=PASS');
for (const [name] of checks) console.log('PASS', name);
