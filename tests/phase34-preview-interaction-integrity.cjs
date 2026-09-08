const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/features/video-studio/playback/services/previewTransformInteractionService.ts');
const hookPath = path.join(root, 'src/features/video-studio/playback/hooks/usePreviewTransformInteraction.ts');
const playerPath = path.join(root, 'src/components/player/VideoPlayer.tsx');
const service = fs.readFileSync(servicePath, 'utf8');
const hook = fs.readFileSync(hookPath, 'utf8');
const player = fs.readFileSync(playerPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

assert(
  /getResizeHandleFromElement\(target\.getBoundingClientRect\(\), bounds\)/.test(hook),
  'Resize handle is resolved from handle-vs-element geometry.'
);
assert(
  /const element = type === 'resize'[\s\S]*target\.parentElement/.test(hook) &&
  /const elementNode = element \?\? target;[\s\S]*const bounds = elementNode\.getBoundingClientRect\(\)/.test(hook),
  'Resize uses the actual interactive element bounds instead of the handle rectangle.'
);
assert(
  /const layoutWidth = Math\.max\(1, elementNode\.offsetWidth \|\| bounds\.width\)/.test(hook) &&
  /rotation: clip\.transform\.rotation \|\| 0/.test(hook),
  'Resize snapshot uses unrotated layout dimensions plus the current rotation.'
);
assert(
  /const horizontal = x < parentRect\.left \+ parentRect\.width \/ 2 \? 'w' : 'e'/.test(service) &&
  /const vertical = y < parentRect\.top \+ parentRect\.height \/ 2 \? 'n' : 's'/.test(service),
  'Corner classification uses the handle center against the parent center.'
);
assert(
  /if \(latestEvent\) \{\s*update\(\);\s*\}/.test(hook),
  'Mouse release flushes a pending RAF event before commit.'
);
assert(
  /className="[^"]*cursor-nwse-resize/.test(player) &&
  /className="[^"]*cursor-nesw-resize/.test(player),
  'Preview exposes both diagonal resize cursor directions.'
);
assert(
  (player.match(/onMouseDown=\{\(e\) => handleResizeMouseDown\(e, clip\)\}/g) || []).length >= 16,
  'All Preview families keep their four-corner resize handles wired.'
);
console.log('PHASE34_PREVIEW_INTERACTION_INTEGRITY=PASS');
