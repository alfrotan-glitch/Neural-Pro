import { check, equal, suite, throws } from './harness';
import {
  assertFinite,
  assertInRange,
  assertNonNegative,
  assertPlainObject,
  assertPositive,
  isFiniteNumber,
  isPlainObject,
} from '../../src/domain/core/validation';
import { DomainInvariantError, isDomainInvariantError } from '../../src/domain/core/errors';
import { assertFps } from '../../src/domain/core/fps';
import { assertInterval } from '../../src/domain/core/time';
import { assertSize } from '../../src/domain/core/geometry';
import { assertTransform, IDENTITY_TRANSFORM } from '../../src/domain/core/transform';

export default suite('validation — atomic predicates and one error surface', () => {
  // ---- isFiniteNumber ----------------------------------------------------
  check(isFiniteNumber(0) && isFiniteNumber(-1.5), 'finite numbers are accepted');
  check(!isFiniteNumber(Number.NaN), 'NaN is rejected');
  check(!isFiniteNumber(Number.POSITIVE_INFINITY), 'Infinity is rejected');
  check(!isFiniteNumber(Number.NEGATIVE_INFINITY), '-Infinity is rejected');
  check(!isFiniteNumber('1'), 'a numeric string is rejected (no coercion)');
  check(!isFiniteNumber(null), 'null is rejected');
  check(!isFiniteNumber(undefined), 'undefined is rejected');

  // ---- assertFinite ------------------------------------------------------
  equal(assertFinite(3.5), 3.5, 'a finite number passes through');
  equal(assertFinite(0), 0, 'zero is finite');
  throws(() => assertFinite(Number.NaN), 'NaN is rejected');
  throws(() => assertFinite(Number.POSITIVE_INFINITY), 'Infinity is rejected');
  throws(() => assertFinite('3'), 'a string is rejected');

  // ---- assertNonNegative / assertPositive --------------------------------
  equal(assertNonNegative(0), 0, 'zero is non-negative');
  equal(assertNonNegative(5), 5, 'a positive number is non-negative');
  throws(() => assertNonNegative(-0.0001), 'a negative number is rejected');
  equal(assertPositive(0.5), 0.5, 'a positive number passes through');
  throws(() => assertPositive(0), 'zero is not positive');
  throws(() => assertPositive(-1), 'a negative number is not positive');

  // ---- assertInRange -----------------------------------------------------
  equal(assertInRange(50, 0, 100), 50, 'a value inside the range passes through');
  equal(assertInRange(0, 0, 100), 0, 'the lower bound is inclusive');
  equal(assertInRange(100, 0, 100), 100, 'the upper bound is inclusive');
  throws(() => assertInRange(-1, 0, 100), 'below the range is rejected');
  throws(() => assertInRange(101, 0, 100), 'above the range is rejected');

  // ---- plain objects -----------------------------------------------------
  check(isPlainObject({}), 'an empty object is plain');
  check(isPlainObject({ a: 1 }), 'a populated object is plain');
  check(!isPlainObject([]), 'an array is not a plain object');
  check(!isPlainObject(null), 'null is not a plain object');
  check(!isPlainObject(5), 'a number is not a plain object');
  check(!isPlainObject(() => undefined), 'a function is not a plain object');
  equal(assertPlainObject({ a: 1 }).a, 1, 'a plain object passes through');
  throws(() => assertPlainObject([]), 'an array is rejected at the boundary');
  throws(() => assertPlainObject(null), 'null is rejected at the boundary');

  // ---- one error surface for the whole kernel ----------------------------
  // Every kernel validator throws the SAME type, so a caller writes one catch
  // and dispatches on `code` instead of string-matching messages.
  const violations: readonly (() => unknown)[] = [
    () => assertFinite(Number.NaN),
    () => assertNonNegative(-1),
    () => assertPositive(0),
    () => assertInRange(5, 0, 1),
    () => assertPlainObject(null),
    () => assertFps(0),
    () => assertInterval({ start: 5, end: 1 }),
    () => assertSize({ width: -1, height: 10 }),
    () => assertTransform({ ...IDENTITY_TRANSFORM, opacity: 101 }),
  ];

  const codes = new Set<string>();
  for (const violation of violations) {
    let error: unknown;
    try {
      violation();
    } catch (caught) {
      error = caught;
    }
    check(error instanceof DomainInvariantError, 'a kernel violation throws DomainInvariantError');
    check(isDomainInvariantError(error), 'isDomainInvariantError recognises it');
    if (isDomainInvariantError(error)) {
      codes.add(error.code);
      check(error.field.length > 0, `${error.code} names a field`);
      check(error.message.includes(error.code), `${error.code} appears in the message`);
      check(error.name === 'DomainInvariantError', 'the error name is stable');
    }
  }

  equal(codes.size, violations.length, `every violation carries a distinct code (${[...codes].join(', ')})`);
  check(codes.has('DOMAIN_INVALID_FPS'), 'the fps code is part of the surface');
  check(codes.has('DOMAIN_INVALID_INTERVAL'), 'the interval code is part of the surface');
  check(codes.has('DOMAIN_INVALID_SIZE'), 'the size code is part of the surface');
  check(codes.has('DOMAIN_INVALID_TRANSFORM'), 'the transform code is part of the surface');

  // A non-domain error must not be mistaken for a domain violation.
  check(!isDomainInvariantError(new Error('boom')), 'a plain Error is not a domain violation');
  check(!isDomainInvariantError('DOMAIN_INVALID_FPS'), 'a string that looks like a code is not a violation');
});
