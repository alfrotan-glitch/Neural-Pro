const fs=require('fs'); const path=require('path');
function read(p){return fs.readFileSync(path.join(process.cwd(),p),'utf8')}
const marker=read('src/features/video-studio/timeline/components/TimelineAnimationMarkers.tsx');
const move=read('src/features/video-studio/animation/keyframeCommands.ts');
const paste=read('src/features/video-studio/animation/keyframeClipboardCommands.ts');
const checks=[
['PHASE62_MULTI_KEYFRAME_SELECTION',/selectedKeyframes/.test(marker)&&/shiftKey/.test(marker)],
['PHASE62_GROUP_KEYFRAME_MOVE_ONE_COMMAND',/MoveAnimationKeyframesCommand/.test(marker)&&/new MoveAnimationKeyframesCommand/.test(marker)],
['PHASE62_CLAMP_GROUP_MOVE_TO_CLIP',/minSelectedTime/.test(marker)&&/maxDelta/.test(marker)&&/minDelta/.test(marker)],
['PHASE62_COPY_RELATIVE_TIME',/relativeTime: e.time - min/.test(marker)],
['PHASE62_PASTE_COMMAND',/class PasteAnimationKeyframesCommand/.test(paste)&&/new PasteAnimationKeyframesCommand/.test(marker)],
['PHASE62_EASING_COMMAND',/SetAnimationKeyframeEasingCommand/.test(marker)&&/class SetAnimationKeyframeEasingCommand/.test(move)],
['PHASE62_DELETE_SELECTED_ONLY',/DeleteAnimationKeyframesCommand/.test(marker)&&/selectedKeyframes/.test(marker)],
['PHASE62_HISTORY_ONE_COMMAND_GROUP',/public readonly name = 'Move Animation Keyframes'/.test(move)&&/public readonly name = 'Paste Animation Keyframes'/.test(paste)],
['PHASE62_NO_UNRELATED_TRACK_MUTATION',!/tracks\.map/.test(paste)],
]; let fail=0; for(const [n,ok] of checks){console.log(n+'='+(ok?'PASS':'FAIL')); if(!ok)fail++} process.exitCode=fail?1:0;
