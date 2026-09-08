const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const tscScript = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
const tscCommand = process.execPath;

const source = path.join(root, 'src/features/video-studio/timeline/services/timelineEditingEngine.ts');
const uuidSource = path.join(root, 'src/lib/uuid.ts');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-timeline-engine-'));

try {
  const compile = spawnSync(tscCommand, [tscScript, 
    '--target', 'ES2022',
    '--module', 'CommonJS',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--outDir', tempRoot,
    source,
    uuidSource,
  ], { cwd: root, encoding: 'utf8' });

  if (compile.status !== 0) {
    process.stderr.write(compile.stdout || '');
    process.stderr.write(compile.stderr || '');
    process.exit(1);
  }

  const enginePath = path.join(
    tempRoot,
    'features/video-studio/timeline/services/timelineEditingEngine.js',
  );
  const { applyRipplePlacement, applyOverwritePlacement } = require(enginePath);

  const mkClip = (id, startAt, duration) => ({
    id,
    sourceId: `source-${id}`,
    startAt,
    duration,
    trim: { in: 0, out: duration },
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    properties: {},
  });

  const mkTrack = (id, clips, locked = false) => ({
    id,
    type: 'video',
    isLocked: locked,
    isMuted: false,
    isVisible: true,
    clips,
  });

  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  // Ripple pushes all subsequent editable clips while preserving order.
  {
    const a = mkClip('A', 10, 5);
    const b = mkClip('B', 12, 5);
    const c = mkClip('C', 17, 3);
    const result = applyRipplePlacement(mkTrack('T', [a, b, c]), 'A');
    assert(result.changed, 'Ripple should report a change.');
    assert(result.clips.find((clip) => clip.id === 'B').startAt === 15, 'Ripple did not move B to 15s.');
    assert(result.clips.find((clip) => clip.id === 'C').startAt === 20, 'Ripple did not propagate to C at 20s.');
  }

  // Locked tracks are immutable.
  {
    const a = mkClip('A', 10, 5);
    const b = mkClip('B', 12, 5);
    const result = applyRipplePlacement(mkTrack('T', [a, b], true), 'A');
    assert(!result.changed, 'Locked-track Ripple must be a no-op.');
  }

  // Overwrite splits an overlapped editable clip into left and right pieces.
  {
    const active = mkClip('A', 10, 5);
    const target = mkClip('B', 6, 12);
    const result = applyOverwritePlacement(
      mkTrack('T', [target, active]),
      'A',
      { minClipDuration: 0.01, preserveLockedClips: false },
    );
    const pieces = result.clips.filter((clip) => clip.id !== 'A');
    assert(result.clips.length === 3, 'Overwrite middle-hole case must produce 3 clips.');
    assert(pieces.some((clip) => clip.startAt === 6 && clip.duration === 4), 'Overwrite left piece is incorrect.');
    assert(pieces.some((clip) => clip.startAt === 15 && clip.duration === 3), 'Overwrite right piece is incorrect.');
  }

  // Ripple is non-destructive when moving earlier into a preceding clip: it
  // clamps the active clip to the first legal gap instead of trimming/deleting
  // the preceding clip. Overwrite remains the explicit trimming mode.
  {
    const active = mkClip('A', 10, 5);
    const editable = mkClip('B', 8, 12);
    const result = applyRipplePlacement(mkTrack('T', [editable, active]), 'A');
    const b = result.clips.find((clip) => clip.id === 'B');
    const a = result.clips.find((clip) => clip.id === 'A');
    assert(b && b.startAt === 8 && b.duration === 12, 'Ripple must preserve the preceding clip when resolving left overlap.');
    assert(a && a.startAt === 20, 'Ripple must clamp the active clip to the first legal gap after the preceding clip.');
    assert(result.clips.every((clip, index, clips) => index === 0 || clips[index - 1].startAt + clips[index - 1].duration <= clip.startAt), 'Ripple result must be overlap-free.');
  }

  // Ripple must refuse a mutation on a locked track even when a permissive policy is supplied.
  {
    const active = mkClip('A', 10, 5);
    const result = applyRipplePlacement(mkTrack('T', [active], true), 'A', { minClipDuration: 0.01, preserveLockedClips: false });
    assert(!result.changed, 'Ripple must never bypass a locked track.');
  }

  // Overwrite must refuse a mutation on a locked track even when a permissive policy is supplied.
  {
    const active = mkClip('A', 10, 5);
    const target = mkClip('B', 6, 12);
    const result = applyOverwritePlacement(mkTrack('T', [target, active], true), 'A', { minClipDuration: 0.01, preserveLockedClips: false });
    assert(!result.changed, 'Overwrite must never bypass a locked track.');
  }

  // On an editable track, every ClipNode is an overwrite target because the
  // current data model has no clip-level lock flag. Track locking is enforced
  // separately and tested above.
  {
    const active = mkClip('A', 10, 5);
    const editableTarget = mkClip('B', 8, 10);
    const result = applyOverwritePlacement(mkTrack('T', [editableTarget, active]), 'A');
    const pieces = result.clips.filter((clip) => clip.id !== 'A');
    assert(pieces.some((clip) => clip.startAt === 8 && clip.duration === 2), 'Editable overlap left piece is incorrect.');
    assert(pieces.some((clip) => clip.startAt === 15 && clip.duration === 3), 'Editable overlap right piece is incorrect.');
  }

  console.log('TIMELINE_RIPPLE_OVERWRITE_RUNTIME=PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
