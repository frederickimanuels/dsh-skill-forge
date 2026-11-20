import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fixture } from './helpers.js';

const execFileAsync = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, '..', 'bin', 'forge.js');

/** Run the CLI and capture both streams. */
async function run(args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

const SKILL = (name, description) => ['---', 'name: ' + name, 'description: ' + description, '---', '', 'Body of ' + name + '.', ''].join('\n');

test('no arguments prints usage and exits with a usage error', async () => {
  const result = await run([]);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /Usage:/);
});

test('--help succeeds', async () => {
  const result = await run(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /dsh-skill-forge scan/);
  assert.match(result.stdout, /--store/);
});

test('an unknown command is a usage error', async () => {
  const result = await run(['frobnicate']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /unknown command: frobnicate/);
});

test('scan lists the skills a directory would contribute', async () => {
  const { root, cleanup } = await fixture({
    'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.'),
    'skills/beta/SKILL.md': SKILL('beta', 'Second skill.'),
    'AGENTS.md': '# Project\n\nRun the tests.\n',
  });
  try {
    const result = await run(['scan', root]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /alpha/);
    assert.match(result.stdout, /beta/);
    assert.match(result.stdout, /3 skills would be published/);
  } finally {
    await cleanup();
  }
});

test('scan carries the invocation flags the real catalog uses', async () => {
  const { root, cleanup } = await fixture({
    'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.'),
    'AGENTS.md': '# Project\n\nRun the tests.\n',
  });
  try {
    const result = await run(['scan', root, '--json']);
    assert.equal(result.code, 0);
    const byName = Object.fromEntries(JSON.parse(result.stdout).map((row) => [row.name, row]));
    // The preview has to agree with the catalog: a skill is model-invocable,
    // repository instructions are not. Hand-building the row dropped these.
    assert.equal(byName.alpha.modelInvocable, true);
    assert.equal(byName.agents.modelInvocable, false);
    assert.equal(byName.agents.userInvocable, true);
  } finally {
    await cleanup();
  }
});

test('scan --json is machine readable', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  try {
    const result = await run(['scan', root, '--json']);
    assert.equal(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(Array.isArray(parsed), true);
    assert.equal(parsed[0].name, 'alpha');
    assert.equal(parsed[0].dialect, 'agent-skills');
    assert.equal(parsed[0].description, 'First skill.');
  } finally {
    await cleanup();
  }
});

test('scan of an empty directory says so', async () => {
  const { root, cleanup } = await fixture({ 'README.md': '# Nothing here\n' });
  try {
    const result = await run(['scan', root]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /No importable skills found/);
  } finally {
    await cleanup();
  }
});

test('import copies a bundle with its resources into the store', async () => {
  const { root, cleanup } = await fixture({
    'repo/skills/alpha/SKILL.md': SKILL('alpha', 'First skill.'),
    'repo/skills/alpha/references/notes.md': '# Notes\n',
  });
  try {
    const store = path.join(root, 'store');
    const result = await run(['import', path.join(root, 'repo'), '--store', store]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /imported alpha/);
    const copied = await readFile(path.join(store, 'alpha', 'SKILL.md'), 'utf8');
    assert.match(copied, /Body of alpha/);
    assert.equal((await stat(path.join(store, 'alpha', 'references', 'notes.md'))).isFile(), true);
  } finally {
    await cleanup();
  }
});

test('import --dry-run writes nothing', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  try {
    const store = path.join(root, 'store');
    const result = await run(['import', path.join(root, 'skills'), '--store', store, '--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Would import into/);
    await assert.rejects(() => stat(store));
  } finally {
    await cleanup();
  }
});

test('import refuses to overwrite without --force', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  try {
    const store = path.join(root, 'store');
    await run(['import', path.join(root, 'skills'), '--store', store]);
    const again = await run(['import', path.join(root, 'skills'), '--store', store]);
    assert.equal(again.code, 0);
    assert.match(again.stdout, /already in the store/);
    const forced = await run(['import', path.join(root, 'skills'), '--store', store, '--force']);
    assert.match(forced.stdout, /imported alpha/);
  } finally {
    await cleanup();
  }
});

test('import of a source with no skills is a no-op', async () => {
  const { root, cleanup } = await fixture({ 'README.md': '# Nothing\n' });
  try {
    const result = await run(['import', root, '--store', path.join(root, 'store')]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /No importable skills/);
  } finally {
    await cleanup();
  }
});

test('import without a source explains what it needs', async () => {
  const result = await run(['import']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /needs a source/);
});

test('import of a missing path reports the error', async () => {
  const result = await run(['import', '/definitely/not/here']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /error:/);
});

test('list reports an empty store helpfully', async () => {
  const { root, cleanup } = await fixture({});
  try {
    const result = await run(['list', '--store', path.join(root, 'store')]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /holds no skills yet/);
  } finally {
    await cleanup();
  }
});

test('doctor reports the store and the dialect table', async () => {
  const { root, cleanup } = await fixture({});
  try {
    const result = await run(['doctor', '--store', path.join(root, 'store')]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /skill-forge doctor/);
    assert.match(result.stdout, /agent-skills/);
    assert.match(result.stdout, /does not exist yet/);
  } finally {
    await cleanup();
  }
});
