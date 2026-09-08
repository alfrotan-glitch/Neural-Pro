const fs = require('fs');
const path = require('path');
function read(p){ return fs.readFileSync(path.join(process.cwd(), p), 'utf8'); }
const marker = read('src/features/video-studio/timeline/components/TimelineAnimationMarkers.tsx');
const trackRow = read('src/features/video-studio/timeline/components/TimelineTrackRow.tsx');
const commands = read('src/features/video-studio/animation/commands.ts');
const move = read('src/features/video-studio/animation/keyframeCommands.ts');
const project = read('src/store/useProjectStore.ts');
const service = read('src/features/video-studio/animation/services.ts');
const checks = [
  ['PHASE61_KEYFRAME_MARKERS_IN_TIMELINE', /TimelineAnimationMarkers/.test(trackRow) && /KF\+/.test(marker)],
  ['PHASE61_ADD_KEYFRAMES_LOCAL_TO_CLIP', /currentTime - clipStart/.test(marker) && /Math\.max\(0, Math\.min\(clipDuration/.test(marker)],
  ['PHASE61_ADD_TRANSFORM_KEYFRAMES_ATOMIC', /SetAnimationKeyframesCommand/.test(marker) && /class SetAnimationKeyframesCommand/.test(commands)],
  ['PHASE61_MOVE_KEYFRAME_SINGLE_COMMIT', /class MoveAnimationKeyframeCommand/.test(move) && /onPointerMove=/.test(marker) && /onPointerUp=/.test(marker) && /new MoveAnimationKeyframeCommand/.test(marker) && !/onPointerMove=\{[^}]*new MoveAnimationKeyframeCommand/.test(marker)],
  ['PHASE61_DELETE_KEYFRAMES_COMMAND', /class DeleteAnimationKeyframesCommand/.test(move) && /new DeleteAnimationKeyframesCommand/.test(marker)],
  ['PHASE61_KEYFRAME_COMMAND_WIRED_TO_STORE', /setAnimationKeyframe/.test(project) && /SetAnimationKeyframeCommand/.test(project)],
  ['PHASE61_PREVIEW_USES_EVALUATOR', /createAtomicRenderSnapshot/.test(read('src/components/player/VideoPlayer.tsx')) && /renderSnapshot\.transformByClipId/.test(read('src/components/player/VideoPlayer.tsx'))],
  ['PHASE61_EXPORT_USES_EVALUATOR', /evaluateClipAnimation\(state\.animations, clip, time\)/.test(read('src/core/engine/render/CanvasExportRenderer.ts'))],
  ['PHASE61_HOLD_EVALUATION_SUPPORTED', /if \(left\.interpolation === 'hold'\)/.test(service)],
];
let failed = 0;
for (const [name, ok] of checks) { if (ok) console.log(name + '=PASS'); else { console.log(name + '=FAIL'); failed++; } }
process.exitCode = failed ? 1 : 0;
