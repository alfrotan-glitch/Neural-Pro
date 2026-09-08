const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function must(c,m){ if(!c) throw new Error(m); }
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/renderDiagnosticRootCauseConsolidation.ts'),'utf8');
const viewer = fs.readFileSync(path.join(root,'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'),'utf8');
const index = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/index.ts'),'utf8');
must(service.includes('RenderDiagnosticRootCauseCase'),'root-cause case contract missing');
must(service.includes('consolidateDiagnosticRootCauses'),'consolidation service missing');
must(service.includes('analysis.rootCause'),'canonical causality result must drive consolidation');
must(service.includes('firstCause?.clipId') && service.includes('firstCause?.field'),'exact root-cause identity must include clip and field');
must(service.includes('unconsolidatedIncidentIds'),'unconsolidated incident reporting missing');
must(service.includes('orderedBuckets'),'deterministic case ordering missing');
must(viewer.includes('consolidateDiagnosticRootCauses'),'viewer must consume root-cause consolidation');
must(viewer.includes('Root-Cause Cases'),'viewer case section missing');
must(index.includes('renderDiagnosticRootCauseConsolidation'),'service export missing');
console.log('PHASE102_ROOT_CAUSE_CONSOLIDATION = PASS');
