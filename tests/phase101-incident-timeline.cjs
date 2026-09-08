const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function must(c,m){ if(!c) throw new Error(m); }
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/renderDiagnosticIncidentTimeline.ts'),'utf8');
const viewer = fs.readFileSync(path.join(root,'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'),'utf8');
const index = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/index.ts'),'utf8');
must(service.includes('RenderDiagnosticIncidentTimeline'),'timeline contract missing');
must(service.includes("'incident-start'") && service.includes("'incident-end'"),'incident lifecycle events missing');
must(service.includes("'correlation-group'"),'correlation event missing');
must(service.includes("'root-cause'"),'root cause event missing');
must(service.includes('events.sort'),'deterministic sorting missing');
must(viewer.includes('buildDiagnosticIncidentTimeline'),'viewer must consume incident timeline');
must(viewer.includes('Incident Timeline'),'viewer timeline missing');
must(viewer.includes('selectedIncidentId'),'incident selection missing');
must(index.includes('renderDiagnosticIncidentTimeline'),'service export missing');
console.log('PHASE101_INCIDENT_TIMELINE = PASS');
