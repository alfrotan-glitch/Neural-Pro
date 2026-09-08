const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const tscScript = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
const tscCommand = process.execPath;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-multi-collision-'));
const servicePath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionDragService.ts');
const enginePath = path.join(root, 'src/features/video-studio/timeline/services/timelineEditingEngine.ts');
const uuidPath = path.join(root, 'src/lib/uuid.ts');

try {
  const compile = spawnSync(tscCommand, [tscScript, 
    '--target', 'ES2022',
    '--module', 'CommonJS',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--outDir', tempRoot,
    servicePath,
    enginePath,
    uuidPath,
  ], { cwd: root, encoding: 'utf8' });
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout || '');
    process.stderr.write(compile.stderr || '');
    process.exit(1);
  }

  const service = require(path.join(tempRoot, 'features/video-studio/timeline/services/multiSelectionDragService.js'));

  const mkClip = (id, startAt, duration) => ({
    id,
    sourceId: `source-${id}`,
    startAt,
    duration,
    trim: { in: 0, out: duration },
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    properties: {},
  });
  const mkTrack = (id, clips, type = 'video', locked = false) => ({
    id, type, isLocked: locked, isMuted: false, isVisible: true, clips,
  });
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  const track = mkTrack('T', [
    mkClip('S1', 20, 5),
    mkClip('S2', 30, 5),
    mkClip('X', 18, 20),
  ]);
  const targetMap = new Map([['S1', 'T'], ['S2', 'T']]);

  // Overwrite: selected clips must not overwrite each other; only non-selected X is resolved.
  {
    const orderedA = service.resolveMultiSelectionPlacement([track], ['S1', 'S2'], targetMap, 'overwrite').tracks[0].clips;
    const orderedB = service.resolveMultiSelectionPlacement([track], ['S2', 'S1'], targetMap, 'overwrite').tracks[0].clips;
    const semantic = (clips) => clips.map(({ id, ...clip }) => clip).sort((a, b) => (a.startAt - b.startAt) || a.duration - b.duration);
    assert(JSON.stringify(semantic(orderedA)) === JSON.stringify(semantic(orderedB)), 'Multi-selection collision result must be independent of selection order.');
    assert(orderedA.some(c => c.id === 'S1') && orderedA.some(c => c.id === 'S2'), 'Selected clips must both survive Overwrite.');
    assert(orderedA.filter(c => c.id === 'X').length === 0 || orderedA.every(c => c.id !== 'X' || c.startAt >= 35 || c.startAt === 18), 'Non-selected collision should be resolved deterministically.');
  }

  // Cross-track batch: selected clips are removed from source lanes and appear on mapped target lanes exactly once.
  {
    const tracks = [
      mkTrack('A', [mkClip('S1', 10, 5), mkClip('A1', 0, 5)]),
      mkTrack('B', [mkClip('S2', 20, 5), mkClip('B1', 15, 10)]),
    ];
    const movedMap = new Map([['S1', 'B'], ['S2', 'A']]);
    const result = service.resolveMultiSelectionPlacement(tracks, ['S1', 'S2'], movedMap, 'overwrite').tracks;
    const all = result.flatMap(t => t.clips).filter(c => c.id === 'S1' || c.id === 'S2');
    assert(all.length === 2, 'Every selected clip must exist exactly once after a batch move.');
    assert(result.find(t => t.id === 'B').clips.some(c => c.id === 'S1'), 'S1 must land on mapped Track B.');
    assert(result.find(t => t.id === 'A').clips.some(c => c.id === 'S2'), 'S2 must land on mapped Track A.');
  }

  // Locked target must not receive a selected clip.
  {
    const locked = [mkTrack('A', [mkClip('S1', 10, 5)]), mkTrack('B', [], 'video', true)];
    const movedMap = new Map([['S1', 'B']]);
    const result = service.resolveMultiSelectionPlacement(locked, ['S1'], movedMap, 'overwrite').tracks;
    assert(!result.find(t => t.id === 'B').clips.some(c => c.id === 'S1'), 'Locked target must not receive selected clip.');
    assert(result.find(t => t.id === 'A').clips.some(c => c.id === 'S1'), 'Selection must remain on its source lane when target is locked.');
  }

  console.log('TIMELINE_MULTI_SELECTION_COLLISION_RESOLVER=PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
