const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const preview = fs.readFileSync(path.join(root, 'src/components/player/VideoPlayer.tsx'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'src/core/engine/render/CanvasExportRenderer.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/width:\s*'85%'[\s\S]*height:\s*'85%'/.test(preview), 'Preview overlay content must remain inside the canonical 85% frame');
assert(/const overlayFrame = getMediaFrameGeometry\(width, height\);/.test(exporter), 'Export overlays must use the canonical composition frame');
assert(/const overlayWidth = overlayFrame\.width;/.test(exporter), 'Export overlay width must come from canonical frame');
assert(/const overlayHeight = overlayFrame\.height;/.test(exporter), 'Export overlay height must come from canonical frame');

// Full-frame templates in Preview use absolute inset-0 roots; their Canvas counterparts
// must therefore use the same frame, not legacy 42-58% cards.
const fullFrameBranches = [
  /sourceId === 'st_cyber_sub'[\s\S]*?const w = overlayWidth;[\s\S]*?const h = overlayHeight;/,
  /sourceId === 'st_neon_outrun'[\s\S]*?const w = overlayWidth;[\s\S]*?const h = overlayHeight;/,
  /sourceId === 'st_glass_minimal'[\s\S]*?const w = overlayWidth;[\s\S]*?const h = overlayHeight;/,
  /sourceId === 'st_classic_youtube'[\s\S]*?const w = overlayWidth;[\s\S]*?const h = overlayHeight;/,
  /sourceId === 'st_matrix_glitch'[\s\S]*?const w = overlayWidth;[\s\S]*?const h = overlayHeight;/,
];
for (const pattern of fullFrameBranches) {
  assert(pattern.test(exporter), `Full-frame overlay branch lost canonical frame sizing: ${pattern}`);
}

// Image/generic overlay fallback must also use the same full-frame coordinate basis.
const fallback = exporter.slice(exporter.indexOf('const sourceId = clip.sourceId'), exporter.lastIndexOf('ctx.restore();'));
assert(/const w = overlayWidth;\s*const h = overlayHeight;/.test(fallback), 'Generic/image overlays must use canonical frame dimensions');

console.log('PHASE_P2_OVERLAY_FRAME_GEOMETRY=PASS');
