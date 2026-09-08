import { check, equal, suite, throws } from './harness';
import {
  DEFAULT_FPS,
  MAX_FPS,
  MIN_FPS,
  assertFps,
  frameDuration,
  isFinitePositiveFps,
  normalizeFps,
  resolveCaptionFps,
  resolveRenderFps,
} from '../../src/domain/core/fps';

export default suite('fps — single authority (INV-013)', () => {
  // Precedence: explicit export fps > project fps > default.
  const explicit = resolveRenderFps(24, 30);
  equal(explicit.fps, 24, 'export fps wins over project fps');
  equal(explicit.source, 'export', 'export fps is reported as the source');

  const fromProject = resolveRenderFps(undefined, 25);
  equal(fromProject.fps, 25, 'project fps is used when no export fps exists');
  equal(fromProject.source, 'project', 'project fps is reported as the source');

  const fallback = resolveRenderFps(undefined, undefined);
  equal(fallback.fps, DEFAULT_FPS, 'default fps is used when nothing is set');
  equal(fallback.source, 'default', 'default is reported as the source');

  // Invalid input never yields a silent zero framerate.
  equal(normalizeFps(0), DEFAULT_FPS, 'a zero fps falls back to the default, never to 0');
  equal(normalizeFps(Number.NaN), DEFAULT_FPS, 'NaN falls back to the default');
  equal(normalizeFps('30' as unknown as number), DEFAULT_FPS, 'a non-number falls back to the default');
  equal(normalizeFps(-12), DEFAULT_FPS, 'a negative fps falls back to the default');
  equal(normalizeFps(1000), MAX_FPS, 'an absurd fps clamps to the maximum');
  equal(normalizeFps(0.2), MIN_FPS, 'a sub-1 fps clamps to the minimum');
  equal(normalizeFps(30), 30, 'a valid fps passes through');

  // Strict assertion.
  throws(() => assertFps(0), 'assertFps rejects 0');
  throws(() => assertFps(Number.NaN), 'assertFps rejects NaN');
  throws(() => assertFps(Number.POSITIVE_INFINITY), 'assertFps rejects Infinity');
  equal(assertFps(24), 24, 'assertFps returns a usable fps');

  // Captions must not carry an independent framerate.
  equal(resolveCaptionFps(24), 24, 'caption fps follows the render fps, not a hardcoded 30');
  equal(resolveCaptionFps(undefined), DEFAULT_FPS, 'caption fps falls back to the default');

  // Frame duration.
  equal(frameDuration(30), 1 / 30, 'frame duration is 1/fps');
  equal(frameDuration(0), 1 / DEFAULT_FPS, 'frame duration of an invalid fps uses the default');

  check(isFinitePositiveFps(24) && !isFinitePositiveFps(0), 'isFinitePositiveFps discriminates correctly');
});
