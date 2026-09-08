/**
 * REPRODUCTION: Preview (CSS) and Export (Canvas2D) apply scale and rotation in a
 * DIFFERENT order, so any clip with non-uniform scale (scaleX != scaleY) AND a
 * non-zero rotation renders differently in Preview vs Export.
 *
 *   Preview : transform: translate3d(x,y,0) scale(sx,sy) rotate(r)
 *             -> matrix M_css     = T * S * R      (rotate first, then scale)
 *   Export  : ctx.translate(); ctx.rotate(); ctx.scale();
 *             -> matrix M_canvas  = T * R * S      (scale first, then rotate)
 *
 * S and R only commute when sx == sy.
 */
type M = [number, number, number, number, number, number]; // a b c d e f
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const S = (sx: number, sy: number): M => [sx, 0, 0, sy, 0, 0];
const R = (deg: number): M => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
};
const apply = (m: M, p: [number, number]) => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const cases: Array<{ name: string; scale: number; scaleX: number; scaleY: number; rotation: number }> = [
  { name: 'uniform scale + rotation 45deg', scale: 100, scaleX: 100, scaleY: 100, rotation: 45 },
  { name: 'non-uniform scale, no rotation', scale: 100, scaleX: 200, scaleY: 100, rotation: 0 },
  { name: 'non-uniform scale + rotation 45deg', scale: 100, scaleX: 200, scaleY: 100, rotation: 45 },
  { name: 'non-uniform scale + rotation 15deg', scale: 100, scaleX: 150, scaleY: 90, rotation: 15 },
];

// A point at the top-right corner of the clip box, i.e. the corner most sensitive
// to scale/rotate ordering. Box is 1632 x 918 (the canonical 85% of 1920x1080).
const corner: [number, number] = [816, -459];

let defects = 0;
for (const c of cases) {
  const sx = (c.scale / 100) * (c.scaleX / 100);
  const sy = (c.scale / 100) * (c.scaleY / 100);

  const css = mul(mul(T(0, 0), S(sx, sy)), R(c.rotation));      // translate scale rotate
  const canvas = mul(mul(T(0, 0), R(c.rotation)), S(sx, sy));    // translate rotate scale

  const pCss = apply(css, corner);
  const pCanvas = apply(canvas, corner);
  const drift = Math.hypot(pCss[0] - pCanvas[0], pCss[1] - pCanvas[1]);
  const same = near(pCss[0], pCanvas[0]) && near(pCss[1], pCanvas[1]);

  console.log(`\n--- ${c.name} ---`);
  console.log(`  scaleX=${c.scaleX} scaleY=${c.scaleY} rotation=${c.rotation}`);
  console.log(`  Preview (CSS   T*S*R) corner -> (${pCss[0].toFixed(3)}, ${pCss[1].toFixed(3)})`);
  console.log(`  Export  (Canvas T*R*S) corner -> (${pCanvas[0].toFixed(3)}, ${pCanvas[1].toFixed(3)})`);
  console.log(`  drift = ${drift.toFixed(3)} px  =>  ${same ? 'MATCH' : 'DIVERGENT'}`);
  if (!same) defects += 1;
}

console.log(`\nDivergent cases: ${defects}/${cases.length}`);
if (defects > 0) { console.log('RESULT: DEFECT REPRODUCED'); process.exit(1); }
console.log('RESULT: no defect');
