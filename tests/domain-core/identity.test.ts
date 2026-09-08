import { check, equal, suite, throws } from './harness';
import {
  assertNoDuplicateIds,
  assertUsableId,
  findDuplicateId,
  isUsableId,
  isUuid,
} from '../../src/domain/core/identity';
import { DomainInvariantError, isDomainInvariantError } from '../../src/domain/core/errors';

export default suite('identity — one definition of an identifier', () => {
  // ---- strict rule (generated ids) ---------------------------------------
  check(isUuid('3f2a1c4e-5b6d-4a7f-8c9b-0d1e2f3a4b5c'), 'a lowercase v4 uuid is valid');
  check(isUuid('3F2A1C4E-5B6D-4A7F-8C9B-0D1E2F3A4B5C'), 'case does not matter');
  check(isUuid('00000000-0000-1000-8000-000000000000'), 'a v1 uuid is accepted (the rule covers v1–v5)');
  check(!isUuid('3f2a1c4e5b6d4a7f8c9b0d1e2f3a4b5c'), 'missing dashes are rejected');
  check(!isUuid('3f2a1c4e-5b6d-6a7f-8c9b-0d1e2f3a4b5c'), 'an impossible version nibble is rejected');
  check(!isUuid(''), 'an empty string is not a uuid');
  check(!isUuid(42), 'a number is not a uuid');
  check(!isUuid(null), 'null is not a uuid');

  // ---- permissive rule (everything else the app addresses today) ---------
  check(isUsableId('track_text_captions'), 'readable ids are usable (permissive rule)');
  check(isUsableId('t1'), 'short ids are usable');
  check(isUsableId('3f2a1c4e-5b6d-4a7f-8c9b-0d1e2f3a4b5c'), 'a uuid is also usable');
  check(!isUsableId(''), 'an empty string is not usable');
  check(!isUsableId('   '), 'a blank string is not usable');
  check(!isUsableId(7), 'a number is not usable');
  check(!isUsableId(undefined), 'undefined is not usable');

  // ---- boundary validation -----------------------------------------------
  equal(assertUsableId('clip-1'), 'clip-1', 'a valid id passes through');
  equal(assertUsableId('clip-1', 'clip.id'), 'clip-1', 'a named field passes through');
  throws(() => assertUsableId(''), 'an empty id throws');
  throws(() => assertUsableId(null), 'a null id throws');
  throws(() => assertUsableId(12), 'a numeric id throws');

  // The error surface is uniform: callers can catch one type, not parse strings.
  let captured: unknown;
  try {
    assertUsableId(null, 'clip.id');
  } catch (error) {
    captured = error;
  }
  check(captured instanceof DomainInvariantError, 'an identity violation is a DomainInvariantError');
  check(isDomainInvariantError(captured), 'isDomainInvariantError recognises it');
  equal(
    isDomainInvariantError(captured) ? captured.code : null,
    'DOMAIN_EMPTY_ID',
    'the error carries the DOMAIN_EMPTY_ID code',
  );
  equal(
    isDomainInvariantError(captured) ? captured.field : null,
    'clip.id',
    'the error names the offending field',
  );

  // ---- duplicate ids ------------------------------------------------------
  equal(findDuplicateId([{ id: 'a' }, { id: 'b' }]), null, 'unique ids yield null');
  equal(findDuplicateId([]), null, 'an empty set yields null');
  equal(findDuplicateId([{ id: 'a' }, { id: 'b' }, { id: 'a' }]), 'a', 'the duplicate id is returned');
  equal(
    findDuplicateId([{ id: 'b' }, { id: 'a' }, { id: 'a' }, { id: 'b' }]),
    'a',
    'the first repeat encountered while scanning is returned (deterministic, not set-order dependent)',
  );
  equal(
    findDuplicateId([{ id: 1 as unknown as string }, { id: 1 as unknown as string }]),
    null,
    'non-string ids are skipped rather than compared',
  );

  assertNoDuplicateIds([{ id: 'a' }, { id: 'b' }]);
  throws(
    () => assertNoDuplicateIds([{ id: 'a' }, { id: 'a' }]),
    'a duplicate id is rejected at the boundary',
  );
  let duplicateError: unknown;
  try {
    assertNoDuplicateIds([{ id: 'x' }, { id: 'x' }], 'tracks');
  } catch (error) {
    duplicateError = error;
  }
  equal(
    isDomainInvariantError(duplicateError) ? duplicateError.code : null,
    'DOMAIN_DUPLICATE_ID',
    'the duplicate error carries the DOMAIN_DUPLICATE_ID code',
  );
});
