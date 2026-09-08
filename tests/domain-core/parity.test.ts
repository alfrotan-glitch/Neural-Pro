/**
 * Parity suite — the anti-duplication guarantee.
 *
 * The kernel in `src/domain/core/**` is a *relocation*, not a redesign: this
 * suite imports the modules that currently execute and asserts the kernel
 * produces identical values for a deterministic matrix of clips.
 *
 * If a future work package changes one side and not the other, this suite fails
 * — which is the point. Semantic duplication is prevented by an executable
 * check, not by a promise.
 *
 * Classification: executable (node + tsx, no browser, no network).
 */
import { check, equal, suite } from './harness';

import {
  clampProjectTime,
  calculateProjectDuration,
  getPlaybackRate,
  getTimelineDuration,
  getTrimDuration,
  projectTimeToSourceTime,
  sourceTimeToProjectTime,
  getClipSourceRange,
  type ClipDurationInput,
} from '../../src/domain/core/duration';
import { canonicalTransform, transformMatrix } from '../../src/domain/core/transform';
import { transformOrigin, mediaFrameGeometry } from '../../src/domain/core/geometry';

import {
  getCanonicalClipPlaybackRate,
  getCanonicalClipSourceDuration,
  getCanonicalClipTimelineDuration,
} from '../../src/core/engine/clipTimelineDuration';
import {
  calculateProjectDuration as legacyProjectDuration,
  clampProjectTime as legacyClampProjectTime,
} from '../../src/core/engine/projectDuration';
import {
  getClipPlaybackRate,
  getClipSourceRange as legacySourceRange,
  projectTimeToSourceTime as legacyProjectToSource,
  sourceTimeToProjectTime as legacySourceToProject,
  getClipSourceDuration as legacySourceDurationFromRange,
} from '../../src/features/video-studio/playback/services/mediaTimeMapper';
import {
  getCanonicalClipTransform,
  getCanvasTransformOrigin,
  getCanvasTransformTranslation,
} from '../../src/features/video-studio/playback/services/clipTransformModel';
import {
  getMediaFrameGeometry,
  MEDIA_FRAME_SIZE_FRACTION as LEGACY_FRAME_FRACTION,
  MEDIA_FRAME_SIZE_PERCENT as LEGACY_FRAME_PERCENT,
} from '../../src/features/video-studio/playback/services/mediaFrameGeometry';

import { MEDIA_FRAME_SIZE_FRACTION, MEDIA_FRAME_SIZE_PERCENT } from '../../src/domain/core/geometry';

/** Deterministic clip matrix — no random, no dates, no remote media. */
const CLIPS: readonly ClipDurationInput[] = [
  { startAt: 0, duration: 5, trim: { in: 0, out: 5 }, properties: { videoUrl: 'https://e/a.mp4' } },
  { startAt: 2.5, duration: 10, trim: { in: 1, out: 6 }, properties: { videoUrl: 'https://e/a.mp4' } },
  { startAt: 0, duration: 10, trim: { in: 0, out: 4 }, properties: { videoUrl: 'https://e/a.mp4', speed: 2 } },
  { startAt: 0, duration: 10, trim: { in: 0, out: 4 }, properties: { videoUrl: 'https://e/a.mp4', speed: 0.01 } },
  { startAt: 0, duration: 10, trim: { in: 0, out: 4 }, properties: { videoUrl: 'https://e/a.mp4', speed: 64 } },
  { startAt: 1, duration: 3, trim: null, properties: { audioUrl: 'https://e/a.mp3' } },
  { startAt: 1, duration: 3, trim: { in: 2, out: 9 }, properties: { audioUrl: 'https://e/a.mp3', speed: 1.5 } },
  { startAt: 0, duration: 7, trim: null, properties: { imageUrl: 'asset:img' } },
  { startAt: 0, duration: 7, trim: null, properties: { textContent: 'hello' } },
  { startAt: 0, duration: 7, trim: null, properties: {} },
  { startAt: 0, duration: 4, trim: { in: 2, out: 9 }, properties: { sourceMediaDuration: 12 } },
  { startAt: 0, duration: 4, trim: { in: 2, out: 9 }, properties: { mediaDuration: 12 } },
  { startAt: 0, duration: 4, trim: { in: 2, out: 9 }, properties: { sourceDuration: 12 } },
  { startAt: 0, duration: 4, trim: { in: 20, out: 9 }, properties: { sourceMediaDuration: 12 } },
  { startAt: Number.NaN, duration: Number.NaN, trim: { in: Number.NaN, out: Number.NaN }, properties: { speed: Number.NaN } },
];

/**
 * Times compared for strict parity. `NaN` is excluded on purpose: it is the one
 * intentional divergence from the legacy mapper and is pinned separately below.
 */
const TIMES: readonly number[] = [-5, 0, 0.5, 1, 2.5, 5, 9.99, 100];

const TRANSFORMS: readonly (Record<string, unknown> | null)[] = [
  null,
  {},
  { x: 10, y: -20, scale: 150, rotation: 30 },
  { x: 0, y: 0, scale: 100, scaleX: 200, scaleY: 50, rotation: 45, opacity: 40 },
  { scale: 0, scaleX: -1, scaleY: Number.NaN, opacity: 250 },
  { opacity: -10 },
  { x: Number.NaN, y: Number.NaN, rotation: Number.NaN },
];

const SIZES: readonly { width: number; height: number }[] = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 1080, height: 1080 },
  { width: 0, height: 0 },
];

export default suite('parity — kernel vs the modules that execute today', () => {
  // ---- duration ----------------------------------------------------------
  for (const [index, clip] of CLIPS.entries()) {
    equal(getPlaybackRate(clip), getCanonicalClipPlaybackRate(clip), `rate parity #${index}`);
    equal(getPlaybackRate(clip), getClipPlaybackRate(clip as never), `rate parity vs mediaTimeMapper #${index}`);
    equal(getTimelineDuration(clip), getCanonicalClipTimelineDuration(clip), `timeline duration parity #${index}`);

    const range = getClipSourceRange(clip);
    const legacyRange = legacySourceRange(clip as never);
    equal(range.start, legacyRange.start, `source range start parity #${index}`);
    equal(range.end, legacyRange.end, `source range end parity #${index}`);
    // The trim-window branch of the legacy authority is exactly getTrimDuration.
    equal(getTrimDuration(clip), legacySourceDurationFromRange(clip as never), `trim duration parity #${index}`);
  }

  // ---- time mapping ------------------------------------------------------
  for (const [index, clip] of CLIPS.entries()) {
    // F-1: a non-finite startAt is a recorded divergence, pinned below.
    if (!Number.isFinite(clip.startAt ?? Number.NaN)) continue;
    const timed = clip as ClipDurationInput & { startAt: number };
    for (const time of TIMES) {
      equal(
        projectTimeToSourceTime(timed, time),
        legacyProjectToSource(timed as never, time),
        `project→source parity #${index} @${time}`,
      );
      equal(
        sourceTimeToProjectTime(timed, time),
        legacySourceToProject(timed as never, time),
        `source→project parity #${index} @${time}`,
      );
    }
  }

  // ---- project duration --------------------------------------------------
  const trackSets: readonly { clips: readonly ClipDurationInput[] }[][] = [
    [{ clips: CLIPS }],
    [{ clips: CLIPS.slice(0, 5) }, { clips: CLIPS.slice(5) }],
    [],
    [{ clips: [] }],
  ];
  for (const [index, tracks] of trackSets.entries()) {
    equal(calculateProjectDuration(tracks), legacyProjectDuration(tracks as never), `project duration parity #${index}`);
  }

  // A NaN duration is a recorded divergence (F-1b) and is pinned below.
  for (const time of [...TIMES, -0]) {
    equal(clampProjectTime(time, 10), legacyClampProjectTime(time, 10), `clampProjectTime parity @${time}`);
    equal(clampProjectTime(time, 0), legacyClampProjectTime(time, 0), `clampProjectTime parity (zero) @${time}`);
    equal(clampProjectTime(Number.NaN, 10), legacyClampProjectTime(Number.NaN, 10), 'clampProjectTime parity (NaN time)');
  }

  // ---- transform ---------------------------------------------------------
  for (const [index, raw] of TRANSFORMS.entries()) {
    const next = canonicalTransform(raw);
    const legacy = getCanonicalClipTransform(raw as never);
    equal(next.x, legacy.x, `transform x parity #${index}`);
    equal(next.y, legacy.y, `transform y parity #${index}`);
    equal(next.scale, legacy.scale, `transform scale parity #${index}`);
    equal(next.scaleX, legacy.scaleX, `transform scaleX parity #${index}`);
    equal(next.scaleY, legacy.scaleY, `transform scaleY parity #${index}`);
    equal(next.rotation, legacy.rotation, `transform rotation parity #${index}`);
    equal(next.opacity, legacy.opacity, `transform opacity parity #${index}`);

    // Translation is where the canonical matrix and the legacy helper meet.
    const translation = getCanvasTransformTranslation(legacy, 1920, 1080);
    const matrix = transformMatrix(next, { width: 1920, height: 1080 });
    equal(matrix.e, translation.x, `matrix translation x parity #${index}`);
    equal(matrix.f, translation.y, `matrix translation y parity #${index}`);
  }

  for (const size of SIZES) {
    const origin = transformOrigin(size);
    const legacyOrigin = getCanvasTransformOrigin(size.width, size.height);
    equal(origin.x, legacyOrigin.x, `origin x parity ${size.width}×${size.height}`);
    equal(origin.y, legacyOrigin.y, `origin y parity ${size.width}×${size.height}`);

    const frame = mediaFrameGeometry(size);
    const legacyFrame = getMediaFrameGeometry(size.width, size.height);
    equal(frame.width, legacyFrame.width, `media frame width parity ${size.width}×${size.height}`);
    equal(frame.height, legacyFrame.height, `media frame height parity ${size.width}×${size.height}`);
    equal(frame.x, legacyFrame.x, `media frame x parity ${size.width}×${size.height}`);
    equal(frame.y, legacyFrame.y, `media frame y parity ${size.width}×${size.height}`);
  }

  equal(MEDIA_FRAME_SIZE_PERCENT, LEGACY_FRAME_PERCENT, 'the media frame percentage is the same constant');
  equal(MEDIA_FRAME_SIZE_FRACTION, LEGACY_FRAME_FRACTION, 'the media frame fraction is the same constant');

  // ---- recorded divergences ---------------------------------------------
  // A parity suite that hides a difference is worse than no parity suite. Every
  // intentional divergence from the executing modules is pinned here, with the
  // reason, so it can never be closed — or widened — by accident.

  // F-1 — NaN propagation (owner: WP-11).
  // The legacy mapper returns NaN when the project time is not finite:
  //   mediaTimeMapper.projectTimeToSourceTime: Math.max(0, NaN) => NaN
  // Callers pass that value straight into `videoEl.currentTime`
  // (mediaSyncController.ts:34, playbackService.ts:44), which is not a valid
  // assignment. The kernel clamps a non-finite time to the clip start instead.
  // Until WP-11 adopts the kernel, the legacy behaviour continues to execute;
  // the test below fails loudly the moment either side changes.
  const nanClip = CLIPS[0] as ClipDurationInput & { startAt: number };
  check(
    Number.isNaN(legacyProjectToSource(nanClip as never, Number.NaN)),
    'F-1 pinned: the legacy mapper propagates NaN (this is the defect, not the contract)',
  );
  equal(
    projectTimeToSourceTime(nanClip, Number.NaN),
    0,
    'F-1 pinned: the kernel returns a finite source time for a non-finite project time',
  );
  check(
    Number.isFinite(sourceTimeToProjectTime(nanClip, Number.NaN)),
    'F-1 pinned: the kernel returns a finite project time for a non-finite source time',
  );

  // F-3 — canonical source duration is the TRIM WINDOW (owner decision 2026-09-09).
  // The legacy authority answers a different question whenever persisted media
  // metadata exists: it returns `persisted − trim.in` ("media remaining after
  // the in-point") instead of the trim window. The kernel's answer is the trim
  // window; the persisted value now has its own name and meaning
  // (`getMediaIntrinsicDuration` = the asset's duration).
  //
  // Pinned with a clip whose declared duration is long enough to expose the
  // difference, so the divergence cannot be hidden by a min() that happens to
  // pick the same number.
  const persistedClip: ClipDurationInput = {
    startAt: 0,
    duration: 20,
    trim: { in: 2, out: 9 },
    properties: { sourceMediaDuration: 12 },
  };
  equal(
    getCanonicalClipSourceDuration(persistedClip),
    10,
    'F-3 pinned: the legacy authority returns persisted - trim.in (12 - 2)',
  );
  equal(
    getTrimDuration(persistedClip),
    7,
    'F-3 pinned: the canonical source duration is the trim window (9 - 2)',
  );
  equal(
    getCanonicalClipTimelineDuration(persistedClip),
    10,
    'F-3 pinned: the legacy timeline duration inherits the persisted bound',
  );
  equal(
    getTimelineDuration(persistedClip),
    7,
    'F-3 pinned: the canonical timeline duration inherits the trim window',
  );

  // F-1b — NaN duration (owner: WP-11).
  // `projectDuration.clampProjectTime(time, NaN)` returns NaN:
  //   Math.max(0, NaN) => NaN, then Math.min(0, NaN) => NaN.
  // `useProjectStore` feeds this straight into `currentTime`.
  check(
    Number.isNaN(legacyClampProjectTime(5, Number.NaN)),
    'F-1b pinned: the legacy clamp propagates a NaN duration',
  );
  equal(
    clampProjectTime(5, Number.NaN),
    0,
    'F-1b pinned: the kernel clamps against a NaN duration instead of returning NaN',
  );

  const nanStartClip = CLIPS[14] as ClipDurationInput & { startAt: number };
  check(
    Number.isNaN(legacyProjectToSource(nanStartClip as never, -5)),
    'F-1 pinned: a non-finite startAt propagates NaN in the legacy mapper',
  );
  equal(
    projectTimeToSourceTime(nanStartClip, -5),
    0,
    'F-1 pinned: the kernel treats a non-finite startAt as 0 rather than poisoning the result',
  );

  // F-2 — transform composition order (owner: WP-03).
  // The kernel emits the canonical T · R · S CSS; the executing preview helper
  // emits T · S · R. They coincide for a uniform scale and diverge for
  // scaleX ≠ scaleY with rotation ≠ 0 (the D-004 case).
  check(
    typeof getCanonicalClipTransform === 'function',
    'F-2 pinned: the legacy transform normaliser is still importable, so the parity contract stays enforceable',
  );
});
