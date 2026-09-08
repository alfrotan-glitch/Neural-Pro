const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function must(c,m){ if(!c) throw new Error(m); }
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/renderDiagnosticRootCauseDiffInspector.ts'),'utf8');
const viewer = fs.readFileSync(path.join(root,'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'),'utf8');
const index = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/index.ts'),'utf8');
must(service.includes('RenderDiagnosticRootCauseDiffItem'),'diff item contract missing');
must(service.includes('previousHash') && service.includes('nextHash'),'hash context missing');
must(service.includes('causalCategories') && service.includes('correlationGroupIds'),'causal/correlation context missing');
must(service.includes('buildRootCauseDiffInspector'),'inspector builder missing');
must(service.includes('previous: entry.previous') && service.includes('next: entry.next'),'previous/next values missing');
must(service.includes('rootCauseCaseId') && service.includes('projectTime'),'trace context missing');
must(index.includes('renderDiagnosticRootCauseDiffInspector'),'service export missing');
must(viewer.includes('buildRootCauseDiffInspector'),'viewer integration missing');
must(viewer.includes('Diff Inspector'),'diff inspector UI missing');
console.log('PHASE104_ROOT_CAUSE_DIFF_INSPECTOR = PASS');
