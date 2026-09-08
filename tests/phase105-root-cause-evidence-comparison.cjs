const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function must(c,m){ if(!c) throw new Error(m); }
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/renderDiagnosticRootCauseEvidenceComparison.ts'),'utf8');
const viewer = fs.readFileSync(path.join(root,'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'),'utf8');
const index = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/index.ts'),'utf8');
must(service.includes('RenderDiagnosticRootCauseEvidenceComparisonCell'),'comparison cell contract missing');
must(service.includes('RenderDiagnosticRootCauseEvidenceComparisonPair'),'comparison pair contract missing');
must(service.includes('sharedEvidenceKeys') && service.includes('leftOnlyEvidenceKeys') && service.includes('rightOnlyEvidenceKeys'),'comparison key partitions missing');
must(service.includes('previousValues') && service.includes('nextValues'),'previous/next comparison values missing');
must(service.includes('sameValueTransitionCount') && service.includes('divergentTransitionCount'),'shared/divergent transition metrics missing');
must(service.includes('buildRootCauseEvidenceComparison'),'comparison builder missing');
must(index.includes('renderDiagnosticRootCauseEvidenceComparison'),'service export missing');
must(viewer.includes('buildRootCauseEvidenceComparison'),'viewer integration missing');
must(viewer.includes('Comparison View'),'comparison UI missing');
console.log('PHASE105_ROOT_CAUSE_EVIDENCE_COMPARISON = PASS');
