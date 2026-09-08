const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8');}
const video=read('src/components/VideoStudioPro.tsx');
const player=read('src/components/player/VideoPlayer.tsx');
const exportAudio=read('src/features/video-studio/audio/services/projectAudioRenderService.ts');
const realAudio=read('src/features/video-studio/playback/components/RealAudioElement.tsx');
const realVideo=read('src/features/video-studio/playback/components/RealVideoElement.tsx');
const checks=[
 ['export uses shared audio renderer', video.includes("renderProjectAudio({")],
 ['export no silent fallback path', !video.includes('Fallback to silent buffer') && !video.includes('silentCtx')],
 ['preview uses shared audio mix model', realAudio.includes('resolveClipAudioMix') && realVideo.includes('resolveClipAudioMix')],
 ['preview fades wired', realAudio.includes('fadeGain: mix.fadeGain') && realVideo.includes('fadeGain: mix.fadeGain')],
 ['offline audio pan', exportAudio.includes('createStereoPanner')],
 ['offline audio fades', exportAudio.includes('linearRampToValueAtTime')],
 ['offline audio speed', exportAudio.includes('playbackRate.setValueAtTime(mix.playbackRate')],
];
const bad=checks.filter(([,ok])=>!ok);
console.log('PHASE_D_STATIC_WIRING', bad.length?'FAIL':'PASS');
for(const [n,ok] of checks) console.log(n, ok?'PASS':'FAIL');
process.exit(bad.length?1:0);
