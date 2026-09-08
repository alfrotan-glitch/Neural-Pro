const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const player = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const timeline = fs.readFileSync(path.join(root, 'src/components/timeline/VirtualizedTimeline.tsx'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/features/video-studio/shared/services/selectionInteractionService.ts'), 'utf8');
const interaction = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts'), 'utf8');

const checks = [
  ['preview selection handler', player.includes('handlePreviewClipMouseDown')],
  ['preview empty-canvas handler', player.includes('handlePreviewBackgroundMouseDown')],
  ['preview uses shared selection service', player.includes('selectionInteractionService')],
  ['timeline uses shared selection service', timeline.includes('selectionInteractionService')],
  ['toggle selection support', service.includes("mode === 'toggle'")],
  ['range selection support', service.includes("mode === 'range'")],
  ['subtractive selection support', service.includes("mode === 'subtract'")],
  ['drag history movement threshold', interaction.includes('Math.hypot(deltaX, deltaY) < 1.5')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS: ${name}`);
  else { console.error(`FAIL: ${name}`); failed += 1; }
}

process.exitCode = failed ? 1 : 0;
