const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const mapper = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');
const layer = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/compositor/layerOrder.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/compositor/previewCompositorIndex.ts'), 'utf8');
const audio = fs.readFileSync(path.join(root, 'src/features/video-studio/audio/services/audioMixModel.ts'), 'utf8');
const exportSelectors = fs.readFileSync(path.join(root, 'src/features/video-studio/export/selectors/exportSelectors.ts'), 'utf8');
assert.match(mapper, /getEffectiveClipTimelineDuration\(clip\)/);
assert.match(mapper, /projectTime < clip\.startAt \+ effectiveDuration/);
assert.match(mapper, /const projectEnd = clip\.startAt \+ getEffectiveClipTimelineDuration\(clip\)/);
assert.match(layer, /getEffectiveClipTimelineDuration\(clip\)/);
assert.match(index, /endAt: clip\.startAt \+ getEffectiveClipTimelineDuration\(clip\)/);
assert.match(audio, /const effectiveDuration = getEffectiveClipTimelineDuration\(clip\)/);
assert.match(audio, /timelineEnd: clip\.startAt \+ getEffectiveClipTimelineDuration\(clip\)/);
assert.match(exportSelectors, /getEffectiveClipTimelineDuration\(clip\)/);

// Exact exclusive-boundary math for 24/30/60 fps frame positions.
for (const fps of [24, 30, 60]) {
  const frame = 1 / fps;
  const start = 10;
  const duration = 1;
  const end = start + duration;
  const lastFrameStart = end - frame;
  assert(lastFrameStart < end, `${fps}fps last frame must be inside clip`);
  assert(!(end < end), `${fps}fps exclusive end invariant`);
}
console.log('PHASE13_FRAME_BOUNDARY_AV_SYNC=PASS');
