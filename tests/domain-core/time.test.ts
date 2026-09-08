import { check, equal, suite, throws } from './harness';
import {
  TIME_EPSILON,
  clampTime,
  clampToDuration,
  frameIndexAt,
  isFiniteTime,
  frameToSeconds,
  framesForDuration,
  floorTimeToFrame,
  clampToInterval,
  intervalContains,
  intervalDuration,
  intervalsOverlap,
  makeInterval,
  quantizeTimeToFrame,
  timesEqual,
} from '../../src/domain/core/time';
import { frameDuration } from '../../src/domain/core/fps';

export default suite('time — seconds are the only stored unit', () => {
  // Frame projection uses the executing round-half rule (captionTimecodeService:53).
  equal(frameIndexAt(0, 30), 0, 'frame 0 at t=0');
  equal(frameIndexAt(0.5, 30), 15, 'frame 15 at t=0.5s @30fps');
  equal(frameIndexAt(-1, 30), 0, 'a negative time clamps to frame 0');
  equal(frameIndexAt(Number.NaN, 30), 0, 'a non-finite time clamps to frame 0');
  equal(frameIndexAt(0.0166, 30), 0, 'round-half, not ceil: 0.0166s @30fps is frame 0');
  equal(frameIndexAt(0.0167, 30), 1, 'round-half: 0.0167s @30fps is frame 1');

  equal(frameToSeconds(15, 30), 0.5, 'frame 15 @30fps is 0.5s');
  equal(frameToSeconds(-5, 30), 0, 'a negative frame clamps to 0');

  equal(quantizeTimeToFrame(0.5, 30), 0.5, 'an exact frame boundary is unchanged');
  equal(quantizeTimeToFrame(0.51, 30), frameIndexAt(0.51, 30) / 30, 'quantisation agrees with frameIndexAt');
  equal(floorTimeToFrame(0.51, 30), Math.floor(0.51 * 30) / 30, 'floor snaps to the frame start');

  // Frame counts: ceil with epsilon, so an exact multiple is not over-counted.
  equal(framesForDuration(1, 30), 30, 'one second @30fps is 30 frames');
  equal(framesForDuration(1 / 30, 30), 1, 'exactly one frame duration is 1 frame, not 2');
  equal(framesForDuration(0, 30), 0, 'a zero duration is zero frames');
  equal(framesForDuration(2.5, 24), 60, '2.5s @24fps is 60 frames');

  // Clamping.
  equal(clampToDuration(-1, 10), 0, 'a negative time clamps to 0');
  equal(clampToDuration(11, 10), 10, 'a time past the end clamps to the duration');
  equal(clampToDuration(Number.NaN, 10), 0, 'a non-finite time clamps to 0');
  equal(clampToDuration(5, Number.NaN), 0, 'a non-finite duration yields 0');
  equal(clampTime(5, 10, 2), 10, 'an inverted range returns the lower bound rather than nonsense');

  // Half-open intervals.
  const first = makeInterval(0, 5);
  const second = makeInterval(5, 5);
  equal(intervalDuration(first), 5, 'interval duration is end - start');
  check(intervalContains(first, 0), '[0,5) contains 0');
  check(intervalContains(first, 4.999), '[0,5) contains 4.999');
  check(!intervalContains(first, 5), '[0,5) does NOT contain 5 (half-open)');
  check(!intervalsOverlap(first, second), 'adjacent clips [0,5) and [5,10) never both render at 5s');
  check(intervalsOverlap(first, makeInterval(4, 2)), 'overlapping intervals are detected');
  check(!intervalContains(first, Number.NaN), 'a non-finite time is never contained');

  // Float comparison.
  check(timesEqual(0.1 + 0.2, 0.3), 'float noise is absorbed by the epsilon');
  check(!timesEqual(1, 1 + TIME_EPSILON * 10), 'a real difference is not absorbed');
  check(!timesEqual(Number.NaN, Number.NaN), 'NaN never equals NaN');

  // Invariant: frame projection never emits a non-finite value.
  equal(frameDuration(0), 1 / 30, 'frameDuration never divides by zero');

  // ---- atomic time predicates -------------------------------------------
  check(isFiniteTime(0) && isFiniteTime(1.5), 'finite times are accepted');
  check(!isFiniteTime(Number.NaN), 'NaN is not a time');
  check(!isFiniteTime(Number.POSITIVE_INFINITY), 'Infinity is not a time');
  check(!isFiniteTime('1'), 'a string is not a time');

  equal(clampToInterval(first, 2.5), 2.5, 'a time inside the interval is unchanged');
  equal(clampToInterval(first, -1), 0, 'a time before the interval clamps to its start');
  equal(clampToInterval(first, 99), 5, 'a time after the interval clamps to its end');
  equal(clampToInterval(first, Number.NaN), 0, 'a non-finite time clamps to the interval start');
});
