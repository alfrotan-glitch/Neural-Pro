const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dragPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineDragExecution.ts');
const interactionPath = path.join(root, 'src/features/video-studio/timeline/controllers/useTimelineClipInteraction.ts');
const hitPath = path.join(root, 'src/features/video-studio/timeline/controllers/timelineHitTest.ts');
const placementPath = path.join(root, 'src/features/video-studio/timeline/services/timelineTrackPlacementService.ts');
const multiPath = path.join(root, 'src/features/video-studio/timeline/services/multiSelectionDragService.ts');
const geometryPath = path.join(root, 'src/features/video-studio/timeline/geometry/timelineGeometry.ts');

for (const file of [dragPath, interactionPath, hitPath, placementPath, multiPath, geometryPath]) {
  assert.equal(fs.existsSync(file), true, `Missing required file: ${file}`);
}

const drag = fs.readFileSync(dragPath, 'utf8');
const interaction = fs.readFileSync(interactionPath, 'utf8');
const hit = fs.readFileSync(hitPath, 'utf8');

assert.match(drag, /const finalHitTestIndex = finalWorkspace/);
assert.match(drag, /findTrackAtClientY\(finalHitTestIndex, e\.clientY, finalWorkspace\.scrollTop\)/);
assert.match(drag, /if \(activeClipEntry && finalDropTrack && finalDropTrack\.id !== activeDrag\.trackId && finalDropTrack\.isLocked\)/);
assert.match(drag, /if \(!atomicTargetMap\) rejectMoveTransaction = true/);
assert.match(drag, /if \(activeClipEntry && !\(rejectMoveTransaction && activeDrag\.dragMode === 'move'\)\)/);
assert.match(drag, /finalTracks = structuredClone\(initialTracks\)/);
assert.match(drag, /executeCommand\(cmd\)/);
assert.match(interaction, /initialDragMode: ActiveDrag\['dragMode'\]/);
assert.match(interaction, /(?:const|let) initialDragMode: ActiveDrag\['dragMode'\]/);
assert.match(hit, /export function findTrackAtClientY/);
assert.match(hit, /const contentY = clientY - index\.workspaceRect\.top \+ scrollTop/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-phase49-'));
const tscScript = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
try {
  const compile = spawnSync(process.execPath, [
    tscScript, '--target', 'ES2022', '--module', 'CommonJS', '--moduleResolution', 'node',
    '--skipLibCheck', '--outDir', tempRoot,
    placementPath, multiPath,
    path.join(root, 'src/features/video-studio/project/types/project.ts'),
    path.join(root, 'src/lib/uuid.ts'),
    path.join(root, 'src/features/video-studio/timeline/services/timelineEditingEngine.ts'),
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(compile.status, 0, `${compile.stdout || ''}${compile.stderr || ''}`);

  const placement = require(path.join(tempRoot, 'features/video-studio/timeline/services/timelineTrackPlacementService.js'));
  const multi = require(path.join(tempRoot, 'features/video-studio/timeline/services/multiSelectionDragService.js'));

  const clip = (id, start = 2, duration = 3) => ({
    id, sourceId: `s-${id}`, startAt: start, duration,
    trim: { in: 0, out: duration },
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    properties: { speed: 1 },
  });
  const track = (id, role, clips, locked = false) => ({
    id, type: role === 'audio' ? 'audio' : 'video', laneRole: role,
    isLocked: locked, isMuted: false, isVisible: true, clips,
  });

  const source = track('V1', 'video', [clip('A')]);
  const target = track('V2', 'video', []);
  const lockedTarget = track('V3', 'video', [], true);
  const audioTarget = track('A1', 'audio', []);

  {
    const result = placement.placeSingleClipOnCrossTrackDrop([source, target], 'A', 'V1', 'V2');
    assert.ok(result);
    assert.equal(result.created, false, 'compatible destination must be reused');
    assert.equal(result.trackId, 'V2');
    assert.equal(result.tracks.find((t) => t.id === 'V1').clips.length, 0);
    assert.equal(result.tracks.find((t) => t.id === 'V2').clips.length, 1);
  }

  {
    const rejected = placement.placeSingleClipOnCrossTrackDrop([source, lockedTarget], 'A', 'V1', 'V3');
    assert.equal(rejected, null, 'locked destination must reject the move');
    assert.equal(source.clips.length, 1, 'source must remain unchanged after rejection');
  }

  {
    const rejected = placement.placeSingleClipOnCrossTrackDrop([source, audioTarget], 'A', 'V1', 'A1');
    assert.equal(rejected, null, 'semantic lane mismatch must not silently append');
  }

  {
    const tracks = [
      track('V1', 'video', [clip('A'), clip('B', 8)]),
      track('V2', 'video', []),
      track('A1', 'audio', []),
    ];
    const selected = [
      { clipId: 'A', trackId: 'V1', initialStartAt: 2, initialDuration: 3 },
      { clipId: 'B', trackId: 'V1', initialStartAt: 8, initialDuration: 3 },
    ];
    const invalid = multi.resolveMultiSelectionTrackTargets(tracks, selected, 'A', 'A1');
    assert.equal(invalid, null, 'mixed-lane group destination must reject atomically');

    const valid = multi.resolveMultiSelectionTrackTargets(tracks, selected, 'A', 'V2', ['V1', 'V2', 'A1']);
    assert.ok(valid);
    assert.equal(valid.get('A'), 'V2');
    assert.equal(valid.get('B'), 'V2');
  }

  console.log('PHASE49_TIMELINE_DRAG_TRANSACTION_INTEGRITY=PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
