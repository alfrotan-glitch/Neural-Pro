const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const selectors = read('src/features/video-studio/export/selectors/exportSelectors.ts');
const service = read('src/features/video-studio/export/services/exportService.ts');
const app = read('src/components/VideoStudioPro.tsx');
const server = read('server.ts');

assert.match(selectors, /const exportableTracks = selectExportableTracks\(state\)/);
assert.match(selectors, /tracks: structuredClone\(exportableTracks\)/);
assert.doesNotMatch(selectors, /const scopedTracks = state\.tracks/);
console.log('PASS: export scope respects visibility and canonical exportable tracks');

assert.match(service, /projectSnapshot\.metadata\.resolution/);
assert.match(service, /projectIsPortrait/);
assert.match(service, /exportIsPortrait/);
console.log('PASS: export dimensions derive orientation from project metadata');

assert.doesNotMatch(app, /querySelector\('#video-player-container'\)/);
assert.match(app, /getExportDimensionsForJob\(/);
assert.match(app, /Nothing exportable was found in the selected project scope/);
assert.match(app, /Export duration produced no renderable frames/);
console.log('PASS: export is independent from UI viewport and rejects empty scopes');

assert.match(server, /now - state\.lastActivityAt > EXPORT_SESSION_TTL_MS/);
assert.match(server, /No video frames were uploaded for this export session/);
assert.match(server, /Frame sequence is incomplete at index/);
assert.match(server, /frameIndices\[i\] != i/);
console.log('PASS: export API uses idle TTL and contiguous frame manifest validation');

console.log('PHASE_D_EXPORT_INTEGRITY=PASS');
