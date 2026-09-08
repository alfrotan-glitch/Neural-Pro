const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
const curve = read('src/features/video-studio/timeline/components/AnimationCurveEditor.tsx');
const commands = read('src/features/video-studio/animation/keyframeCommands.ts');
const types = read('src/features/video-studio/animation/types/animation.ts');
for (const prop of ['transform.x','transform.y','transform.scaleX','transform.scaleY','transform.rotation','transform.opacity']) {
  if (!types.includes(`'${prop}'`)) throw new Error(`missing property ${prop}`);
}
if (!curve.includes('data-curve-graph="multi-property"')) throw new Error('multi-property graph contract missing');
if (!curve.includes('visibleProperties')) throw new Error('property visibility state missing');
if (!commands.includes('MoveAnimationKeyframeToPropertyCommand')) throw new Error('cross-property command missing');
if (!commands.includes('destinationProperty')) throw new Error('destination property validation missing');
const markers = read('src/features/video-studio/timeline/components/TimelineAnimationMarkers.tsx');
if (!markers.includes('Move keyframe to property')) throw new Error('property migration UI missing');
if (!curve.includes('setActiveProperty(next[0]!)')) throw new Error('hide active property fallback missing');
console.log('PHASE68_MULTI_PROPERTY_GRAPH_EDITOR=PASS');
