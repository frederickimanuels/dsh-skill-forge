import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYaml, splitFrontmatter } from '../src/frontmatter.js';

test('splitFrontmatter returns body untouched when there is no fence', () => {
  const result = splitFrontmatter('# Title\n\nBody text.\n');
  assert.equal(result.raw, undefined);
  assert.equal(result.body, '# Title\n\nBody text.\n');
  assert.deepEqual(result.data, {});
  assert.equal(result.error, undefined);
});

test('splitFrontmatter separates a normal fence', () => {
  const result = splitFrontmatter('---\nname: demo\ndescription: A demo skill.\n---\n\n# Demo\n');
  assert.deepEqual(result.data, { name: 'demo', description: 'A demo skill.' });
  assert.equal(result.body.trim(), '# Demo');
  assert.equal(result.error, undefined);
});

test('splitFrontmatter reports an unterminated fence but keeps the text', () => {
  const result = splitFrontmatter('---\nname: broken\n\n# Body\n');
  assert.equal(result.error, 'unterminated frontmatter');
  assert.match(result.body, /# Body/);
});

test('splitFrontmatter accepts a leading BOM and trailing whitespace on the fence', () => {
  const result = splitFrontmatter('\uFEFF---  \nname: demo\n---\t\nbody\n');
  assert.equal(result.data.name, 'demo');
  assert.equal(result.body.trim(), 'body');
});

test('parseYaml reads nested mappings, lists and block scalars', () => {
  const data = parseYaml([
    'name: demo',
    'metadata:',
    '  owner: platform',
    '  version: "2.0"',
    'tags:',
    '  - alpha',
    '  - beta',
    'summary: |',
    '  first line',
    '  second line',
    'folded: >-',
    '  one',
    '  two',
    'flow: [a, b, c]',
  ].join('\n'));
  assert.equal(data.name, 'demo');
  assert.deepEqual(data.metadata, { owner: 'platform', version: '2.0' });
  assert.deepEqual(data.tags, ['alpha', 'beta']);
  assert.equal(data.summary, 'first line\nsecond line\n');
  assert.equal(data.folded, 'one two');
  assert.deepEqual(data.flow, ['a', 'b', 'c']);
});

test('parseYaml coerces scalars but leaves unknown forms as text', () => {
  const data = parseYaml('enabled: true\ncount: 3\nratio: 1.5\nempty: null\nquoted: "42"\nweird: 2024-01-02\n');
  assert.equal(data.enabled, true);
  assert.equal(data.count, 3);
  assert.equal(data.ratio, 1.5);
  assert.equal(data.empty, null);
  assert.equal(data.quoted, '42');
  assert.equal(data.weird, '2024-01-02');
});

test('parseYaml handles comments, quoted escapes and flow mappings', () => {
  const data = parseYaml('# leading comment\ntitle: "A \"quoted\" name" # trailing\nopts: { a: 1, b: two }\n');
  assert.equal(data.title, 'A "quoted" name');
  assert.deepEqual(data.opts, { a: 1, b: 'two' });
});

test('parseYaml keeps an odd value as a string rather than failing the file', () => {
  const data = parseYaml('key: [unclosed\nother: fine\n');
  assert.ok(typeof data.key === 'string' || data.key === undefined);
  assert.equal(data.other, 'fine');
});
