const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const viewer = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx'), 'utf8');
const graph = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/renderDiagnosticCausalGraph.ts'), 'utf8');
function must(condition, message) { if (!condition) throw new Error(message); }
must(viewer.includes('buildCausalDependencyGraph'), 'viewer must consume canonical causal graph');
must(viewer.includes('graphPathFromRoot'), 'viewer must expose causal path');
must(viewer.includes('selectedCausalNodeId'), 'viewer must support node selection');
must(viewer.includes('onNavigateToProjectTime'), 'causal node navigation must use project time callback');
must(viewer.includes('Causal Dependency Graph'), 'graph section missing');
must(viewer.includes('firstFrame') && viewer.includes('lastFrame'), 'node frame details missing');
must(graph.includes('RenderDiagnosticCausalGraph'), 'graph contract missing');
console.log('PHASE99_CAUSAL_GRAPH_VIEWER = PASS');
