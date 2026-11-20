import assert from 'node:assert/strict';
import test from 'node:test';
import { describeToolGrants, mapTool, renderPreamble, rewriteBody, splitToolList, summarizeBody } from '../src/rewrite.js';

test('mapTool translates Claude tool names and keeps the argument pattern', () => {
  assert.deepEqual(mapTool('Bash(git:*)').dsh, 'bash');
  assert.equal(mapTool('Bash(git:*)').pattern, 'git:*');
  assert.equal(mapTool('Read').dsh, 'read');
  assert.equal(mapTool('WebFetch').dsh, 'web_fetch');
  assert.equal(mapTool('Task').dsh, 'subagent');
  assert.equal(mapTool('TodoWrite').dsh, 'todo_write');
  assert.equal(mapTool('MultiEdit').dsh, 'edit');
  assert.equal(mapTool('NotebookEdit').dsh, 'write');
});

test('mapTool reports tools with no harness equivalent', () => {
  const unknown = mapTool('SomeVendorTool');
  assert.equal(unknown.dsh, null);
  assert.equal(unknown.original, 'SomeVendorTool');
  assert.equal(mapTool('').dsh, null);
});

test('splitToolList handles spaces, commas and nested parentheses', () => {
  assert.deepEqual(splitToolList('Bash(git:*) Read Write'), ['Bash(git:*)', 'Read', 'Write']);
  assert.deepEqual(splitToolList('Bash(git:*), Read'), ['Bash(git:*)', 'Read']);
  assert.deepEqual(splitToolList(['Read', 'Write']), ['Read', 'Write']);
  assert.deepEqual(splitToolList(undefined), []);
  assert.deepEqual(splitToolList('  '), []);
});

test('describeToolGrants separates mapped from unmapped grants', () => {
  const grants = describeToolGrants('Bash(pdftk:*) Read VendorMagic');
  assert.deepEqual(grants.granted, ['Bash(pdftk:*)', 'Read', 'VendorMagic']);
  assert.deepEqual(grants.unmapped, ['VendorMagic']);
  assert.equal(grants.mapped.length, 3);
});

test('rewriteBody turns command injection into a run instruction', () => {
  const { body, notes, used } = rewriteBody('First run !`npm test` then continue.');
  assert.match(body, /the output of the command `npm test`/);
  assert.equal(body.includes('!`'), false);
  assert.deepEqual(used.bash, ['npm test']);
  assert.match(notes.join(' '), /command injection/);
});

test('rewriteBody turns @file references into readable prose', () => {
  const { body, notes, used } = rewriteBody('Read @src/index.js before editing.');
  assert.equal(body.includes('@src/index.js'), false);
  assert.match(body, /the file `src\/index\.js`/);
  assert.deepEqual(used.files, ['src/index.js']);
  assert.match(notes.join(' '), /file references/);
});

test('rewriteBody leaves email addresses and lone at-signs alone', () => {
  const source = 'Mail dev@example.com or mention @here.';
  assert.equal(rewriteBody(source).body, source);
});

test('rewriteBody replaces argument placeholders', () => {
  for (const token of ['$ARGUMENTS', '$1', '{{args}}', '$ARGUMENTS']) {
    const { body, used } = rewriteBody('Handle: ' + token);
    assert.equal(body, "Handle: the user's request", token);
    assert.equal(used.arguments, true, token);
  }
});

test('rewriteBody preserves a body with nothing to rewrite', () => {
  const source = '# Title\n\nPlain instructions.\n';
  const result = rewriteBody(source);
  assert.equal(result.body, source);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.used, { arguments: false, bash: [], files: [] });
});

test('rewriteBody tolerates non-string input', () => {
  assert.equal(rewriteBody(undefined).body, '');
});

test('renderPreamble names the origin, tools and resources', () => {
  const preamble = renderPreamble({
    dialect: 'claude-code',
    originPath: '/repo/.claude/skills/x/SKILL.md',
    grants: describeToolGrants('Bash(npm:*) Read VendorMagic'),
    resources: ['references/ (2 files)', 'scripts/ (1 file)'],
    notes: ['file references rewritten to read instructions (1)'],
  });
  assert.match(preamble, /^> Adapted from a claude-code skill by dsh-skill-forge\./);
  assert.match(preamble, /Original instruction file: `\/repo/);
  // A grant whose harness name matches the original is listed once, with no
  // redundant "Read -> Read tool" arrow, and its pattern is not printed twice.
  assert.match(preamble, /Bash\(npm:\*\) -> Bash tool/);
  assert.doesNotMatch(preamble, /npm:\*\) \(npm:\*\)/);
  assert.doesNotMatch(preamble, /Read -> Read tool/);
  assert.match(preamble, /Read/);
  assert.match(preamble, /no harness equivalent.*VendorMagic/);
  assert.match(preamble, /references\/ \(2 files\)/);
  assert.match(preamble, /Adaptation applied: file references/);
  assert.equal(preamble.endsWith('\n\n'), false);
});

test('renderPreamble is minimal when there is nothing to say', () => {
  const preamble = renderPreamble({ dialect: 'flat-skill' });
  assert.equal(preamble, '> Adapted from a flat-skill skill by dsh-skill-forge.\n');
});

test('summarizeBody skips headings and boilerplate to find prose', () => {
  assert.equal(summarizeBody('# Title\n\nThe real summary.\n'), 'The real summary.');
  assert.equal(summarizeBody('<!-- hidden -->\n\n> quoted\n\nActual text\n'), 'Actual text');
  assert.equal(summarizeBody('# Only A Title\n'), '');
  assert.equal(summarizeBody(''), '');
});

test('summarizeBody flattens Markdown syntax', () => {
  const summary = summarizeBody('Use **bold** and `code` with a [link](https://example.com).');
  assert.equal(summary, 'Use bold and code with a link.');
});

test('summarizeBody truncates on a word boundary', () => {
  const summary = summarizeBody('word '.repeat(100), 40);
  assert.equal(summary.length <= 41, true);
  assert.equal(summary.endsWith('…'), true);
});
