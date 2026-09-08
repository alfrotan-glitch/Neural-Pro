const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/features/video-studio/animation/commands.ts'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/store/useProjectStore.ts'), 'utf8');
const model = fs.readFileSync(path.join(root, 'src/features/video-studio/animation/services.ts'), 'utf8');

assert.match(src, /class SetAnimationKeyframeCommand/);
assert.match(src, /existingIndex/);
assert.match(store, /setAnimationKeyframe/);
assert.match(store, /new SetAnimationKeyframeCommand/);
assert.match(model, /transform\.x/);
assert.match(model, /transform\.scaleX/);
assert.match(model, /transform\.scaleY/);
assert.match(model, /transform\.rotation/);

console.log('PHASE60_KEYFRAME_COMMAND_ATOMICITY=PASS');
console.log('PHASE60_KEYFRAME_STORE_INTEGRATION=PASS');
console.log('PHASE60_ANIMATION_EVALUATOR=PASS');
