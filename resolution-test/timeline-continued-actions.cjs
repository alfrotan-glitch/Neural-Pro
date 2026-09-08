const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const action = read('src/features/video-studio/timeline/services/timelineActionService.ts');
const scenes = read('src/features/video-studio/timeline/services/sceneDetectionService.ts');
const renderer = read('src/core/engine/render/CanvasExportRenderer.ts');
const exportTypes = read('src/features/video-studio/export/types/settings.ts');
const exportSelectors = read('src/features/video-studio/export/selectors/exportSelectors.ts');
const shell = read('src/components/VideoStudioPro.tsx');
const sidebar = read('src/components/workspace/ResourceSidebar.tsx');
const inspector = read('src/components/inspector/InspectorEngine.tsx');

const required = [
  [action, 'recoverAudioFromVideo', 'recoverAudioFromVideo'],
  [action, 'convertImageToVideo', 'convertImageToVideo'],
  [action, 'splitVideoIntoScenes', 'splitVideoIntoScenes'],
  [scenes, 'detectSceneCuts', 'detectSceneCuts'],
  [renderer, 'imageToVideoEnabled', 'image-to-video renderer'],
  [exportTypes, 'clipIds?: string[]', 'export clip scope'],
  [exportSelectors, 'selectExportScope', 'export scope selector'],
  [shell, 'video-studio:timeline:export-selected', 'selected export event'],
  [shell, 'video-studio:timeline:render-selected', 'selected render event'],
  [sidebar, 'video-studio:timeline:transcribe', 'timeline transcript event'],
  [inspector, 'video-studio:timeline:edit-effects', 'timeline edit-effects event'],
];

let failures = 0;
for (const [source, needle, label] of required) {
  if (!source.includes(needle)) {
    console.error(`FAIL: ${label}`);
    failures += 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failures) process.exit(1);
console.log('TIMELINE_CONTINUED_ACTIONS=PASS');
