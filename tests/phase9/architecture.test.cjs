const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'src');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(src);
const textFiles = files.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
const text = textFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const forbiddenLegacy = [
  path.join(src, 'components', 'studio'),
  path.join(src, 'store', 'studioStore.ts'),
  path.join(src, 'hooks', 'useKeyboardShortcuts.ts'),
];

for (const target of forbiddenLegacy) {
  assert.ok(!fs.existsSync(target), `Legacy path still exists: ${path.relative(root, target)}`);
}

assert.ok(!files.some(f => /(^|[\\/])(patch|patch_effects|patch_gpu|patch_speed|patch_speed_2|patch_speed_3|patch_ultra_fast|fix)\.(py|js|cjs)$/.test(f)), 'Legacy patch script remains in src');
assert.ok(!files.some(f => /\.py$/.test(f)), 'Python source remains in src');
assert.ok(!text.includes('html-to-image'), 'DOM screenshot dependency remains');
assert.ok(!text.match(/querySelector(All)?\([^\n]*export-overlay-layer/), 'Export overlay DOM capture reference remains');

const requiredApis = [
  'features/video-studio/project/index.ts',
  'features/video-studio/timeline/index.ts',
  'features/video-studio/playback/index.ts',
  'features/video-studio/export/index.ts',
  'features/video-studio/captions/index.ts',
  'features/video-studio/overlays/index.ts',
  'features/video-studio/shell/index.ts',
];

for (const rel of requiredApis) {
  assert.ok(fs.existsSync(path.join(src, rel)), `Missing public module API: ${rel}`);
}

console.log('PHASE9_ARCHITECTURE=PASS');
