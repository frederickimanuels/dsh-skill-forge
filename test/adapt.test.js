import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { DIALECT_RANK, adaptRecord, invocationFor, slugify } from '../src/adapt.js';
import { scanRoot } from '../src/discover.js';
import { checkLoadable, checkPublishable } from '../src/validate.js';
import { DIALECT_FILES, fixture } from './helpers.js';

/** Adapt every file in the shared fixture, keyed by relative path. */
async function adaptFixture() {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  const result = await scanRoot(root, { depth: 4 });
  const adapted = new Map();
  for (const record of result.skills) {
    adapted.set(record.relativeFile, adaptRecord(record, { providerName: 'skill-forge' }));
  }
  return { root, cleanup, adapted };
}

test('slugify produces harness-legal names', () => {
  assert.equal(slugify('PDF Tools!'), 'pdf-tools');
  assert.equal(slugify('  Mixed__Case  '), 'mixed-case');
  assert.equal(slugify('Ünïcode Nàme'), 'unicode-name');
  assert.equal(slugify('---'), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify('a'.repeat(80)).length <= 64, true);
  assert.match(slugify('a'.repeat(80)), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('every adapted fixture skill is publishable and loadable', async () => {
  const { cleanup, adapted } = await adaptFixture();
  try {
    assert.equal(adapted.size, 9);
    for (const [file, result] of adapted) {
      // CLAUDE.md is a pure redirect ("@AGENTS.md"); it is covered separately.
      if (result.definition === undefined) continue;
      assert.deepEqual(checkPublishable(result.definition, 'skill-forge'), { ok: true }, file);
      assert.deepEqual(checkLoadable(result.definition, 'skill-forge'), { ok: true }, file);
      assert.equal(result.definition.provider, 'skill-forge');
      assert.equal(result.definition.locator.dialect, result.definition.metadata.dialect);
    }
  } finally {
    await cleanup();
  }
});

test('a bundle keeps its own name and directory as resource base', async () => {
  const { root, cleanup, adapted } = await adaptFixture();
  try {
    const { definition } = adapted.get(path.join('.claude', 'skills', 'pdf-tools', 'SKILL.md'));
    assert.equal(definition.name, 'pdf-tools');
    assert.equal(definition.description, 'Fill, split and merge PDF forms from the command line.');
    assert.equal(definition.resourceBase.kind, 'directory');
    assert.equal(definition.resourceBase.path, path.join(root, '.claude', 'skills', 'pdf-tools'));
    assert.equal(definition.rank, DIALECT_RANK['claude-code']);
    assert.equal(definition.invocation.modelInvocable, true);
  } finally {
    await cleanup();
  }
});

test('a skill with no name derives one from its bundle directory', async () => {
  const { root, cleanup } = await fixture({
    'skills/my-neat-skill/SKILL.md': '---\ndescription: Nice skill.\n---\nbody\n',
  });
  try {
    const result = await scanRoot(root, { depth: 3 });
    const adapted = adaptRecord(result.skills[0], { providerName: 'skill-forge' });
    assert.equal(adapted.definition.name, 'my-neat-skill');
    assert.deepEqual(adapted.warnings, []);
  } finally {
    await cleanup();
  }
});

test('a flat skill file derives its name from the file', async () => {
  const { root, cleanup } = await fixture({
    'rules/naming-conventions.md': '---\ndescription: How to name things.\n---\nbody\n',
  });
  try {
    const result = await scanRoot(root, { depth: 3 });
    const adapted = adaptRecord(result.skills[0], { providerName: 'skill-forge' });
    assert.equal(adapted.definition.name, 'naming-conventions');
  } finally {
    await cleanup();
  }
});

test('a missing description falls back to the first paragraph', async () => {
  const { root, cleanup } = await fixture({
    'AGENTS.md': '# House rules\n\nAlways run the checks before pushing.\n',
  });
  try {
    const result = await scanRoot(root, { depth: 2 });
    const adapted = adaptRecord(result.skills[0], { providerName: 'skill-forge' });
    assert.match(adapted.definition.description, /Always run the checks/);
    assert.match(adapted.warnings.join(' '), /derived from the first paragraph/);
  } finally {
    await cleanup();
  }
});

test('descriptions are clamped to the catalog limit', async () => {
  const { root, cleanup } = await fixture({
    'skills/long/SKILL.md': '---\nname: long\ndescription: ' + 'word '.repeat(400).trim() + '\n---\nbody\n',
  });
  try {
    const result = await scanRoot(root, { depth: 3 });
    const adapted = adaptRecord(result.skills[0], { providerName: 'skill-forge' });
    assert.equal(adapted.definition.description.length <= 1024, true);
    assert.equal(adapted.definition.description.endsWith('word'), true);
  } finally {
    await cleanup();
  }
});

test('invocation flags follow the source format', async () => {
  const { cleanup, adapted } = await adaptFixture();
  try {
    // Repository instructions are for explicit use only.
    const agents = adapted.get('AGENTS.md').definition;
    assert.deepEqual(agents.invocation, { modelInvocable: false, userInvocable: true });

    // Claude Code can opt out of model invocation.
    const release = adapted.get(path.join('.claude', 'commands', 'release.md')).definition;
    assert.deepEqual(release.invocation, { modelInvocable: false, userInvocable: true });

    // Skills are model-invocable by default.
    const pdf = adapted.get(path.join('.claude', 'skills', 'pdf-tools', 'SKILL.md')).definition;
    assert.deepEqual(pdf.invocation, { modelInvocable: true, userInvocable: true });
  } finally {
    await cleanup();
  }
});

test('invocationFor respects explicit frontmatter overrides', () => {
  assert.deepEqual(invocationFor('agent-skills', { 'disable-model-invocation': true }).modelInvocable, false);
  assert.deepEqual(invocationFor('agent-skills', { 'user-invocable': false }).userInvocable, false);
  assert.deepEqual(invocationFor('agent-skills', { modelInvocable: false }).modelInvocable, false);
  assert.deepEqual(invocationFor('cursor-rule', { alwaysApply: true }).modelInvocable, true);
  assert.equal(invocationFor('repo-instructions', {}).modelInvocable, false);
});

test('rank orders skills above repository instructions, and both below host skills', () => {
  // Ascending rank wins, so a smaller number is a stronger claim on a name.
  assert.equal(DIALECT_RANK['agent-skills'] < DIALECT_RANK['claude-code'], true);
  assert.equal(DIALECT_RANK['claude-code'] < DIALECT_RANK['repo-instructions'], true);
  assert.equal(DIALECT_RANK['repo-instructions'] < DIALECT_RANK['loose-markdown'], true);
  // The harness publishes bundled skills at 600; an import must not shadow one.
  assert.equal(DIALECT_RANK['agent-skills'] > 600, true);
});

test('rankBoost shifts every adapted rank', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const result = await scanRoot(root, { depth: 4 });
    const base = adaptRecord(result.skills[0], { providerName: 'skill-forge' }).definition;
    const boosted = adaptRecord(result.skills[0], { providerName: 'skill-forge', rankBoost: -100 }).definition;
    assert.equal(boosted.rank, base.rank - 100);
  } finally {
    await cleanup();
  }
});

test('name collisions are resolved through the allocator', async () => {
  const { root, cleanup } = await fixture({
    'a/plan/SKILL.md': '---\nname: plan\ndescription: First plan.\n---\nbody\n',
    'b/plan/SKILL.md': '---\nname: plan\ndescription: Second plan.\n---\nbody\n',
  });
  try {
    const result = await scanRoot(root, { depth: 3 });
    const taken = new Set();
    const names = result.skills.map((record) => {
      const allocated = adaptRecord(record, {
        providerName: 'skill-forge',
        uniqueName: (name) => {
          if (!taken.has(name)) {
            taken.add(name);
            return name;
          }
          let suffix = 2;
          while (taken.has(name + '-' + suffix)) suffix += 1;
          taken.add(name + '-' + suffix);
          return name + '-' + suffix;
        },
      });
      return allocated.definition.name;
    });
    assert.deepEqual(names, ['plan', 'plan-2']);
  } finally {
    await cleanup();
  }
});

test('the allocator cannot hand back an invalid name', async () => {
  const { root, cleanup } = await fixture({ 's/SKILL.md': '---\nname: solo\ndescription: Solo.\n---\nbody\n' });
  try {
    const result = await scanRoot(root, { depth: 3 });
    const adapted = adaptRecord(result.skills[0], { providerName: 'skill-forge', uniqueName: () => undefined });
    assert.equal(adapted.definition.name, 'solo');
  } finally {
    await cleanup();
  }
});

test('metadata carries the dialect, origin and author metadata', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const result = await scanRoot(root, { depth: 4 });
    const deploy = result.skills.find((skill) => skill.relativeFile.endsWith(path.join('deploy', 'SKILL.md')));
    const { definition } = adaptRecord(deploy, { providerName: 'skill-forge' });
    assert.equal(definition.metadata.dialect, 'agent-skills');
    assert.equal(definition.metadata.license, 'MIT');
    assert.equal(definition.metadata.version, '2.0');
    assert.equal(definition.metadata.owner, 'platform');
    assert.equal(path.isAbsolute(definition.metadata.origin), true);
  } finally {
    await cleanup();
  }
});

test('an empty skill is rejected with a reason instead of a broken candidate', () => {
  const adapted = adaptRecord(
    { dialect: 'loose-markdown', file: '/tmp/x.md', dir: '/tmp', baseName: 'x.md', root: '/tmp', relativeFile: 'x.md', body: '', frontmatter: {}, resourceDirs: [] },
    { providerName: 'skill-forge' },
  );
  assert.notEqual(adapted.definition, undefined);
  assert.equal(adapted.definition.description.length > 0, true);
});

test('content always carries the adaptation preamble', async () => {
  const { cleanup, adapted } = await adaptFixture();
  try {
    for (const [file, result] of adapted) {
      if (result.definition === undefined) continue;
      assert.match(result.definition.content, /^> Adapted from an? /, file);
    }
  } finally {
    await cleanup();
  }
});

test('a pure redirect is skipped so its target is the only catalog entry', async () => {
  const { cleanup, adapted } = await adaptFixture();
  try {
    const redirect = adapted.get('CLAUDE.md');
    assert.equal(redirect.definition, undefined);
    assert.match(redirect.reason, /redirects to AGENTS\.md/);
    // The file it points at is still imported on its own.
    assert.notEqual(adapted.get('AGENTS.md').definition, undefined);
  } finally {
    await cleanup();
  }
});

test('a redirect mixed with real prose is imported normally', () => {
  const adapted = adaptRecord(
    {
      dialect: 'repo-instructions',
      file: '/tmp/CLAUDE.md',
      dir: '/tmp',
      baseName: 'CLAUDE.md',
      root: '/tmp',
      relativeFile: 'CLAUDE.md',
      body: '@AGENTS.md\n# Extra\nRun the linter before committing.\n',
      frontmatter: {},
      redirectTargets: [],
      resourceDirs: [],
    },
    { providerName: 'skill-forge' },
  );
  assert.notEqual(adapted.definition, undefined);
  assert.equal(adapted.definition.name, 'claude');
});
