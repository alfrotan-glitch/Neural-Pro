const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const model = fs.readFileSync(path.join(root, 'src/core/engine/captionRenderModel.ts'), 'utf8');
const selector = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/selectors/captionSelectors.ts'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionRenderPlan.ts'), 'utf8');
const audio = fs.readFileSync(path.join(root, 'src/features/video-studio/audio/services/projectAudioRenderService.ts'), 'utf8');
const mapper = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');

assert.match(model, /targetTime >= word\.start && targetTime < word\.end/);
assert.match(model, /currentTime >= segment\.start && currentTime < segment\.end/);
assert.match(selector, /isTimeInClip\(currentTime, clip\)/);
assert.match(mapper, /projectTime < clip\.startAt \+ effectiveDuration/);
assert.match(audio, /getEffectiveClipTimelineDuration\(clip\)/);

// Caption boundary contract: [start,end). A word is active at start, inactive at end.
const active = (t, start, end) => t >= start && t < end;
assert.equal(active(10, 10, 11), true);
assert.equal(active(10.999999, 10, 11), true);
assert.equal(active(11, 10, 11), false);

console.log('PHASE14_CAPTION_AV_BOUNDARY_CONTRACT=PASS');
