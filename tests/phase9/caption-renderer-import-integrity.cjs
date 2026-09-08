const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../../src/core/engine/CaptionRenderer.ts');
const source = fs.readFileSync(file, 'utf8');

const matches = source.match(/import\s*\{\s*isTimeInClip\s*\}\s*from\s*['\"]\.\.\/\.\.\/features\/video-studio\/project\/time\/intervals['\"];?/g) || [];
if (matches.length !== 1) {
  throw new Error(`Expected exactly one isTimeInClip import in CaptionRenderer.ts; found ${matches.length}`);
}

console.log('CAPTION_RENDERER_IMPORT_INTEGRITY=PASS');
