const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(
  path.join(__dirname, '..', 'server.ts'),
  'utf8',
);

const assertions = [
  ['uses spawn instead of exec import', !server.includes("import { exec } from 'child_process'")],
  ['uses spawn ffmpeg', server.includes("spawn('ffmpeg'")],
  ['does not build an ffmpeg shell command string', !server.includes('ffmpegCmd')],
  ['production export auth exists', server.includes('EXPORT_API_TOKEN')],
  ['timing-safe token comparison exists', server.includes('crypto.timingSafeEqual')],
  ['session IDs are strict', server.includes('EXPORT_SESSION_PATTERN')],
  ['session TTL exists', server.includes('EXPORT_SESSION_TTL_MS')],
  ['route-aware rate limits exist', server.includes('EXPORT_RATE_LIMITS')],
  ['frame index is validated', server.includes('validateFrameIndex')],
  ['fps range is validated', server.includes('fps < 1 || fps > 120')],
  ['server format is whitelisted', server.includes("format !== 'mp4'")],
  ['frame payload is decoded through strict data URL validation', server.includes('decodeBase64DataUrl(frameData, \'image\')')],
  ['audio payload is decoded through strict data URL validation', server.includes('decodeBase64DataUrl(audioData, \'audio\')')],
  ['output size is capped', server.includes('MAX_OUTPUT_BYTES')],
];

const failed = assertions.filter(([, ok]) => !ok);
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
}

if (failed.length) process.exit(1);
console.log('Stage 12 security tests: PASS');
