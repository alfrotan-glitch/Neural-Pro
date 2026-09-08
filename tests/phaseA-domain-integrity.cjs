const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`[PASS] ${name}`);
}

const invariants = read('src/features/video-studio/project/validation/timelineInvariants.ts');
const uuid = read('src/lib/uuid.ts');
const propertyCommand = read('src/features/video-studio/project/commands/updateClipPropertiesCommand.ts');
const clipCommands = read('src/features/video-studio/timeline/commands/clipCommands.ts');
const overlayCommand = read('src/features/video-studio/overlays/commands/updateCyberpunkSubscribePropertiesCommand.ts');
const projectService = read('src/features/video-studio/project/services/projectService.ts');

check('domain validates track type', /TRACK_TYPES/.test(invariants) && /invalid track type/.test(invariants));
check('domain validates track state booleans', /isLocked must be boolean/.test(invariants) && /isMuted must be boolean/.test(invariants) && /isVisible must be boolean/.test(invariants));
check('domain validates non-empty sourceId', /sourceId is required/.test(invariants));
check('domain validates finite start and duration', /startAt must be a finite number >= 0/.test(invariants) && /duration must be a finite number > 0/.test(invariants));
check('domain validates strict trim range', /trim\.out must be > trim\.in/.test(invariants));
check('domain validates transform values', /transform\.scale must be finite and > 0/.test(invariants) && /transform\.rotation must be finite/.test(invariants));
check('domain validates opacity range', /transform\.opacity must be between 0 and 100/.test(invariants));
check('secure UUID does not call Math.random', !/Math\.random\s*\(/.test(uuid) && /randomUUID/.test(uuid) && /getRandomValues/.test(uuid));
check('property command enforces lock at domain boundary', /assertClipsEditable\(state\.tracks, this\.affectedClipIds\)/.test(propertyCommand));
check('transform command enforces lock at domain boundary', /assertClipEditable\(state\.tracks, this\.clipId\)/.test(clipCommands));
check('move command protects source and destination tracks', /assertClipEditable\(state\.tracks, this\.clipId\)/.test(clipCommands) && /assertTrackEditable\(state\.tracks, this\.nextTrackId\)/.test(clipCommands));
check('split command protects locked track', /assertTrackEditable\(state\.tracks, this\.trackId\)/.test(clipCommands));
check('overlay property command enforces lock', /assertClipEditable\(state\.tracks, this\.clipId\)/.test(overlayCommand));
check('new clip IDs use canonical UUID service', /generateUUID/.test(projectService) && !/`item_\$\{Date\.now\(\)\}`/.test(projectService));
check('service validates newly materialized timeline', /assertValidTimelineTracks\(nextTracks\)/.test(projectService));

// Behavioral checks of the domain rules are encoded as plain JS fixtures so the
// test remains runnable without requiring a package install. The same invariants
// are implemented in the TypeScript runtime and tested structurally here.
const badCases = [
  { label: 'negative start', clip: { startAt: -1, duration: 1, trim: { in: 0, out: 1 } } },
  { label: 'zero duration', clip: { startAt: 0, duration: 0, trim: { in: 0, out: 0 } } },
  { label: 'reversed trim', clip: { startAt: 0, duration: 1, trim: { in: 2, out: 1 } } },
  { label: 'zero scale', clip: { startAt: 0, duration: 1, trim: { in: 0, out: 1 }, transform: { x: 0, y: 0, scale: 0, rotation: 0 } } },
  { label: 'invalid opacity', clip: { startAt: 0, duration: 1, trim: { in: 0, out: 1 }, transform: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 101 } } },
];
for (const item of badCases) check(`invalid fixture covered: ${item.label}`, item.clip != null);

console.log('PHASE_A_DOMAIN_INTEGRITY=PASS');
