const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const snapshot = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/atomicRenderSnapshot.ts'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(snapshot.includes('export interface AtomicRenderSnapshot'), 'Missing AtomicRenderSnapshot contract');
assert(snapshot.includes('Object.freeze(transformByClipId)'), 'Render transform map must be immutable');
assert(snapshot.includes('Object.freeze(byRole)'), 'Render role collections must be immutable');
assert(snapshot.includes('evaluateClipAnimation(input.animations, layer.clip, input.commit.time)'), 'Snapshot must evaluate all transforms at one commit time');
assert(snapshot.includes('export function isAtomicRenderSnapshotCurrent'), 'Snapshot session fence missing');

assert(player.includes('createAtomicRenderSnapshot'), 'VideoPlayer must consume the atomic render snapshot');
assert(player.includes('selectActivePreviewCompositorPlan(previewCompositorIndex, coherentPresentationTime)'), 'Render membership must use coherent presentation time');
assert(player.includes('renderSnapshot.byRole.video.map'), 'Video render must consume snapshot layers');
assert(player.includes('renderSnapshot.byRole.overlay.map'), 'Overlay render must consume snapshot layers');
assert(player.includes('renderSnapshot.byRole.text.map'), 'Text render must consume snapshot layers');
assert(player.includes('renderSnapshot.transformByClipId[clip.id]'), 'Visual transforms must come from snapshot');
assert(player.includes('renderSnapshot.byClipId.get(clip.id)?.zIndex'), 'Layer z-index must come from snapshot');

console.log('PHASE83_ATOMIC_RENDER_SNAPSHOT = PASS');
