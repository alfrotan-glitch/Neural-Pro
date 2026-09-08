const fs = require('fs');
const path = require('path');

const required = [
  'src/features/video-studio/project/selectors/projectSelectors.ts',
  'src/features/video-studio/timeline/selectors/timelineSelectors.ts',
  'src/features/video-studio/playback/selectors/playbackSelectors.ts',
  'src/features/video-studio/export/selectors/exportSelectors.ts',
  'src/features/video-studio/captions/selectors/captionSelectors.ts',
  'src/features/video-studio/overlays/selectors/overlaySelectors.ts',
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing selector module: ${file}`);
}

const source = fs.readFileSync('src/components/VideoStudioPro.tsx', 'utf8');
if (!source.includes("../features/video-studio/project/selectors/projectSelectors")) {
  throw new Error('VideoStudioPro is not consuming canonical project selectors');
}

const service = fs.readFileSync('src/features/video-studio/project/services/projectService.ts', 'utf8');
if (!service.includes("../selectors/projectSelectors")) {
  throw new Error('ProjectService is not consuming canonical project selectors');
}

const exportService = fs.readFileSync('src/features/video-studio/export/services/exportService.ts', 'utf8');
if (!exportService.includes("../selectors/exportSelectors")) {
  throw new Error('ExportService is not consuming canonical export selectors');
}

console.log('PHASE5_SELECTOR_BOUNDARIES=PASS');
