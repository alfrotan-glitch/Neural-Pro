import { check, equal, suite } from './harness';
import {
  clipInterval,
  isActiveAt,
  normalizeClip,
  normalizeClips,
  resolveMediaKind,
  type PersistedClip,
} from '../../src/domain/core/clip';

const clip = (overrides: Partial<PersistedClip> = {}): PersistedClip => ({
  id: 'clip-1',
  sourceId: 'src-1',
  startAt: 0,
  duration: 5,
  trim: null,
  transform: null,
  properties: null,
  ...overrides,
});

export default suite('clip — loose in, strict out', () => {
  // ---- normalisation is total -------------------------------------------
  const plain = normalizeClip(clip());
  equal(plain.transform.scale, 100, 'a missing transform becomes the identity');
  equal(plain.transform.opacity, 100, 'a missing transform is opaque');
  equal(plain.properties ? Object.keys(plain.properties).length : -1, 0, 'null properties become an empty bag');
  equal(plain.trim, null, 'a missing trim stays null (unbounded)');
  equal(plain.effectiveDuration, 5, 'an unbounded clip keeps its declared duration');

  equal(normalizeClip(clip({ startAt: -3 })).startAt, 0, 'a negative start clamps to 0');
  equal(normalizeClip(clip({ duration: Number.NaN })).duration, 0, 'a non-finite duration becomes 0');
  equal(normalizeClip(clip({ duration: Number.NaN })).effectiveDuration, 0, 'the effective duration follows');
  equal(normalizeClip(clip({ duration: -4 })).duration, 0, 'a negative duration clamps to 0');

  // A damaged trim is rebuilt from the declared duration rather than dropped.
  const damaged = normalizeClip(clip({ duration: 4, trim: { in: 9, out: 1 } }));
  equal(damaged.trim?.in, 9, 'the in-point is preserved');
  equal(damaged.trim?.out, 13, 'the out-point is rebuilt as in + declared duration');
  equal(damaged.effectiveDuration, 4, 'the rebuilt trim window equals the declared duration');

  equal(normalizeClips([clip({ id: 'a' }), clip({ id: 'b' })]).length, 2, 'clips normalise in a batch');
  equal(normalizeClips([]).length, 0, 'an empty batch is empty, not null');

  // ---- interval ----------------------------------------------------------
  const timed = normalizeClip(clip({ startAt: 2, duration: 5 }));
  equal(clipInterval(timed).start, 2, 'the interval starts at startAt');
  equal(clipInterval(timed).end, 7, 'the interval ends at startAt + effective duration');

  const trimmed = normalizeClip(clip({ startAt: 2, duration: 20, trim: { in: 0, out: 3 } }));
  equal(clipInterval(trimmed).end, 5, 'the interval uses the effective duration, not the declared one');

  // ---- activity (half-open) ----------------------------------------------
  check(isActiveAt(timed, 2), 'active at the first instant');
  check(isActiveAt(timed, 6.999), 'active just before the end');
  check(!isActiveAt(timed, 7), 'inactive exactly at the end');
  check(!isActiveAt(timed, 1.999), 'inactive before the start');
  check(!isActiveAt(timed, Number.NaN), 'a non-finite time is never active');

  const off = normalizeClip(clip({ startAt: 0, duration: 5, properties: { deactivated: true } }));
  check(!isActiveAt(off, 1), 'a deactivated clip is never active');

  // ---- media kind precedence (executing precedence preserved) -------------
  equal(resolveMediaKind({ imageUrl: 'asset:i' }), 'image', 'image wins over everything');
  equal(resolveMediaKind({ imageUrl: 'asset:i', videoUrl: 'https://v' }), 'image', 'image precedes video');
  equal(resolveMediaKind({ textContent: 'hi', videoUrl: 'https://v' }), 'text', 'text precedes video');
  equal(resolveMediaKind({ textContent: '' }), 'text', 'an empty text content is still text');
  equal(resolveMediaKind({ videoUrl: 'https://v', audioUrl: 'https://a' }), 'video', 'video precedes audio');
  equal(resolveMediaKind({ audioUrl: 'https://a' }), 'audio', 'audio is recognised');
  equal(resolveMediaKind({}), 'unknown', 'an empty bag is unknown');
  equal(resolveMediaKind(null), 'unknown', 'a null bag is unknown, not a crash');
  equal(resolveMediaKind(undefined), 'unknown', 'an undefined bag is unknown');
});
