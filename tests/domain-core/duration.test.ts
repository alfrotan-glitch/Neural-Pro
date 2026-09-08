import { check, close, equal, suite, throws } from './harness';
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  calculateProjectDuration,
  clampProjectTime,
  getClipSourceRange,
  getClipTimelineEnd,
  getPlaybackRate,
  getSourceDuration,
  getTimelineDuration,
  isClipActiveAt,
  projectFrameCount,
  projectTimeToSourceTime,
  sourceTimeToProjectTime,
  type ClipDurationInput,
} from '../../src/domain/core/duration';
import { assertInterval } from '../../src/domain/core/time';

const clip = (overrides: Partial<ClipDurationInput> & { duration: number }): ClipDurationInput => ({
  startAt: 0,
  duration: overrides.duration,
  trim: overrides.trim ?? null,
  properties: overrides.properties ?? {},
});

export default suite('duration — one authority for clip and project duration', () => {
  // ---- playback rate -----------------------------------------------------
  equal(getPlaybackRate(clip({ duration: 1 })), 1, 'missing speed defaults to 1x');
  equal(getPlaybackRate(clip({ duration: 1, properties: { speed: 0 } })), 1, 'speed 0 defaults to 1x');
  equal(getPlaybackRate(clip({ duration: 1, properties: { speed: -2 } })), 1, 'a negative speed defaults to 1x');
  equal(getPlaybackRate(clip({ duration: 1, properties: { speed: Number.NaN } })), 1, 'NaN speed defaults to 1x');
  equal(getPlaybackRate(clip({ duration: 1, properties: { speed: 0.01 } })), MIN_PLAYBACK_RATE, 'speed clamps to the minimum');
  equal(getPlaybackRate(clip({ duration: 1, properties: { speed: 100 } })), MAX_PLAYBACK_RATE, 'speed clamps to the maximum');
  equal(getPlaybackRate(clip({ duration: 1, properties: { speed: 2 } })), 2, 'a valid speed passes through');

  // ---- source range ------------------------------------------------------
  equal(getClipSourceRange(clip({ duration: 1, trim: { in: 2, out: 5 } })).start, 2, 'source start is trim.in');
  equal(getClipSourceRange(clip({ duration: 1, trim: { in: 2, out: 5 } })).end, 5, 'source end is trim.out');
  equal(getClipSourceRange(clip({ duration: 1, trim: { in: 5, out: 5 } })).end, null, 'an empty trim window has no out-point');
  equal(getClipSourceRange(clip({ duration: 1, trim: null })).start, 0, 'a missing trim starts at 0');
  equal(getClipSourceRange(clip({ duration: 1, trim: null })).end, null, 'a missing trim has no out-point');

  // ---- source duration ---------------------------------------------------
  equal(getSourceDuration(clip({ duration: 1, properties: { imageUrl: 'blob:x' } })), null, 'images are unbounded');
  equal(getSourceDuration(clip({ duration: 1, properties: { textContent: 'hi' } })), null, 'text is unbounded');
  // Documented quirk Q1, branch 1: persisted duration means "media remaining after the in-point".
  equal(
    getSourceDuration(clip({ duration: 1, trim: { in: 2, out: 99 }, properties: { sourceMediaDuration: 10 } })),
    8,
    'persisted duration is measured from trim.in (quirk Q1, pinned by characterization)',
  );
  // Documented quirk Q1, branch 2: without a persisted duration it is the trim window.
  equal(
    getSourceDuration(clip({ duration: 1, trim: { in: 2, out: 5 }, properties: { videoUrl: 'https://x/y.mp4' } })),
    3,
    'without persisted metadata the source duration is the trim window (quirk Q1, pinned)',
  );
  equal(
    getSourceDuration(clip({ duration: 1, properties: { audioUrl: 'https://x/y.mp3' } })),
    null,
    'a media clip with no trim bound is unbounded',
  );
  equal(getSourceDuration(clip({ duration: 1 })), null, 'a clip with no media and no metadata is unbounded');
  equal(
    getSourceDuration(clip({ duration: 1, trim: { in: 3, out: 1 }, properties: { sourceMediaDuration: 2 } })),
    null,
    'a persisted duration not beyond the in-point yields null, never a negative',
  );

  // ---- timeline duration -------------------------------------------------
  equal(
    getTimelineDuration(clip({ duration: 10, trim: { in: 0, out: 4 }, properties: { videoUrl: 'https://x/y.mp4' } })),
    4,
    'timeline duration is bounded by the source range',
  );
  equal(
    getTimelineDuration(clip({ duration: 10, trim: { in: 0, out: 4 }, properties: { videoUrl: 'https://x/y.mp4', speed: 2 } })),
    2,
    'a 2x rate halves the timeline duration',
  );
  equal(
    getTimelineDuration(clip({ duration: 2, trim: { in: 0, out: 4 }, properties: { videoUrl: 'https://x/y.mp4' } })),
    2,
    'a declared duration shorter than the source wins',
  );
  equal(getTimelineDuration(clip({ duration: 7, properties: { imageUrl: 'blob:x' } })), 7, 'an unbounded clip uses its declared duration');
  equal(getTimelineDuration(clip({ duration: Number.NaN } as ClipDurationInput)), 0, 'a non-finite declared duration yields 0');

  // ---- project duration (INV-001) ----------------------------------------
  equal(calculateProjectDuration([]), 0, 'an empty project has zero duration');
  equal(
    calculateProjectDuration([
      { clips: [clip({ duration: 5, properties: { imageUrl: 'blob:x' } })] },
      { clips: [{ ...clip({ duration: 4, properties: { imageUrl: 'blob:x' } }), startAt: 10 }] },
    ]),
    14,
    'project duration is the furthest clip endpoint across all tracks',
  );
  equal(
    calculateProjectDuration([{ clips: [{ ...clip({ duration: 5 }), startAt: Number.NaN }] }]),
    0,
    'a clip with a non-finite start is skipped, not NaN-propagated',
  );

  // ---- clip end / intervals ----------------------------------------------
  const timed = { startAt: 3, duration: 10, properties: { imageUrl: 'blob:x' } } as ClipDurationInput & { startAt: number };
  equal(getClipTimelineEnd(timed), 13, 'clip end is startAt + effective duration');
  throws(() => assertInterval({ start: 5, end: 1 }), 'an inverted interval is rejected');

  // ---- time mapping ------------------------------------------------------
  const mapped = {
    startAt: 10,
    duration: 5,
    trim: { in: 2, out: 7 },
    properties: { videoUrl: 'https://x/y.mp4' },
  } as ClipDurationInput & { startAt: number };
  equal(projectTimeToSourceTime(mapped, 10), 2, 'project time at the clip start maps to trim.in');
  equal(projectTimeToSourceTime(mapped, 11), 3, 'one second in maps one source second at 1x');
  equal(projectTimeToSourceTime(mapped, 100), 7, 'past the end clamps to trim.out');
  equal(projectTimeToSourceTime(mapped, 5), 2, 'before the clip clamps to trim.in');

  const speeded = { ...mapped, properties: { videoUrl: 'https://x/y.mp4', speed: 2 } } as ClipDurationInput & { startAt: number };
  equal(projectTimeToSourceTime(speeded, 10), 2, 'at the clip start the source is trim.in regardless of rate');
  equal(projectTimeToSourceTime(speeded, 11), 4, 'at 2x the source advances twice as fast');
  equal(projectTimeToSourceTime(speeded, 12), 6, 'at 2x two project seconds consume four source seconds');
  equal(getTimelineDuration(speeded), 2.5, 'at 2x the five-second source range occupies 2.5 project seconds');

  close(sourceTimeToProjectTime(mapped, 2), 10, 'source trim.in maps back to the clip start');
  close(sourceTimeToProjectTime(mapped, 7), 15, 'source trim.out maps back to the clip end');
  equal(sourceTimeToProjectTime(mapped, 100), 15, 'a source time past trim.out clamps to the clip end');

  // ---- activity ----------------------------------------------------------
  const active = { startAt: 0, duration: 5, properties: { imageUrl: 'blob:x' } } as ClipDurationInput & { startAt: number };
  check(isClipActiveAt(active, 0), 'active at the first instant');
  check(isClipActiveAt(active, 4.999), 'active just before the end');
  check(!isClipActiveAt(active, 5), 'inactive exactly at the end (half-open)');
  check(!isClipActiveAt({ ...active, properties: { imageUrl: 'blob:x', deactivated: true } }, 1), 'a deactivated clip is never active');

  // ---- clamping / frame counts ------------------------------------------
  equal(clampProjectTime(-1, 10), 0, 'a negative playhead clamps to 0');
  equal(clampProjectTime(50, 10), 10, 'a playhead past the end clamps to the duration');
  equal(clampProjectTime(Number.NaN, 10), 0, 'a non-finite playhead clamps to 0');
  equal(projectFrameCount(1, 30), 30, 'one second @30fps is 30 frames');
  equal(projectFrameCount(0, 30), 0, 'a zero-length project has no frames');
  equal(projectFrameCount(1, 0), 30, 'an invalid fps falls back to the default, never to a division by zero');
});
