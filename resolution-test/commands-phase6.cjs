const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checks = [
  ['project commands', 'src/features/video-studio/project/commands/index.ts'],
  ['timeline commands', 'src/features/video-studio/timeline/commands/index.ts'],
  ['overlay commands', 'src/features/video-studio/overlays/commands/index.ts'],
];
for (const [name, rel] of checks) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`${name} missing`);
}
const core = fs.readFileSync(path.join(root, 'src/core/commands/types.ts'), 'utf8');
if (/class\s+\w+Command/.test(core)) throw new Error('Core contains command implementation');
const timelineUi = fs.readFileSync(path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx'), 'utf8');
if (/export const createTracksSnapshotCommand/.test(timelineUi)) throw new Error('Timeline UI owns command implementation');
console.log('PHASE6_COMMAND_BOUNDARIES=PASS');
