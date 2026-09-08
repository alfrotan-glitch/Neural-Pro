const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const effects = fs.readFileSync(
  path.join(root, 'src/features/video-studio/playback/services/mediaVisualEffects.ts'),
  'utf8',
);
const preview = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');
const inspector = fs.readFileSync(path.join(root, 'src/components/inspector/panels/VideoInspectorPanel.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const mode of ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']) {
  assert(effects.includes(`'${mode}'`), `canonical blend mode missing: ${mode}`);
  assert(inspector.includes(`{ value: '${mode}',`), `Inspector blend mode drifted: ${mode}`);
}
assert(/const filter = `brightness\(\$\{100 \+ brightness\}%\) contrast\(\$\{100 \+ contrast\}%\) saturate\(\$\{100 \+ saturation\}%\)`/.test(effects), 'canonical media filter formula missing');
assert(/getMediaVisualEffects\(clip\.properties\)/.test(preview), 'Preview must use canonical media visual effects');
assert(/filter: mediaVisualEffects\.cssFilter/.test(preview), 'Preview filter must come from canonical effects');
assert(/mixBlendMode: mediaVisualEffects\.cssBlendMode/.test(preview), 'Preview blend mode must come from canonical effects');
assert(/getMediaVisualEffects\(clip\.properties \|\| \{\}\)/.test(exporter), 'Export must use canonical media visual effects');
assert(/ctx\.filter = mediaVisualEffects\.canvasFilter/.test(exporter), 'Export must apply canonical canvas filter');
assert(/ctx\.globalCompositeOperation = mediaVisualEffects\.canvasCompositeOperation/.test(exporter), 'Export must apply canonical blend mode');
console.log('PHASE_P1_MEDIA_VISUAL_EFFECTS=PASS');
