const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'src');
const playback = fs.readFileSync(path.join(base, 'features/video-studio/playback/services/playbackService.ts'), 'utf8');
const mediaMapper = fs.readFileSync(path.join(base, 'features/video-studio/playback/services/mediaTimeMapper.ts'), 'utf8');
const audioExport = fs.readFileSync(path.join(base, 'features/video-studio/audio/services/projectAudioRenderService.ts'), 'utf8');
const exportService = fs.readFileSync(path.join(base, 'features/video-studio/export/services/exportService.ts'), 'utf8');

if (!playback.includes("import { isClipActiveAt, projectTimeToSourceTime } from './mediaTimeMapper';")) throw new Error('playbackService is not wired to MediaTimeMapper');
if (!playback.includes('const clipMediaTime = projectTimeToSourceTime(clip, time);')) throw new Error('export/preview video seek still uses legacy mapping');
if (!playback.includes('isClipActiveAt(clip, time)')) throw new Error('exclusive clip activity contract not used');
if (!mediaMapper.includes('export function getClipPlaybackRate')) throw new Error('shared playback-rate helper missing');
if (!audioExport.includes('resolveClipAudioMix')) throw new Error('audio export is not using canonical audio mix model');
if (!audioExport.includes('source.playbackRate.setValueAtTime(mix.playbackRate, 0);')) throw new Error('audio export speed is not applied in canonical service');
if (!audioExport.includes('source.start(startAt, mix.trimIn, sourceDuration);')) throw new Error('audio export is not using mapper-derived trim range');
if (!exportService.includes('seekActiveVideoClips(')) throw new Error('export frame path is not using shared video seek service');
console.log('PHASE_B_STATIC_WIRING=PASS');
