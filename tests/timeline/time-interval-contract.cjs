const fs = require('fs');
const path = require('path');
const root = process.cwd();
const util = fs.readFileSync(path.join(root, 'src/features/video-studio/project/time/intervals.ts'), 'utf8');
const timelineSelectors = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/selectors/timelineSelectors.ts'), 'utf8');
const playbackSelectors = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/selectors/playbackSelectors.ts'), 'utf8');
const overlayService = fs.readFileSync(path.join(root, 'src/features/video-studio/overlays/services/overlayService.ts'), 'utf8');
const captionSelectors = fs.readFileSync(path.join(root, 'src/features/video-studio/captions/selectors/captionSelectors.ts'), 'utf8');
const captionRenderer = fs.readFileSync(path.join(root, 'src/core/engine/CaptionRenderer.ts'), 'utf8');
const audioWave = fs.readFileSync(path.join(root, 'src/components/player/AudioWaveOverlay.tsx'), 'utf8');

if (!util.includes('time >= startAt && time < endAt')) throw new Error('Canonical interval must be half-open [start,end).');
for (const [name, src] of Object.entries({ timelineSelectors, playbackSelectors, overlayService, captionSelectors, captionRenderer, audioWave })) {
  if (!src.includes('isTimeInClip')) throw new Error(`${name} must use canonical time containment.`);
}
for (const src of [timelineSelectors, playbackSelectors, overlayService, captionSelectors, captionRenderer, audioWave]) {
  if (/currentTime\s*>=.*startAt.*<=.*startAt \+ .*duration|time\s*>=.*startAt.*<=.*startAt \+ .*duration/.test(src)) {
    throw new Error('Found legacy inclusive clip-boundary predicate.');
  }
}
console.log('TIMELINE_TIME_INTERVAL_CONTRACT=PASS');
console.log('clip semantics: [startAt, startAt + duration)');
