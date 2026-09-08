const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'src/features/video-studio/project/services/projectService.ts',
  'src/features/video-studio/timeline/services/timelineService.ts',
  'src/features/video-studio/playback/services/playbackService.ts',
  'src/features/video-studio/audio/services/audioRenderService.ts',
  'src/features/video-studio/captions/services/captionService.ts',
  'src/features/video-studio/overlays/services/overlayService.ts',
  'src/features/video-studio/export/services/exportService.ts',
];

for (const relative of required) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`Missing service: ${relative}`);
  const source = fs.readFileSync(full, 'utf8');
  if (!/export /.test(source)) throw new Error(`No public API found: ${relative}`);
}

const timeline = fs.readFileSync(
  path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx'),
  'utf8',
);
const studio = fs.readFileSync(
  path.join(root, 'src/components/VideoStudioPro.tsx'),
  'utf8',
);

if (!timeline.includes("features/video-studio/timeline/services/timelineService")) {
  throw new Error('Timeline component is not consuming the Timeline Service');
}
if (!studio.includes("features/video-studio/audio/services/projectAudioRenderService")) {
  throw new Error('VideoStudioPro is not consuming canonical Project Audio Render Service');
}
if (!studio.includes("features/video-studio/playback/services/playbackService")) {
  throw new Error('VideoStudioPro is not consuming Playback Service');
}
if (!studio.includes("features/video-studio/export/services/exportService")) {
  throw new Error('VideoStudioPro is not consuming Export Service');
}
if (!studio.includes("features/video-studio/project/services/projectService")) {
  throw new Error('VideoStudioPro is not consuming Project Service');
}

console.log('PHASE4_SERVICE_BOUNDARIES=PASS');
