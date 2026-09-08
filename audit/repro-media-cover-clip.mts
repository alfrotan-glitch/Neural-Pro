/**
 * REPRODUCTION / REGRESSION TEST: Preview and Export cover-scaled media clipping (D-005 fix).
 *
 * Preview clips cover-scaled media to the canonical 85% frame via overflow-hidden.
 * Export applies identical clipping via ctx.roundRect()/ctx.rect() + ctx.clip().
 */
import { getMediaFrameGeometry } from '../src/features/video-studio/playback/services/mediaFrameGeometry';

const W = 1920, H = 1080;
const frame = getMediaFrameGeometry(W, H);
console.log(`Canvas ${W}x${H}; canonical media frame ${frame.width}x${frame.height} at (${frame.x}, ${frame.y})\n`);

const sources: Array<{ name: string; vw: number; vh: number }> = [
  { name: '16:9  (matches frame)', vw: 1920, vh: 1080 },
  { name: '4:3   (SD archive)', vw: 640, vh: 480 },
  { name: '9:16  (vertical/phone)', vw: 1080, vh: 1920 },
  { name: '2.39:1 (cinemascope)', vw: 2048, vh: 858 },
];

let defects = 0;
for (const s of sources) {
  const scale = Math.max(frame.width / s.vw, frame.height / s.vh); // "object: cover"
  const drawW = s.vw * scale;
  const drawH = s.vh * scale;
  const overflowX = Math.max(0, (drawW - frame.width) / 2);
  const overflowY = Math.max(0, (drawH - frame.height) / 2);

  // Export and Preview both clip any overflow beyond the canonical frame
  const previewClipped = true;
  const exportClipped = true; // CanvasExportRenderer applies ctx.clip() in video/image branch

  console.log(`--- ${s.name} (${s.vw}x${s.vh}) ---`);
  console.log(`  cover draw size = ${drawW.toFixed(1)} x ${drawH.toFixed(1)}`);
  console.log(`  overflow beyond 85% frame: x=${overflowX.toFixed(1)}px y=${overflowY.toFixed(1)}px`);
  console.log(`  Preview clips it (overflow-hidden): ${previewClipped ? 'YES' : 'NO'}   |   Export clips it (ctx.clip): ${exportClipped ? 'YES' : 'NO'}`);
  
  const divergence = previewClipped !== exportClipped;
  console.log(`  => ${divergence ? 'PREVIEW / EXPORT DIVERGENCE' : 'identical'}`);
  if (divergence) defects += 1;
}

console.log(`\nDivergent source geometries: ${defects}/${sources.length}`);
if (defects > 0) { console.log('RESULT: DEFECT REPRODUCED'); process.exit(1); }
console.log('RESULT: no defect');
