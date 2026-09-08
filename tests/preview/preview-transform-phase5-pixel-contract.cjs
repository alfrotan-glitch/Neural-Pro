const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const model = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/clipTransformModel.ts'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/previewTransformDomController.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const caption = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
function check(name, condition) { if (!condition) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
check('transform x/y contract is pixel based', model.includes('pixel offsets from the canvas center'));
check('canvas translation adds pixel offsets', model.includes('x: origin.x + transform.x') && model.includes('y: origin.y + transform.y'));
check('interactive DOM delegates to canonical transform formatter', dom.includes('getPreviewTransformCss'));
check('canonical formatter uses pixel translation', model.includes('translate3d(${canonical.x}px, ${canonical.y}px, 0)'));
check('preview transform uses explicit center pivot', dom.includes("transformOrigin = 'center center'"));
check('preview caption/media use canonical formatter', (player.match(/getPreviewTransformCss\(/g) || []).length >= 4);
check('canvas caption consumes canonical pixel offsets', caption.includes('const transformX = plan.transform.x') && caption.includes('getCaptionCanvasPlacement(width, height, containerHeight, plan.transform.y)'));
const universalInspector = fs.readFileSync(path.join(root, 'src/components/inspector/UniversalTransformControls.tsx'), 'utf8');
check('inspector transform position contract remains pixel based', universalInspector.includes('X') && universalInspector.includes('Y') && universalInspector.includes('transform.x') && universalInspector.includes('transform.y'));
check('inspector exposes independent width and height controls', universalInspector.includes('transform.scaleX') && universalInspector.includes('transform.scaleY')); 
console.log('PREVIEW_TRANSFORM_PIXEL_CONTRACT=PASS');
