import assert from 'node:assert/strict';
import { ExportMediaPool, MediaPrepareError } from '../../../src/infra/media/ExportMediaPool';
import { resolveMediaForClip } from '../../../src/domain/export/resolveMediaForClip';
import type { ClipNode } from '../../../src/features/video-studio/project/types/project';

console.log('--- RUNNING EXPORT MEDIA POOL LIFECYCLE TESTS ---');

// 1. Translation: resolveMediaForClip ignores deactivated clips
const activeClip: ClipNode = {
  id: 'c_active',
  sourceId: 'src_1',
  startAt: 0,
  duration: 10,
  trim: { in: 1, out: 9 },
  transform: { x: 0, y: 0, scale: 100, rotation: 0 },
  properties: { videoUrl: 'https://cdn.example.com/v.mp4' },
};
const deactivatedClip: ClipNode = {
  ...activeClip,
  id: 'c_inactive',
  properties: { ...activeClip.properties, deactivated: true },
};

const reqActive = resolveMediaForClip(activeClip);
const reqInactive = resolveMediaForClip(deactivatedClip);
assert.ok(reqActive !== null);
assert.equal(reqActive.clipId, 'c_active');
assert.equal(reqActive.sourceRange.start, 1);
assert.equal(reqActive.sourceRange.end, 9);
assert.equal(reqInactive, null);
console.log('PASS: resolveMediaForClip excludes deactivated clips and preserves trim range');

// 2. Prepare and dispose lifecycle
const pool = new ExportMediaPool();
await pool.prepare([
  {
    clipId: 'c1',
    kind: 'video',
    url: 'https://example.com/v1.mp4',
    sourceRange: { start: 0, end: null },
  },
  {
    clipId: 'c2',
    kind: 'image',
    url: 'https://example.com/img1.png',
    sourceRange: { start: 0, end: null },
  },
]);

assert.ok(pool.get('c1') !== undefined);
assert.ok(pool.get('c2') !== undefined);

pool.dispose();
assert.equal(pool.getVideoMap().size, 0);
assert.equal(pool.getImageMap().size, 0);
assert.equal(pool.get('c1'), undefined);
console.log('PASS: ExportMediaPool prepare and dispose cleans up maps completely');

// 3. Post-dispose operations throw
let errorThrown = false;
try {
  await pool.prepare([{ clipId: 'c3', kind: 'video', url: 'https://example.com/v2.mp4', sourceRange: { start: 0, end: null } }]);
} catch (err) {
  errorThrown = true;
}
assert.equal(errorThrown, true);
console.log('PASS: Operations on disposed ExportMediaPool reject explicitly');

console.log('\nMEDIA_POOL_LIFECYCLE_TESTS=PASS');
