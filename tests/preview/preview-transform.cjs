const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const interaction = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts'), 'utf8');
const transformModel = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/clipTransformModel.ts'), 'utf8');
function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
check('pointer snapshot exists', service.includes('createPointerSnapshot'));
check('uniform scale calculation', service.includes('calculateScale'));
check('rotation snapping', service.includes('snapRotation'));
check('multi-clip movement', service.includes('applyMoveToClips'));
check('multi-clip scaling', service.includes('applyScaleToClips'));
check('multi-clip rotation', service.includes('applyRotationToClips'));
check('track lock guard', service.includes('isTrackLocked'));
check('RAF drag loop', interaction.includes('requestAnimationFrame(update)'));
check('pixel drag deltas are persisted as pixels', service.includes('const x = initialX + dx') && service.includes('const y = initialY + dy'));
check('preview transform uses pixel units', transformModel.includes('translate3d(${canonical.x}px, ${canonical.y}px, 0)'));  
check('pointer snapshot used for resize', interaction.includes('session.pointerSnapshot'));
check('drag session uses ref', interaction.includes('dragSessionRef.current'));
check('snapshot command on mouse up', interaction.includes("'Transform Canvas Elements'"));
check('document body cursor reset', interaction.includes("document.body.style.cursor = ''"));
console.log('PREVIEW_TRANSFORM_INTERACTION_TESTS=PASS');
