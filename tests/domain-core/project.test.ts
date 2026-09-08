import { check, equal, suite } from './harness';
import {
  allClips,
  clipCount,
  normalizeProject,
  withCurrentTime,
  withTracks,
  type PersistedProject,
} from '../../src/domain/core/project';
import { normalizeTrack, canMutateTrackContent, findClip } from '../../src/domain/core/track';
import { calculateProjectDuration } from '../../src/domain/core/duration';
import { clipInterval, clipMediaKind, normalizeClip } from '../../src/domain/core/clip';

const project: PersistedProject = {
  id: 'proj-1',
  title: 'Canonical',
  composition: { size: { width: 1920, height: 1080 }, fps: 24 },
  currentTime: 0,
  tracks: [
    {
      id: 'track-1',
      kind: 'video',
      laneRole: 'video',
      state: { isLocked: false, isMuted: false, isVisible: true, isCollapsed: false },
      clips: [
        {
          id: 'clip-1',
          sourceId: 'src-1',
          startAt: 0,
          duration: 5,
          trim: { in: 0, out: 5 },
          transform: { x: 0, y: 0, scale: 100, rotation: 0 },
          properties: { videoUrl: 'https://example/a.mp4' },
        },
      ],
    },
    {
      id: 'track-2',
      kind: 'text',
      state: { isLocked: true, isMuted: false, isVisible: true, isCollapsed: false },
      clips: [
        {
          id: 'clip-2',
          sourceId: 'src-2',
          startAt: 4,
          duration: 3,
          trim: null,
          transform: null,
          properties: { textContent: 'hello' },
        },
      ],
    },
  ],
};

export default suite('project — derived values and structural invariants', () => {
  const canonical = normalizeProject(project);

  equal(canonical.composition.fps, 24, 'composition fps is preserved');
  equal(canonical.composition.size.width, 1920, 'composition width is preserved');
  equal(canonical.totalDuration, 7, 'totalDuration is the furthest clip endpoint (0+5 vs 4+3)');
  equal(canonical.totalDuration, calculateProjectDuration(canonical.tracks), 'totalDuration equals the canonical derivation (INV-001)');
  equal(clipCount(canonical), 2, 'clip count spans every track');
  equal(allClips(canonical).length, 2, 'allClips flattens in track order');
  equal(canonical.tracks[1]?.laneRole, null, 'a missing lane role normalises to null');
  equal(canonical.tracks[0]?.laneRole, 'video', 'an explicit lane role is preserved');

  // A text clip is unbounded, so its declared duration is the timeline duration.
  const textClip = canonical.tracks[1]?.clips[0];
  equal(textClip?.effectiveDuration, 3, 'an unbounded clip keeps its declared duration');
  equal(clipMediaKind(textClip!), 'text', 'media kind is resolved from properties');
  equal(clipMediaKind(canonical.tracks[0]!.clips[0]!), 'video', 'a videoUrl clip resolves to video');

  // INV-001: totalDuration is recomputed, never written.
  const trimmed = withTracks(canonical, [canonical.tracks[0]!]);
  equal(trimmed.totalDuration, 5, 'removing a track recomputes the duration');
  equal(trimmed.currentTime, 0, 'the playhead stays valid after a duration change');

  const clampedByTracks = withTracks({ ...canonical, currentTime: 7 }, [canonical.tracks[0]!]);
  equal(clampedByTracks.currentTime, 5, 'the playhead is clamped when the project shrinks');

  equal(withCurrentTime(canonical, -1).currentTime, 0, 'a negative playhead clamps to 0');
  equal(withCurrentTime(canonical, 99).currentTime, 7, 'a playhead past the end clamps to totalDuration');
  equal(withCurrentTime(canonical, Number.NaN).currentTime, 0, 'a non-finite playhead clamps to 0');

  // Interval semantics survive normalisation.
  const interval = clipInterval(canonical.tracks[0]!.clips[0]!);
  equal(interval.start, 0, 'interval starts at startAt');
  equal(interval.end, 5, 'interval ends at startAt + effective duration');

  // Locked tracks.
  const locked = canonical.tracks[1]!;
  check(!canMutateTrackContent(locked), 'a locked track rejects content mutation');
  check(canMutateTrackContent(canonical.tracks[0]!), 'an unlocked track accepts content mutation');
  equal(findClip(canonical.tracks, 'clip-2')?.track.id, 'track-2', 'a clip is findable by id across tracks');
  equal(findClip(canonical.tracks, 'missing'), null, 'an unknown clip id resolves to null, not undefined');

  // Normalisation is total: hostile input still produces a usable project.
  const hostile = normalizeProject({
    id: 'proj-2',
    title: '',
    composition: { size: { width: Number.NaN, height: -1 }, fps: 0 },
    currentTime: Number.NaN,
    tracks: [
      {
        id: 't',
        kind: 'video',
        state: { isLocked: false, isMuted: false, isVisible: false, isCollapsed: false },
        clips: [
          {
            id: 'c',
            sourceId: 's',
            startAt: Number.NaN,
            duration: Number.NaN,
            trim: null,
            transform: null,
            properties: null,
          },
        ],
      },
    ],
  });
  equal(hostile.composition.size.width, 1920, 'a broken composition width falls back to 1920');
  equal(hostile.composition.size.height, 1080, 'a broken composition height falls back to 1080');
  equal(hostile.composition.fps, 30, 'a broken fps falls back to the default');
  equal(hostile.currentTime, 0, 'a broken playhead falls back to 0');
  equal(hostile.totalDuration, 0, 'a broken project has a finite duration');
  equal(hostile.tracks[0]?.clips[0]?.properties ? Object.keys(hostile.tracks[0].clips[0].properties).length : -1, 0, 'null properties normalise to an empty bag');

  // A damaged trim is reconstructed, not dropped.
  const damaged = normalizeClip({
    id: 'c', sourceId: 's', startAt: 0, duration: 4,
    trim: { in: 9, out: 1 }, transform: null, properties: null,
  });
  equal(damaged.trim?.out, 13, 'an inverted trim is rebuilt from the declared duration instead of vanishing');
});
