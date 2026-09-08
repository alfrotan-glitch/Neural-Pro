/**
 * REPRODUCTION / REGRESSION TEST: Export media resolution via ExportMediaPool (D-001 fix).
 *
 * Verifies that all video clips in the project are independently resolved and prepared
 * without depending on the Preview DOM or playhead position at t=0 (INV-002, INV-004).
 */
import {
  buildPreviewCompositorIndex,
  selectActivePreviewCompositorPlan,
} from '../src/features/video-studio/playback/compositor/previewCompositorIndex';
import { useProjectStore } from '../src/store/useProjectStore';
import { resolveMediaForClip } from '../src/domain/export/resolveMediaForClip';
import { ExportMediaPool } from '../src/infra/media/ExportMediaPool';

const tracks = useProjectStore.getState().tracks;

console.log('=== Default project video track ===');
const videoTrack = tracks.find((t) => t.id === 'track_video_main')!;
for (const c of videoTrack.clips) {
  console.log(`  clip ${c.id}: startAt=${c.startAt}s duration=${c.duration}s -> [${c.startAt}, ${c.startAt + c.duration})`);
}

const index = buildPreviewCompositorIndex(tracks);

for (const t of [0, 5, 20, 35]) {
  const plan = selectActivePreviewCompositorPlan(index, t);
  const ids = plan.byRole.video.map((l) => l.clip.id);
  console.log(`\nt=${t}s  video layers active: [${ids.join(', ')}]`);
}

// Production export uses resolveMediaForClip + ExportMediaPool across all project clips
const mediaRequests = tracks
  .flatMap((t) => t.clips)
  .map(resolveMediaForClip)
  .filter((req): req is NonNullable<typeof req> => req !== null);

const pool = new ExportMediaPool();
await pool.prepare(mediaRequests);

console.log('\n=== ExportMediaPool resolved clips ===');
const resolvedIds = mediaRequests.map((r) => r.clipId);
console.log(resolvedIds);

let missing = 0;
const totalFrames = Math.ceil(45 * 30);
for (let f = 0; f < totalFrames; f += 1) {
  const time = f / 30;
  const plan = selectActivePreviewCompositorPlan(index, time);
  for (const layer of plan.byRole.video) {
    if (!pool.get(layer.clip.id)) {
      missing += 1;
      break;
    }
  }
}

pool.dispose();

console.log(`\nFrames (of ${totalFrames}) where an active video clip has NO entry in ExportMediaPool: ${missing}`);

const unregistered = videoTrack.clips.filter((c) => !resolvedIds.includes(c.id)).map((c) => c.id);
console.log(`Video clips that would render as a PURPLE PLACEHOLDER in export: [${unregistered.join(', ')}]`);

if (unregistered.length > 0 || missing > 0) {
  console.log('\nRESULT: DEFECT REPRODUCED');
  process.exit(1);
}
console.log('\nRESULT: no defect');
