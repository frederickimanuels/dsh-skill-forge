import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_GLOBS, createSkillForgeProvider } from '../src/provider.js';
import { fixture } from './helpers.js';

/** A provider configured the way the plugin defaults to, but rooted in a fixture. */
function makeProvider(root, overrides = {}, log = []) {
  const config = {
    roots: [],
    autoDiscover: false,
    includeLoose: false,
    depth: 3,
    maxFiles: 500,
    exclude: [],
    deny: [],
    rankBoost: 0,
    includeCommandArgumentHint: true,
    watch: false,
    ...overrides,
  };
  return createSkillForgeProvider({
    config,
    providerName: 'skill-forge',
    logger: { warn: (message) => log.push(message) },
  });
}

const SKILL = (name, description) => ['---', 'name: ' + name, 'description: ' + description, '---', '', 'Body of ' + name + '.', ''].join('\n');

/** Poll a predicate until it holds, so watcher tests do not depend on a fixed sleep. */
async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition was not met within ' + timeoutMs + 'ms');
}

test('PROJECT_GLOBS lists the conventional ecosystem locations', () => {
  for (const entry of ['.claude/skills', '.claude/commands', '.agents/skills', '.cursor/rules', 'AGENTS.md', 'CLAUDE.md']) {
    assert.equal(PROJECT_GLOBS.includes(entry), true, entry);
  }
});

test('list reports adapted candidates and a complete flag', async () => {
  const { root, cleanup } = await fixture({
    'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.'),
    'skills/beta/SKILL.md': SKILL('beta', 'Second skill.'),
  });
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')] });
  try {
    const result = await provider.list({ cwd: root });
    assert.deepEqual(result.candidates.map((candidate) => candidate.name), ['alpha', 'beta']);
    assert.equal(result.complete, true);
    assert.equal(result.candidates[0].provider, 'skill-forge');
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('list caches per working directory until the provider is told to refresh', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')] });
  try {
    const first = await provider.list({ cwd: root });
    assert.equal(first.candidates.length, 1);

    await mkdir(path.join(root, 'skills', 'beta'), { recursive: true });
    await writeFile(path.join(root, 'skills', 'beta', 'SKILL.md'), SKILL('beta', 'Added later.'));

    const cached = await provider.list({ cwd: root });
    assert.equal(cached.candidates.length, 1, 'the scan is cached between collects');

    provider.bind({ signal: new AbortController().signal, invalidate() {} });
    provider.dispose();
  } finally {
    await cleanup();
  }
});

test('get serves the cached definition and re-reads a deleted skill', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  const log = [];
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')] }, log);
  try {
    const { candidates } = await provider.list({ cwd: root });
    const loaded = await provider.get(candidates[0], { cwd: root });
    assert.equal(loaded.name, 'alpha');
    assert.match(loaded.content, /Body of alpha/);

    await rm(path.join(root, 'skills', 'alpha', 'SKILL.md'));
    // Drop the scan cache the way a watcher-driven invalidation would.
    provider.bind({ signal: new AbortController().signal, invalidate() {} });
    const cachedStill = await provider.get(candidates[0], { cwd: root });
    assert.equal(cachedStill.name, 'alpha');

    const fresh = makeProvider(root, { roots: [path.join(root, 'skills')] }, log);
    const missing = await fresh.get(candidates[0], { cwd: root });
    assert.equal(missing, undefined);
    assert.match(log.join(' '), /no longer available/);
    fresh.dispose();
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('get returns undefined for a candidate without a locator file', async () => {
  const provider = makeProvider(process.cwd());
  try {
    assert.equal(await provider.get({ name: 'ghost' }, { cwd: process.cwd() }), undefined);
    assert.equal(await provider.get({ name: 'ghost', locator: { file: 42 } }, { cwd: process.cwd() }), undefined);
  } finally {
    provider.dispose();
  }
});

test('names collide within one provider and are suffixed', async () => {
  const { root, cleanup } = await fixture({
    'one/plan/SKILL.md': SKILL('plan', 'First plan.'),
    'two/plan/SKILL.md': SKILL('plan', 'Second plan.'),
  });
  const provider = makeProvider(root, { roots: [path.join(root, 'one'), path.join(root, 'two')] });
  try {
    const { candidates } = await provider.list({ cwd: root });
    assert.deepEqual(candidates.map((candidate) => candidate.name), ['plan', 'plan-2']);
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('deny drops a skill from the catalog', async () => {
  const { root, cleanup } = await fixture({
    'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.'),
    'skills/beta/SKILL.md': SKILL('beta', 'Second skill.'),
  });
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')], deny: ['beta'] });
  try {
    const { candidates } = await provider.list({ cwd: root });
    assert.deepEqual(candidates.map((candidate) => candidate.name), ['alpha']);
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('autoDiscover picks up project conventions next to the working directory', async () => {
  const { root, cleanup } = await fixture({
    '.claude/skills/pdf-tools/SKILL.md': SKILL('pdf-tools', 'PDF helpers.'),
    '.cursor/rules/style.mdc': '---\ndescription: House style\n---\n\nUse logical properties.\n',
    'AGENTS.md': '# Project\n\nRun the tests first.\n',
  });
  const provider = makeProvider(root, { autoDiscover: true });
  try {
    const { candidates } = await provider.list({ cwd: root });
    const names = candidates.map((candidate) => candidate.name);
    assert.equal(names.includes('pdf-tools'), true);
    assert.equal(names.includes('style'), true);
    assert.equal(names.includes('agents'), true);
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('a missing root is reported as a warning, not a failure', async () => {
  const log = [];
  const provider = makeProvider(process.cwd(), { roots: [path.join(process.cwd(), 'no-such-root')] }, log);
  try {
    const { candidates } = await provider.list({ cwd: process.cwd() });
    assert.deepEqual(candidates, []);
    assert.match(log.join(' '), /does not exist/);
  } finally {
    provider.dispose();
  }
});

test('an exhausted file budget warns instead of dropping skills silently', async () => {
  const log = [];
  const { root, cleanup } = await fixture({
    'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.'),
    'skills/beta/SKILL.md': SKILL('beta', 'Second skill.'),
  });
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')], maxFiles: 1 }, log);
  try {
    const { candidates, complete } = await provider.list({ cwd: root });
    assert.equal(candidates.length, 1);
    assert.equal(complete, false, 'a truncated scan must not look complete to the registry');
    assert.match(log.join(' '), /discovery stopped at maxFiles \(1\)/);
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('an aborted signal stops a scan', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')] });
  try {
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    await assert.rejects(() => provider.list({ cwd: root, signal: controller.signal }), /aborted/);
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('dispose is idempotent and stops watching', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First skill.') });
  const provider = makeProvider(root, { roots: [path.join(root, 'skills')], watch: true });
  try {
    await provider.list({ cwd: root });
  } finally {
    provider.dispose();
    provider.dispose();
    await cleanup();
  }
});
test('a root that does not exist yet is watched through its parent, so a later import appears without a restart', async () => {
  const { root, cleanup } = await fixture({ 'keep.txt': 'x\n' });
  const store = path.join(root, 'store');
  const invalidations = [];
  const provider = makeProvider(root, { roots: [store], watch: true }, []);
  provider.bind({ signal: new AbortController().signal, invalidate: () => invalidations.push(Date.now()) });
  try {
    const before = await provider.list({ cwd: root });
    assert.deepEqual(before.candidates, []);

    // The operator now imports a skill into a store that did not exist during
    // the first scan. Watching the parent must surface it.
    await mkdir(store, { recursive: true });
    await writeFile(path.join(store, 'alpha.md'), SKILL('alpha', 'First skill.'), 'utf8');
    await waitFor(() => invalidations.length > 0, 4000);

    const after = await provider.list({ cwd: root });
    assert.deepEqual(after.candidates.map((candidate) => candidate.name), ['alpha']);
  } finally {
    provider.dispose();
    await cleanup();
  }
});

test('an edit inside an upgraded watcher invalidates again', async () => {
  const { root, cleanup } = await fixture({ 'keep.txt': 'x\n' });
  const store = path.join(root, 'store');
  const invalidations = [];
  const provider = makeProvider(root, { roots: [store], watch: true }, []);
  provider.bind({ signal: new AbortController().signal, invalidate: () => invalidations.push(Date.now()) });
  try {
    await provider.list({ cwd: root });
    await mkdir(store, { recursive: true });
    await writeFile(path.join(store, 'alpha.md'), SKILL('alpha', 'First skill.'), 'utf8');
    await waitFor(() => invalidations.length > 0, 4000);
    await provider.list({ cwd: root });

    const settled = invalidations.length;
    await writeFile(path.join(store, 'alpha.md'), SKILL('alpha', 'Edited description.'), 'utf8');
    await waitFor(() => invalidations.length > settled, 4000);
    const edited = await provider.list({ cwd: root });
    assert.equal(edited.candidates[0].description, 'Edited description.');
  } finally {
    provider.dispose();
    await cleanup();
  }
});
