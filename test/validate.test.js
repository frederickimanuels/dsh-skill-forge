import assert from 'node:assert/strict';
import test from 'node:test';
import { RESERVED_PROVIDER, checkLoadable, checkPublishable, validate } from '../src/validate.js';

const GOOD = {
  name: 'good-skill',
  description: 'A valid skill.',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'flat-skill:skills/good.md',
  provider: 'skill-forge',
  rank: 620,
  content: 'Instructions.',
};

test('a well-formed candidate produces no violations', () => {
  assert.deepEqual(validate(GOOD, 'skill-forge'), []);
  assert.deepEqual(checkPublishable(GOOD, 'skill-forge'), { ok: true });
  assert.deepEqual(checkLoadable(GOOD, 'skill-forge'), { ok: true });
});

test('the runtime provider name is the one the harness reserves', () => {
  assert.equal(RESERVED_PROVIDER, 'runtime');
});

test('names must be kebab-case and bounded', () => {
  assert.match(validate({ ...GOOD, name: 'Not A Name' }, 'skill-forge')[0], /kebab-case/);
  assert.match(validate({ ...GOOD, name: 'a'.repeat(65) }, 'skill-forge')[0], /exceeds 64 characters/);
  assert.match(validate({ ...GOOD, name: 7 }, 'skill-forge')[0], /name is not a string/);
  assert.deepEqual(validate({ ...GOOD, name: 'ok-1' }, 'skill-forge'), []);
});

test('a description is mandatory and must not be blank', () => {
  assert.deepEqual(validate({ ...GOOD, description: '   ' }, 'skill-forge'), ['description is empty']);
  assert.match(validate({ ...GOOD, description: undefined }, 'skill-forge')[0], /description is not a string/);
});

test('invocation must carry both booleans', () => {
  assert.match(validate({ ...GOOD, invocation: { modelInvocable: true } }, 'skill-forge')[0], /invocation must be/);
  assert.match(validate({ ...GOOD, invocation: undefined }, 'skill-forge')[0], /invocation must be/);
});

test('the provider name must match the registration', () => {
  assert.match(validate({ ...GOOD, provider: 'someone-else' }, 'skill-forge')[0], /does not match/);
});

test('rank must be a finite number', () => {
  assert.match(validate({ ...GOOD, rank: Number.NaN }, 'skill-forge')[0], /finite number/);
  assert.match(validate({ ...GOOD, rank: '620' }, 'skill-forge')[0], /finite number/);
});

test('content is only required for a definition', () => {
  const withoutContent = { ...GOOD, content: undefined };
  assert.deepEqual(validate(withoutContent, 'skill-forge'), []);
  assert.match(validate(withoutContent, 'skill-forge', { requireContent: true })[0], /content is not a string/);
  assert.match(checkLoadable({ ...GOOD, content: '  ' }, 'skill-forge').violations[0], /content is empty/);
});

test('a non-object definition is rejected without throwing', () => {
  assert.deepEqual(validate(undefined, 'skill-forge'), ['definition is not an object']);
  assert.deepEqual(validate(null, 'skill-forge'), ['definition is not an object']);
});

test('every violation is reported at once', () => {
  const violations = validate({ name: 'BAD', description: '', rank: 'x', provider: 'other' }, 'skill-forge');
  assert.equal(violations.length >= 5, true, JSON.stringify(violations));
});
