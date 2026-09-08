const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const service = path.join(root, 'src/features/video-studio/captions/services/captionTimecodeService.ts');
const importSvc = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/services/captionImportService.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const inspector = fs.readFileSync(path.join(root, 'src/components/inspector/InspectorEngine.tsx'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'src/components/workspace/ResourceSidebar.tsx'), 'utf8');
function assert(c, m) { if (!c) throw new Error(m); }

const runtimeScript = `
import { parseCaptionTimestamp, secondsToFrameTimecode, secondsToSrtTimestamp, normalizeSrtTimestamp } from ${JSON.stringify(service)};
const cases = [
  ['00:00:12:15', 12.5],
  ['00:01:02:03', 62.1],
  ['00:00:12,345', 12.345],
  ['00:00:12.345', 12.345],
  ['12.345', 12.345],
];
for (const [input, expected] of cases) {
  const actual = parseCaptionTimestamp(input);
  if (Math.abs(actual - expected) > 1e-9) throw new Error(input + ' -> ' + actual + ', expected ' + expected);
}
if (secondsToFrameTimecode(12.5) !== '00:00:12:15') throw new Error('frame formatter regression');
if (secondsToSrtTimestamp(12.345) !== '00:00:12,345') throw new Error('SRT formatter regression');
if (normalizeSrtTimestamp('00:00:12.345') !== '00:00:12,345') throw new Error('SRT normalization regression');
for (const bad of ['00:60:00,000', '00:00:60,000', '00:00:01:30']) {
  let threw = false; try { parseCaptionTimestamp(bad); } catch { threw = true; }
  if (!threw) throw new Error('invalid timestamp accepted: ' + bad);
}
console.log('CAPTION_TIMECODE_RUNTIME=PASS');
`;
const tmp = path.join(require('os').tmpdir(), 'phaseB-caption-timecode-test.mjs');
fs.writeFileSync(tmp, runtimeScript);
execFileSync(process.execPath, ['--experimental-strip-types', tmp], { stdio: 'inherit' });
fs.unlinkSync(tmp);

assert(server.includes("import { parseCaptionTimestamp, secondsToFrameTimecode, secondsToSrtTimestamp, normalizeSrtTimestamp }"), 'server does not use canonical caption timecode service');
assert(!server.includes('function timecodeToSeconds('), 'duplicate server timecode parser remains');
assert(!server.includes('function srtTimeToSeconds('), 'duplicate SRT parser remains');
assert(server.includes("start_time: normalizeSrtTimestamp(srtStart)"), 'SRT start timestamp loses millisecond fidelity');
assert(server.includes("end_time: normalizeSrtTimestamp(srtEnd)"), 'SRT end timestamp loses millisecond fidelity');
assert(server.includes('idx === wordsList.length - 1 ? endSeconds'), 'SRT word timings do not close exactly on block end');
assert(server.includes('return Math.abs(previousEnd - end) <= 1e-6;'), 'caption validator does not require continuous word timing');
assert(importSvc.includes('word timing contains a gap or overlap'), 'caption normalization does not reject word timing gaps/overlaps');
assert(server.includes('validateCaptionBlocks(captions)'), 'generated caption output is not runtime-validated');
assert(server.includes('validateRefinedCaptions(captions, refined)'), 'refine API does not protect original timing');
assert(server.includes('refineCaptionsHeuristically(captions, restorePunctuation)'), 'fallback refinement ignores restorePunctuation');
assert(server.includes('const properNouns = [\'french\', \'croissant\', \'masterclass\']'), 'heuristic proper noun list contains common words');
assert(server.includes("if (!refine) {\n        return res.json({ captions: parsed, fallback: false, source: 'srt' });"), 'SRT import is not lossless by default');
assert(server.includes('refinementFailed: true'), 'SRT refinement failure does not expose explicit status');
assert(importSvc.includes("export { parseCaptionTimestamp } from './captionTimecodeService';"), 'caption import service does not expose canonical parser');
assert(inspector.includes("import { parseCaptionTimestamp } from '../../features/video-studio/captions/services/captionTimecodeService';"), 'Inspector does not use canonical parser');
assert(sidebar.includes("import { parseCaptionTimestamp } from '../../features/video-studio/captions/services/captionTimecodeService';"), 'ResourceSidebar does not use canonical parser');
assert(!inspector.includes('const timecodeToSeconds'), 'Inspector duplicate timecode parser remains');
assert(!sidebar.includes('const parseTimecode'), 'ResourceSidebar duplicate timecode parser remains');

console.log('PHASE_B_CAPTION_INTEGRITY=PASS');
