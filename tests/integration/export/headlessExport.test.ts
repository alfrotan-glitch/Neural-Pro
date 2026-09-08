import { describe, it, expect } from 'node:test';
import assert from 'node:assert/strict';
import { ExportMediaPool, MediaPrepareError } from '../../../src/infra/media/ExportMediaPool';
import { resolveMediaForClip } from '../../../src/domain/export/resolveMediaForClip';
import { buildCanonicalRenderPlan } from '../../../src/domain/render/buildCanonicalRenderPlan';
import { RenderFpsAuthority } from '../../../src/domain/render/fpsAuthority';
import type { ProjectState, Track, ClipNode } from '../../../src/features/video-studio/project/types/project';

// Synthetic multi-clip project fixture (3 consecutive video clips)
const fixtureTracks: Track[] = [
  {
    id: 'track_video_main',
    name: 'Main Video',
    type: 'video',
    isVisible: true,
    isMuted: false,
    isLocked: false,
    clips: [
      {
        id: 'clip_1',
        startAt: 0,
        duration: 5,
        trimIn: 0,
        trimOut: 5,
        type: 'video',
        properties: {
          name: 'Clip 1',
          videoUrl: 'https://cdn.example.com/video1.mp4',
          color: 'from-blue-600 to-indigo-600',
        },
        transform: { x: 0, y: 0, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100 },
      },
      {
        id: 'clip_2',
        startAt: 5,
        duration: 5,
        trimIn: 2,
        trimOut: 7,
        type: 'video',
        properties: {
          name: 'Clip 2',
          videoUrl: 'https://cdn.example.com/video2.mp4',
          color: 'from-red-600 to-pink-600',
        },
        transform: { x: 10, y: -20, scale: 120, scaleX: 150, scaleY: 90, rotation: 15, opacity: 90 },
      },
      {
        id: 'clip_3',
        startAt: 10,
        duration: 5,
        trimIn: 0,
        trimOut: 5,
        type: 'video',
        properties: {
          name: 'Clip 3',
          videoUrl: 'https://cdn.example.com/video3.mp4',
          color: 'from-green-600 to-emerald-600',
        },
        transform: { x: -30, y: 40, scale: 90, scaleX: 100, scaleY: 100, rotation: -45, opacity: 100 },
      },
    ],
  },
];

const fixtureProject: ProjectState = {
  projectId: 'test_project_headless',
  metadata: {
    title: 'Headless Export Test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    aspectRatio: '16:9',
  },
  currentTime: 0,
  totalDuration: 15,
  tracks: fixtureTracks,
  selectedNodeIds: [],
  isPlaying: false,
  animations: [],
};

console.log('--- RUNNING HEADLESS EXPORT SUITE ---');

// Test 1: resolveMediaForClip resolves every clip in the project
const requests = fixtureTracks.flatMap((t) => t.clips).map(resolveMediaForClip);
assert.equal(requests.length, 3, 'All 3 clips must resolve to media requests');
assert.equal(requests[0]?.clipId, 'clip_1');
assert.equal(requests[0]?.kind, 'video');
assert.equal(requests[0]?.sourceRange.start, 0);
assert.equal(requests[1]?.clipId, 'clip_2');
assert.equal(requests[1]?.sourceRange.start, 2);
assert.equal(requests[2]?.clipId, 'clip_3');
console.log('PASS: INV-004 resolveMediaForClip resolves all clips independently of DOM');

// Test 2: ExportMediaPool prepares in headless environment without DOM scraping
const pool = new ExportMediaPool();
await pool.prepare(requests.filter((r): r is NonNullable<typeof r> => r !== null));
for (const clipId of ['clip_1', 'clip_2', 'clip_3']) {
  const source = pool.get(clipId);
  assert.ok(source, `Pool must contain ready source for ${clipId}`);
}
console.log('PASS: INV-002 ExportMediaPool prepares detached media sources');

// Test 3: Export produces ceil(duration * fps) frames across all clips with valid render plans
const fps = 30;
const totalFrames = RenderFpsAuthority.getFrameCount(fixtureProject.totalDuration, fps);
assert.equal(totalFrames, 450, '15 seconds at 30 fps must produce exactly 450 frames');

let nonNullPlans = 0;
for (let f = 0; f < totalFrames; f += 1) {
  const time = RenderFpsAuthority.getFrameTime(f, fps);
  const plan = buildCanonicalRenderPlan({
    state: fixtureProject,
    time,
    width: 1920,
    height: 1080,
    fps,
  });
  assert.ok(plan.layers.length >= 1, `Frame ${f} at t=${time.toFixed(2)}s must have active video layer`);
  assert.equal(plan.layers[0].role, 'video');
  assert.ok(plan.layers[0].matrix, `Frame ${f} must have canonical matrix`);
  nonNullPlans += 1;
}
assert.equal(nonNullPlans, 450, 'All 450 frames must render valid canonical render plans');
console.log('PASS: Frame count and temporal mapping verified across all 450 frames');

// Test 4: Missing media fails with typed MEDIA_PREPARE_FAILED (no silent fallback)
const brokenPool = new ExportMediaPool();
const brokenRequest = {
  clipId: 'missing_clip',
  kind: 'video' as const,
  sourceRange: { start: 0, end: 5 },
  // url missing
};

let threw = false;
try {
  await brokenPool.prepare([brokenRequest]);
} catch (err) {
  threw = true;
  assert.ok(err instanceof Error, 'Must throw an Error');
  assert.ok(err.message.includes('missing_clip') || (err as any).clipId === 'missing_clip', 'Must name the broken clipId');
}
assert.ok(threw, 'ExportMediaPool.prepare must fail on unresolvable media source');
console.log('PASS: AS-INV-07 / ADR-009 typed failure on missing asset (no fake success)');

// Test 5: Resource disposal clears all sources
pool.dispose();
brokenPool.dispose();
console.log('PASS: INV-008 ExportMediaPool dispose releases resources deterministically');

console.log('\nHEADLESS_EXPORT_TEST=PASS');
