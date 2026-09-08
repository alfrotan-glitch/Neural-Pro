const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p){ return fs.readFileSync(path.join(root,p),'utf8'); }
function must(cond,msg){ if(!cond) throw new Error(msg); }
const svc = read('src/features/video-studio/playback/services/renderDiagnosticMismatchClustering.ts');
const index = read('src/features/video-studio/playback/services/index.ts');
must(svc.includes('clusterDiagnosticMismatches'), 'mismatch clustering missing');
must(svc.includes('incidentId') && svc.includes('startFrame') && svc.includes('endFrame'), 'incident range contract missing');
must(svc.includes('dominantCategory') && svc.includes('firstCause'), 'root-cause fields missing');
must(svc.includes('frame.frameIndex !== previous.frameIndex + 1'), 'adjacent-frame clustering rule missing');
must(index.includes("renderDiagnosticMismatchClustering"), 'service export missing');
console.log('PHASE96_MISMATCH_RANGE_LOCALIZATION = PASS');
