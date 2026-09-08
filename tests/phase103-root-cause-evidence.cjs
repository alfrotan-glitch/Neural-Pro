const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function must(c,m){ if(!c) throw new Error(m); }
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/renderDiagnosticRootCauseEvidence.ts'),'utf8');
const viewer = fs.readFileSync(path.join(root,'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'),'utf8');
const index = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/index.ts'),'utf8');
must(service.includes('RenderDiagnosticRootCauseCaseEvidence'),'case evidence contract missing');
must(service.includes('RenderDiagnosticRootCauseEvidenceItem'),'evidence item contract missing');
must(service.includes('incidentEvidence') && service.includes('frameEvidence'),'incident/frame evidence missing');
must(service.includes('causalPaths') && service.includes('correlationEvidence'),'causal/correlation evidence missing');
must(service.includes('previewHash') && service.includes('exportHash'),'frame hash provenance missing');
must(service.includes('buildRootCauseEvidenceExplorer'),'evidence explorer service missing');
must(service.includes('canonical') && service.includes('read-only'),'canonical/read-only contract missing');
must(viewer.includes('buildRootCauseEvidenceExplorer'),'viewer must consume evidence explorer');
must(viewer.includes('Root-Cause Evidence Explorer'),'evidence explorer section missing');
must(viewer.includes('Causal Evidence') && viewer.includes('Frame Evidence'),'evidence categories missing from viewer');
must(index.includes('renderDiagnosticRootCauseEvidence'),'service export missing');
console.log('PHASE103_ROOT_CAUSE_EVIDENCE_EXPLORER = PASS');
