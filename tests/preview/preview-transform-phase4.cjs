const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const interaction = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformDomController.ts'), 'utf8');
function check(name, condition) { if (!condition) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
check('drag session uses ref, not React drag state', interaction.includes('dragSessionRef = useRef') && !interaction.includes('const [dragContext'));
check('mouse move never commits tracks directly', !interaction.includes('setTracksDirect(nextTracks)'));
check('mouse move has no HUD React state update', !interaction.includes('setHudData('));
check('mouse move uses RAF', interaction.includes('requestAnimationFrame(update)'));
check('direct DOM clip transform exists', dom.includes('applyClipTransformToDom'));
check('clip nodes have stable preview identifiers', player.includes('data-preview-clip-id={clip.id}'));
check('multi-selection excludes locked tracks', dom.includes('if (track.isLocked) continue;'));
check('final transform commits through command', interaction.includes("'Transform Canvas Elements'"));
check('cancel cleanup clears DOM overrides', dom.includes('clearClipTransformOverrides'));
console.log('PREVIEW_TRANSFORM_PHASE4=PASS');
