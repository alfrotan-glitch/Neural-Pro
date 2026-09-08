const fs = require('fs');
const path = require('path');
const root = process.cwd();
const service = fs.readFileSync(path.join(root,'src/features/video-studio/playback/services/previewTransformInteractionService.ts'),'utf8');
const hook = fs.readFileSync(path.join(root,'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts'),'utf8');
const checks = [
  ['multi-selection resize path enabled', /editableClipIds\.size > 1/.test(hook)],
  ['multi-selection rotation path enabled', /applyRotationToClips\([\s\S]*editableClipIds\.size > 1/.test(hook)],
  ['group resize scales relative offsets', /\(original\.transform\.x - groupCenterX\) \* (scaleRatio|geometryScaleXRatio)/.test(service)],
  ['group rotation rotates relative offsets', /\(original\.transform\.x - groupCenterX\) \* cos/.test(service)],
  ['group rotation preserves each local rotation plus delta', /rotation: normalizeRotation\(\(original\.transform\.rotation \|\| 0\) \+ delta\)/.test(service)],
];
let failed=0; for (const [name,ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++; }
process.exit(failed?1:0);
