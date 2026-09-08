const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p){ return fs.readFileSync(path.join(root,p),'utf8'); }
function must(cond,msg){ if(!cond) throw new Error(msg); }
const svc = read('src/features/video-studio/playback/services/renderDiagnosticMultiFrameCapture.ts');
const idx = read('src/features/video-studio/playback/services/index.ts');
const viewer = read('src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx');
must(svc.includes('captureDiagnosticFrameRange'), 'multi-frame capture missing');
must(svc.includes('firstMismatchFrame') && svc.includes('lastMismatchFrame'), 'first/last mismatch summary missing');
must(svc.includes('mismatchFrameCount'), 'mismatch count missing');
must(idx.includes("renderDiagnosticMultiFrameCapture"), 'service export missing');
must(viewer.includes('Frame Range Diagnostics'), 'viewer range diagnostics missing');
must(viewer.includes('Capture 1s'), 'viewer capture action missing');
console.log('PHASE95_MULTI_FRAME_DIAGNOSTIC_CAPTURE = PASS');
