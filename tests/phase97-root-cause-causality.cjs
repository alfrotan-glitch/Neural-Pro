const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(p){ return fs.readFileSync(path.join(root,p),'utf8'); }
function must(cond,msg){ if(!cond) throw new Error(msg); }
const svc = read('src/features/video-studio/playback/services/renderDiagnosticCausality.ts');
const idx = read('src/features/video-studio/playback/services/index.ts');
const viewer = read('src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx');
must(svc.includes('analyzeMismatchIncidentCausality'), 'causality analyzer missing');
must(svc.includes('persistenceCount') && svc.includes('confidence'), 'causal evidence metrics missing');
must(svc.includes("'root-cause'") && svc.includes("'consequence'"), 'causal roles missing');
must(svc.includes('firstFrame'), 'temporal first-occurrence analysis missing');
must(svc.includes('incident.startFrame') && svc.includes('incident.endFrame'), 'incident window filtering missing');
must(idx.includes("renderDiagnosticCausality"), 'service export missing');
must(viewer.includes('analyzeMismatchIncidentCausality'), 'viewer causality integration missing');
must(viewer.includes('Cause candidate:'), 'viewer causal result missing');
console.log('PHASE97_ROOT_CAUSE_CAUSALITY = PASS');
