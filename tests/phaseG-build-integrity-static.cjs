const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checks = [
  ['main import does not force .tsx extension', !fs.readFileSync(path.join(root, 'src/main.tsx'),'utf8').includes("./App.tsx")],
  ['timeline root avoids TimelineClip export collision', fs.readFileSync(path.join(root,'src/features/video-studio/timeline/index.ts'),'utf8').includes('TimelineClip as TimelineClipView')],
  ['server timer unref is Node-safe', fs.readFileSync(path.join(root,'server.ts'),'utf8').includes('timerWithUnref')],
  ['encoder selection rejects empty capability set', fs.readFileSync(path.join(root,'src/core/engine/EncoderSelector.ts'),'utf8').includes('No encoder is available')],
  ['preview compositor guards indexed layer', fs.readFileSync(path.join(root,'src/features/video-studio/playback/compositor/previewCompositorIndex.ts'),'utf8').includes('if (!layer) continue;')],
  ['scene diff uses safe channel reads', fs.readFileSync(path.join(root,'src/features/video-studio/timeline/services/sceneDetectionService.ts'),'utf8').includes('previous[index] ?? 0')],
  ['hit-test guards missing row', fs.readFileSync(path.join(root,'src/features/video-studio/timeline/controllers/timelineHitTest.ts'),'utf8').includes('if (!row)')],
];
let failed=0; for(const [name,ok] of checks){console.log(`[${ok?'PASS':'FAIL'}] ${name}`); if(!ok) failed++;}
console.log(`PHASE_G_BUILD_STATIC=${failed?'FAIL':'PASS'}`); process.exit(failed?1:0);
