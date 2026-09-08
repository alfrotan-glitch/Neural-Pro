const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync('src/features/video-studio/playback/compositor/previewCompositor.ts', 'utf8');
const player = fs.readFileSync('src/components/player/VideoPlayer.tsx', 'utf8');

assert(src.includes('buildPreviewCompositorPlan'), 'compositor plan API missing');
assert(src.includes('byClipId'), 'clip metadata index missing');
assert(src.includes('getPreviewLayerZIndex'), 'z-index must remain deterministic');
assert(!player.includes('tracks.findIndex(t => t.clips.some(c => c.id === clip.id))'), 'player still performs repeated track scan for z-index');
assert((player.match(/buildPreviewCompositorIndex|selectActivePreviewCompositorPlan|buildPreviewCompositorPlan/g) || []).length >= 1, 'player does not consume compositor plan');

console.log('PREVIEW_COMPOSITOR_PHASE11=PASS');
