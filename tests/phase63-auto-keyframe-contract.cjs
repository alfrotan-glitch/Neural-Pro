const fs=require('node:fs'); const path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
const command=read('src/features/video-studio/animation/commands.ts');
const store=read('src/store/useProjectStore.ts');
const preview=read('src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts');
const inspector=read('src/components/inspector/UniversalTransformControls.tsx');
const checks=[
['PHASE63_AUTO_KEYFRAME_COMMAND',/class AutoKeyframeTransformCommand implements Command/.test(command)],
['PHASE63_AUTO_KEYFRAME_CLIP_LOCAL_TIME',/safeProjectTime - clip\.startAt/.test(command)&&/clip\.duration/.test(command)],
['PHASE63_AUTO_KEYFRAME_TRANSFORM_PROPERTIES',/transform\.x/.test(command)&&/transform\.y/.test(command)&&/transform\.scaleX/.test(command)&&/transform\.scaleY/.test(command)&&/transform\.rotation/.test(command)&&/transform\.opacity/.test(command)],
['PHASE63_AUTO_KEYFRAME_ONE_COMMAND_PREVIEW',/autoKeyframeEnabled/.test(preview)&&/new AutoKeyframeTransformCommand/.test(preview)],
['PHASE63_AUTO_KEYFRAME_ONE_COMMAND_INSPECTOR',/autoKeyframeEnabled/.test(store)&&/new AutoKeyframeTransformCommand/.test(store)],
['PHASE63_AUTO_KEYFRAME_TOGGLE_UI',/Auto-Keyframe/.test(inspector)&&/setAutoKeyframeEnabled/.test(inspector)],
['PHASE63_AUTO_KEYFRAME_UNDO_ATOMIC',/beforeTracks/.test(command)&&/beforeAnimations/.test(command)&&/afterAnimations/.test(command)&&/undo\(state: ProjectState\)/.test(command)],
['PHASE63_AUTO_KEYFRAME_NO_SET_TIMEOUT_WORKAROUND',!/setTimeout\(/.test(preview)&&!/setTimeout\(/.test(command)],
]; let fail=0; for(const [n,ok] of checks){console.log(n+'='+(ok?'PASS':'FAIL')); if(!ok) fail++;} process.exitCode=fail?1:0;
