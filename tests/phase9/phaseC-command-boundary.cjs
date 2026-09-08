const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'src');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(src).filter((file) => /\.(ts|tsx)$/.test(file));
const source = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

const forbiddenDirectMutation = source.filter(({ file, text }) => {
  if (file.endsWith('useProjectStore.ts')) return false;
  return text.includes('setTracksDirect(') || text.includes('.setTracksDirect(');
});

assert.strictEqual(
  forbiddenDirectMutation.length,
  0,
  `Direct project-track mutation remains in UI/feature code: ${forbiddenDirectMutation.map(({ file }) => path.relative(root, file)).join(', ')}`,
);

const requiredCommandConsumers = [
  'components/VideoStudioPro.tsx',
  'components/inspector/InspectorEngine.tsx',
  'components/timeline/VirtualizedTimeline.tsx',
  'components/workspace/ResourceSidebar.tsx',
  'components/subscribe-generator/SettingsPanel.tsx',
];
for (const rel of requiredCommandConsumers) {
  const text = fs.readFileSync(path.join(src, rel), 'utf8');
  assert.ok(
    text.includes('createTrackSnapshotCommand') || text.includes('executeCommand'),
    `${rel} has no visible Command-based mutation path`,
  );
}

const store = fs.readFileSync(path.join(src, 'store/useProjectStore.ts'), 'utf8');
assert.ok(store.includes('hydrateTracks:'), 'Project store must expose hydration-only track loading');
assert.ok(store.includes('executeCommand:'), 'Project store must expose the Command boundary');
assert.ok(!store.includes('setTracksDirect:'), 'Legacy setTracksDirect API must be removed');

const command = fs.readFileSync(
  path.join(src, 'features/video-studio/project/commands/trackSnapshotCommand.ts'),
  'utf8',
);
assert.ok(command.includes('export class TrackSnapshotCommand'), 'TrackSnapshotCommand missing');
assert.ok(command.includes('structuredClone'), 'TrackSnapshotCommand must own immutable track snapshots');

console.log('PHASE_C_COMMAND_BOUNDARY=PASS');
console.log('direct project track mutations in UI/features = 0');
console.log('hydration-only track loading preserved');
console.log('snapshot command boundary present');
