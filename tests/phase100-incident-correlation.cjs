const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function must(c,m){ if(!c) throw new Error(m); }
const viewer = fs.readFileSync(path.join(root,'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'),'utf8');
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/renderDiagnosticIncidentCorrelation.ts'),'utf8');
const index = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/index.ts'),'utf8');
must(viewer.includes('correlateDiagnosticIncidents'),'viewer must consume incident correlation');
must(viewer.includes('Cross-Incident Correlation'),'viewer correlation section missing');
must(service.includes('IncidentCorrelationResult'),'correlation result contract missing');
must(service.includes('sharedCauseKey'),'shared-cause evidence missing');
must(service.includes('overlap'),'temporal correlation rule missing');
must(index.includes('renderDiagnosticIncidentCorrelation'),'service must be exported');
console.log('PHASE100_INCIDENT_CORRELATION = PASS');
