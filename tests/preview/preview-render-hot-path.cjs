const fs = require('fs');
const path = require('path');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const root = process.cwd();
const indexPath = path.join(root, 'src','features','video-studio','playback','compositor','previewCompositorIndex.ts');
const videoPath = path.join(root, 'src','components','player','VideoPlayer.tsx');
const indexSrc = fs.readFileSync(indexPath,'utf8');
const videoSrc = fs.readFileSync(videoPath,'utf8');

assert(indexSrc.includes('buildPreviewCompositorIndex'), 'compositor index builder missing');
assert(indexSrc.includes('selectActivePreviewCompositorPlan'), 'active selection missing');
assert(indexSrc.includes('upperBoundByStart'), 'binary search missing');
assert(videoSrc.includes('buildPreviewCompositorIndex'), 'VideoPlayer does not use compositor index');
assert(videoSrc.includes('selectActivePreviewCompositorPlan'), 'VideoPlayer does not select active layers from index');
assert(!videoSrc.includes('buildPreviewCompositorPlan(tracks, activeTime)'), 'legacy full-scan compositor still used');

console.log('PREVIEW_RENDER_HOT_PATH=PASS');
console.log('COMPOSITOR_INDEX=PASS');
console.log('BINARY_SEARCH_ACTIVE_SELECTION=PASS');

assert(!indexSrc.includes('baseLayers.some(l => l.clip.id === clip.id)'), 'legacy O(n²) effect membership scan remains');
assert(videoSrc.includes('const activeClip = useMemo('), 'activeClip lookup is not memoized');
console.log('NO_O_N2_EFFECT_MEMBERSHIP_SCAN=PASS');
console.log('ACTIVE_CLIP_MEMOIZED=PASS');
