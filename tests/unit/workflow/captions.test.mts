/**
 * Caption timecodes and the mandatory project fps — WP-09 §8 ("caption timecodes
 * are correct at 24 / 30 / 60 fps"), closes D-022 / SHIM-005.
 *
 * The defect: `DEFAULT_CAPTION_FPS = 30` meant a 24 or 60 fps project silently
 * got 30 fps `HH:MM:SS:FF` timecodes. The constant is deleted; every conversion
 * takes an explicit fps, and an unreadable project fps is a typed failure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSrtTimestamp,
  parseCaptionTimestamp,
  secondsToFrameTimecode,
  secondsToSrtTimestamp,
} from '../../../src/features/video-studio/captions/services/captionTimecodeService.ts';
import { getProjectFps } from '../../../src/features/video-studio/captions/services/captionProjectFps.ts';
import { useProjectStore } from '../../../src/store/useProjectStore.ts';
import type { AppError } from '../../../src/domain/errors/appError.ts';

/* ------------------------------------------------------------ 24 / 30 / 60 fps */

test('frame timecodes are correct at 24, 30 and 60 fps', () => {
  const cases: [number, number, string][] = [
    [1.5, 24, '00:00:01:12'],
    [1.5, 30, '00:00:01:15'],
    [1.5, 60, '00:00:01:30'],
    [0, 24, '00:00:00:00'],
    [61.25, 24, '00:01:01:06'],
    [61.25, 30, '00:01:01:08'],
    [61.25, 60, '00:01:01:15'],
    [3661.5, 60, '01:01:01:30'],
  ];
  for (const [seconds, fps, expected] of cases) {
    assert.equal(secondsToFrameTimecode(seconds, fps), expected, `${seconds}s at ${fps}fps`);
  }
});

test('the same instant produces different frames at different rates (D-022)', () => {
  const at24 = secondsToFrameTimecode(1.5, 24);
  const at30 = secondsToFrameTimecode(1.5, 30);
  const at60 = secondsToFrameTimecode(1.5, 60);
  assert.notEqual(at24, at30);
  assert.notEqual(at30, at60);
  assert.notEqual(at24, at60);
});

test('round-trip: seconds → frame timecode → seconds is exact at integer rates', () => {
  for (const fps of [24, 25, 30, 50, 60, 120]) {
    for (const seconds of [0, 0.5, 1.5, 12.34, 90.75, 3661.5]) {
      const timecode = secondsToFrameTimecode(seconds, fps);
      const back = parseCaptionTimestamp(timecode, fps);
      // One frame of tolerance: the timecode is frame-quantised by definition.
      assert.ok(Math.abs(back - seconds) <= 1 / fps + 1e-9, `${timecode} @${fps}fps → ${back}s`);
    }
  }
});

/**
 * KNOWN LIMITATION (recorded, not silently accepted): the encoder quantises with
 * `Math.round(fps)` as its frame base while the decoder divides by the exact
 * `projectFps`, so fractional broadcast rates (23.976 / 29.97 / 59.94) do not
 * round-trip exactly — the drift grows with elapsed time (≈0.08 s at 90 s for
 * 23.976). The caption contract (`docs/workflows/caption.md`) only mandates
 * 24/30/60, and the server conversion in `server/captions/srt.ts` uses the same
 * convention, so the two sides agree with each other. This test pins the current
 * behaviour so any change to it is deliberate.
 */
test('fractional rates keep a bounded, documented drift (known limitation)', () => {
  for (const fps of [23.976, 29.97, 59.94]) {
    const timecode = secondsToFrameTimecode(90.75, fps);
    const back = parseCaptionTimestamp(timecode, fps);
    const drift = Math.abs(back - 90.75);
    assert.ok(drift < 0.25, `${timecode} @${fps}fps drifted ${drift.toFixed(4)}s`);
    assert.ok(drift > 1 / fps, 'the drift is real, not a rounding artefact');
  }
});

test('parsing HH:MM:SS:FF honours the supplied rate', () => {
  assert.equal(parseCaptionTimestamp('00:00:01:12', 24), 1.5);
  assert.equal(parseCaptionTimestamp('00:00:01:15', 30), 1.5);
  assert.equal(parseCaptionTimestamp('00:00:01:30', 60), 1.5);
});

test('a frame component at or beyond the rate is rejected, not silently wrapped', () => {
  assert.throws(() => parseCaptionTimestamp('00:00:01:24', 24), /Invalid frame component/);
  assert.throws(() => parseCaptionTimestamp('00:00:01:30', 30), /Invalid frame component/);
  assert.throws(() => parseCaptionTimestamp('00:00:01:60', 60), /Invalid frame component/);
  assert.throws(() => parseCaptionTimestamp('00:00:01:12', -1), /Invalid FPS/);
  assert.throws(() => parseCaptionTimestamp('00:00:01:12', Number.NaN), /Invalid FPS/);
  assert.throws(() => secondsToFrameTimecode(1, 0), /Invalid FPS/);
});

test('SRT timestamps are rate-independent and stay millisecond-accurate', () => {
  assert.equal(secondsToSrtTimestamp(1.5), '00:00:01,500');
  assert.equal(secondsToSrtTimestamp(3661.001), '01:01:01,001');
  assert.equal(normalizeSrtTimestamp('00:00:01.500', 24), '00:00:01,500');
  assert.equal(normalizeSrtTimestamp('00:00:01,500', 60), '00:00:01,500');
  assert.equal(parseCaptionTimestamp('00:01:01,500', 24), 61.5);
});

test('an invalid rate is refused rather than defaulted to 30', () => {
  assert.equal(secondsToFrameTimecode(1, 24), '00:00:01:00', 'a valid rate works');
  for (const fps of [0, -24, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => secondsToFrameTimecode(1, fps), /Invalid FPS/, `fps=${String(fps)}`);
  }
});

/* --------------------------------------------------------------- project fps */

function withFps(fps: unknown, run: () => void): void {
  const previous = useProjectStore.getState().metadata;
  useProjectStore.setState({ metadata: { ...previous, fps } as never });
  try {
    run();
  } finally {
    useProjectStore.setState({ metadata: previous } as never);
  }
}

test('getProjectFps returns the project rate when it is valid', () => {
  for (const fps of [23.976, 24, 30, 60, 120]) {
    withFps(fps, () => assert.equal(getProjectFps(), fps));
  }
});

test('getProjectFps throws a typed VALIDATION_FAILED instead of defaulting', () => {
  for (const fps of [undefined, null, 0, -30, Number.NaN, 240, '30']) {
    withFps(fps, () => {
      let caught: AppError | null = null;
      try {
        getProjectFps();
      } catch (error) {
        caught = error as AppError;
      }
      assert.ok(caught, `fps=${String(fps)} must be rejected`);
      assert.equal(caught.code, 'VALIDATION_FAILED');
      assert.equal(caught.retryable, false);
      assert.match(caught.message, /frame rate is not valid/i);
    });
  }
});

test('no default caption fps constant exists anywhere in the client', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const roots = ['src/features/video-studio/captions', 'src/components', 'src/app/workflows'];
  const found: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(path.join(process.cwd(), dir), { withFileTypes: true })) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(relative);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = await fs.readFile(path.join(process.cwd(), relative), 'utf8');
        if (/DEFAULT_CAPTION_FPS|\*\s*30\b.*frame|fps\s*=\s*30/.test(text)) found.push(relative);
      }
    }
  };
  for (const root of roots) await walk(root);
  assert.deepEqual(found, [], `a hard-coded caption fps survived in: ${found.join(', ')}`);
});
