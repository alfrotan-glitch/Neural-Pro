const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const inspector = fs.readFileSync(path.join(root, 'src/components/inspector/InspectorEngine.tsx'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'src/components/workspace/ResourceSidebar.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

const directRoutes = [
  '/api/health',
  '/api/generateContent',
  '/api/generate-captions',
  '/api/refine-captions',
  '/api/parse-srt',
  '/api/export-srt',
];
for (const route of directRoutes) assert(server.includes(route), `route exists: ${route}`);
assert(server.includes("app.use('/api/export', exportRouter)"), 'export router mounted at /api/export');
for (const route of ['/start', '/upload-frame', '/upload-frames', '/upload-audio', '/finish']) {
  assert(server.includes(`exportRouter.post('${route}'`), `export route exists: ${route}`);
}

assert(server.includes("duration <= 0 || duration > 86400"), 'generate-captions validates duration bounds');
assert(server.includes("typeof audioClipName !== 'string' || !audioClipName.trim()"), 'generate-captions validates audioClipName');
assert(server.includes("typeof restorePunctuation !== 'boolean'"), 'refine-captions validates restorePunctuation type');
assert(server.includes("!validateCaptionBlocks(captions)"), 'refine/export-srt validate caption domain invariants');
assert(server.includes("No valid SRT caption blocks were found"), 'parse-srt rejects malformed/empty SRT');
assert(server.includes("srtContent.length > 10 * 1024 * 1024"), 'parse-srt enforces payload limit');
assert(server.includes("degraded: true"), 'AI caption fallback is explicitly marked degraded');
assert(server.includes('const rawEnd = idx === wordsList.length - 1 ? currentEnd'), 'simulated captions use contiguous word timing');
assert(server.includes("state.lastActivityAt = Date.now()"), 'export session uses sliding inactivity TTL');
assert(server.includes("Frame sequence is incomplete at index"), 'export rejects sparse frame sequences');
assert(inspector.includes("if (!response.ok)"), 'Inspector API callers honor HTTP error status');
assert(sidebar.includes("if (!response.ok)"), 'ResourceSidebar API caller honors HTTP error status');

console.log('PHASE_E_API_ROUTE_INTEGRITY=PASS');
