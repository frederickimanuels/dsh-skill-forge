import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { DIALECT } from '../src/dialects.js';
import { DEFAULT_EXCLUDES, discoverSkills, resolveRoot, scanRoot } from '../src/discover.js';
import { DIALECT_FILES, fixture } from './helpers.js';

test('scanRoot finds every supported dialect and nothing else', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const result = await scanRoot(root, { depth: 4 });
    const found = Object.fromEntries(result.skills.map((skill) => [skill.relativeFile, skill.dialect]));

    assert.equal(result.error, undefined);
    assert.equal(result.truncated, false);
    assert.deepEqual(found, {
      '.agents/skills/deploy/SKILL.md': DIALECT.agentSkills,
      '.claude/commands/release.md': DIALECT.claudeCommand,
      '.claude/skills/pdf-tools/SKILL.md': DIALECT.claudeCode,
      '.cursor/rules/always.mdc': DIALECT.cursorRule,
      '.cursor/rules/style.mdc': DIALECT.cursorRule,
      '.cursorrules': DIALECT.cursorLegacy,
      'AGENTS.md': DIALECT.repoInstructions,
      'CLAUDE.md': DIALECT.repoInstructions,
      'docs/plan.md': DIALECT.flatSkill,
    });
  } finally {
    await cleanup();
  }
});

test('scanRoot treats a bundle as one skill and never descends into it', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const result = await scanRoot(path.join(root, '.claude/skills'), { depth: 4 });
    assert.deepEqual(result.skills.map((skill) => skill.relativeFile), [path.join('pdf-tools', 'SKILL.md')]);
  } finally {
    await cleanup();
  }
});

test('scanRoot skips repository boilerplate and prose Markdown', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const result = await scanRoot(root, { depth: 4 });
    const names = result.skills.map((skill) => skill.relativeFile);
    assert.equal(names.includes('README.md'), false);
    assert.equal(names.includes(path.join('docs', 'guide.md')), false);
  } finally {
    await cleanup();
  }
});

test('scanRoot admits loose Markdown only when asked', async () => {
  const { root, cleanup } = await fixture({ 'notes/ideas.md': '# Ideas\n\nNot frontmatter, not a known name.\n' });
  try {
    assert.deepEqual((await scanRoot(root, { depth: 3 })).skills, []);
    const loose = await scanRoot(root, { depth: 3, includeLoose: true });
    assert.equal(loose.skills.length, 1);
    assert.equal(loose.skills[0].dialect, DIALECT.looseMarkdown);
  } finally {
    await cleanup();
  }
});

test('scanRoot honours excludes and the file cap', async () => {
  const files = {
    'node_modules/pkg/SKILL.md': '---\nname: ghost\ndescription: Should not appear.\n---\nbody\n',
    'a/one.md': '---\nname: one\ndescription: First.\n---\nbody\n',
    'b/two.md': '---\nname: two\ndescription: Second.\n---\nbody\n',
  };
  const { root, cleanup } = await fixture(files);
  try {
    const excluded = await scanRoot(root, { depth: 4 });
    assert.deepEqual(excluded.skills.map((skill) => skill.relativeFile), ['a/one.md', 'b/two.md']);

    const capped = await scanRoot(root, { depth: 4, maxFiles: 1 });
    assert.equal(capped.skills.length, 1);
    assert.equal(capped.truncated, true);

    const custom = await scanRoot(root, { depth: 4, exclude: ['a'] });
    assert.deepEqual(custom.skills.map((skill) => skill.relativeFile), ['b/two.md']);
  } finally {
    await cleanup();
  }
});

test('scanRoot reports a missing root instead of throwing', async () => {
  const result = await scanRoot('/definitely/not/here', { depth: 2 });
  assert.deepEqual(result.skills, []);
  assert.match(result.error, /does not exist/);
});

test('scanRoot reads a single file root', async () => {
  const { root, cleanup } = await fixture({ 'skill.md': '---\nname: single\ndescription: One file.\n---\nbody\n' });
  try {
    const result = await scanRoot(path.join(root, 'skill.md'), { depth: 2 });
    assert.equal(result.skills.length, 1);
    assert.equal(result.skills[0].frontmatter.name, 'single');
  } finally {
    await cleanup();
  }
});

test('scanRoot survives a symlink loop', async () => {
  const { root, cleanup } = await fixture({ 'real/SKILL.md': '---\nname: real\ndescription: Real skill.\n---\nbody\n' });
  const { symlink } = await import('node:fs/promises');
  try {
    await symlink(path.join(root, 'real'), path.join(root, 'real', 'loop'));
    const result = await scanRoot(root, { depth: 6 });
    assert.equal(result.skills.length >= 1, true);
  } finally {
    await cleanup();
  }
});

test('resolveRoot expands ~ and resolves relative paths', () => {
  const cwd = '/tmp/work';
  assert.equal(resolveRoot('~', cwd), path.join(process.env.HOME ?? '/root'));
  assert.match(resolveRoot('~/skills', cwd), /skills$/);
  assert.equal(resolveRoot('sub/dir', cwd), path.join(cwd, 'sub', 'dir'));
  assert.equal(resolveRoot('/abs/dir', cwd), path.join('/', 'abs', 'dir'));
  assert.equal(resolveRoot('', cwd), cwd);
});

test('discoverSkills reports per-root counts and deduplicates roots', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const result = await discoverSkills({
      roots: [root, root, path.join(root, 'missing')],
      cwd: root,
      depth: 4,
    });
    assert.equal(result.roots.length, 2);
    assert.equal(result.roots[0].count, 9);
    assert.match(result.roots[1].error, /does not exist/);
    assert.equal(result.skills.length, 9);
  } finally {
    await cleanup();
  }
});

test('DEFAULT_EXCLUDES covers the dependency directories', () => {
  assert.equal(DEFAULT_EXCLUDES.includes('node_modules'), true);
  assert.equal(DEFAULT_EXCLUDES.includes('.git'), true);
});
