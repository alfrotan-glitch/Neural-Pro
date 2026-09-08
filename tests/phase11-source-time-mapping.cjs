const fs = require('fs');
const path = require('path');
const root = process.cwd();
const mapper = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');
const action = fs.readFileSync(path.join(root, 'src/features/video-studio/timeline/services/timelineActionService.ts'), 'utf8');
const exportConverter = fs.readFileSync(path.join(root, 'src/core/engine/exportConverter.ts'), 'utf8');
const audio = fs.readFileSync(path.join(root, 'src/features/video-studio/audio/services/audioMixModel.ts'), 'utf8');

if (!mapper.includes('getEffectiveClipTimelineDuration')) throw new Error('canonical effective timeline duration helper missing');
if (!mapper.includes('getCanonicalClipTimelineDuration(clip)')) throw new Error('canonical bounded timeline duration delegation missing');
if (!action.includes('{ start: sourceStart, end: sourceEnd } = getClipSourceRange(clip)')) throw new Error('scene split does not derive canonical source range');
if (!action.includes('{ startTimeSeconds: sourceStart }')) throw new Error('scene detection does not start at trim.in');
if (!action.includes('cut.time / speed')) throw new Error('scene source-to-project mapping missing');
if (!exportConverter.includes('getEffectiveClipTimelineDuration(clip)')) throw new Error('export does not use canonical effective duration');
if (!exportConverter.includes('trimIn + effectiveDuration * playbackRate')) throw new Error('export fallback trim.out uses wrong time unit');
if (!audio.includes('getEffectiveClipTimelineDuration(clip)')) throw new Error('audio model does not use canonical effective duration');
console.log('PHASE11_SOURCE_TIME_MAPPING_CONTRACT=PASS');
