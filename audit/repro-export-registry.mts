/**
 * REPRODUCTION: Export media registry only contains clips that are ACTIVE at the
 * moment collectExportVideoElements() is called (export start, currentTime = 0).
 *
 * Runtime evidence for the "multi-clip export renders placeholder boxes" defect.
 */
import {
  buildPreviewCompositorIndex,
  selectActivePreviewCompositorPlan,
} from '../src/features/video-studio/playback/compositor/previewCompositorIndex';
import { useProjectStore } from '../src/store/useProjectStore';

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
  console.log(`\nt=${t}s  video layers mounted in Preview DOM: [${ids.join(', ')}]`);
}

// Simulate the export registry snapshot taken once, at export start (t = 0).
const planAtZero = selectActivePreviewCompositorPlan(index, 0);
const registry = new Map(planAtZero.byRole.video.map((l) => [l.clip.id, '<video element>']));

console.log('\n=== collectExportVideoElements() registry contents ===');
console.log([...registry.keys()]);

let missing = 0;
const totalFrames = Math.ceil(45 * 30);
for (let f = 0; f < totalFrames; f += 1) {
  const time = f / 30;
  const plan = selectActivePreviewCompositorPlan(index, time);
  for (const layer of plan.byRole.video) {
    if (!registry.has(layer.clip.id)) {
      missing += 1;
      break;
    }
  }
}
console.log(`\nFrames (of ${totalFrames}) where an active video clip has NO entry in the export registry: ${missing}`);

const unregistered = videoTrack.clips.filter((c) => !registry.has(c.id)).map((c) => c.id);
console.log(`Video clips that would render as a PURPLE PLACEHOLDER in export: [${unregistered.join(', ')}]`);
if (unregistered.length > 0) {
  console.log('\nRESULT: DEFECT REPRODUCED');
  process.exit(1);
}
console.log('\nRESULT: no defect');
