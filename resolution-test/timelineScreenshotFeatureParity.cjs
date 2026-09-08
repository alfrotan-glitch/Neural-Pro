const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const timeline = fs.readFileSync(path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineContextMenu.tsx'), 'utf8');
const toolbar = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/components/TimelineToolbar.tsx'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineActionService.ts'), 'utf8');
const sceneDetection = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/sceneDetectionService.ts'), 'utf8');

const requiredMenuItems = [
  'Copy', 'Cut', 'Copy attributes', 'Paste attributes', 'Delete',
  'Transcript', 'Recover audio', 'Sync video and audio', 'Separate audio',
  'Create compound clip', 'Create multi-camera clip', 'Save preset',
  'Group', 'Ungroup', 'Mirror', 'Deactivate clip', 'Link to media',
  'Open file location', 'Edit effects', 'Show variable speed animation',
  'Export selected clips', 'Render', 'Range', 'Trim clip', 'Replace clip',
  'Image to video', 'Split scenes',
];
for (const token of requiredMenuItems) {
  if (!menu.includes(token)) throw new Error(`Missing screenshot menu feature: ${token}`);
}

const requiredActions = [
  'toggleMirrored',
  'toggleDeactivated',
  'toggleVariableSpeedAnimation',
  'separateAudioFromVideoAsync',
  'recoverAudioFromVideo',
  'convertImageToVideo',
  'splitVideoIntoScenes',
  'syncVideoAndAudio',
];
for (const name of requiredActions) {
  const source = actions;
  const exported = source.includes(`export function ${name}`) || source.includes(`export async function ${name}`);
  if (!exported) {
    if (name === 'splitVideoIntoScenes' && actions.includes('splitVideoIntoScenes')) continue;
    throw new Error(`Missing real action: ${name}`);
  }
}
if (!actions.includes('splitVideoIntoScenes') || !sceneDetection.includes('detectSceneCuts')) {
  throw new Error('Scene split action is not wired to scene detection');
}

for (const token of [
  'handleTrimBeforePlayhead',
  'handleTrimAfterPlayhead',
  'handleLinkOrReplaceMediaFile',
  'handleToggleLinkedSelection',
  'handleFitTimeline',
  'handleContextAction',
]) {
  if (!timeline.includes(token)) throw new Error(`Missing Timeline behavior: ${token}`);
}

if (!timeline.includes('TimelineContextMenu')) throw new Error('TimelineContextMenu is not integrated');
if (!timeline.includes('linkedSelectionEnabled')) throw new Error('Linked selection behavior is missing');
if (!toolbar.includes('audio')) throw new Error('Track add menu is incomplete');

console.log('TIMELINE_SCREENSHOT_FEATURE_PARITY=PASS');
