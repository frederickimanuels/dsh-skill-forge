import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fixture } from './helpers.js';
import { bootRegistry } from './host.js';

/**
 * Mount the plugin the harness way: resolve the module, then hand it to
 * `ctx.plugin` with a config. The fiber stays inactive until the skill
 * registry it injects is available, so the registry is mounted first.
 */
async function mount(ctx, config) {
  const plugin = await import('../src/index.js');
  const fork = ctx.plugin(plugin, config);
  await fork;
  return fork;
}

const SKILL = (name, description) => ['---', 'name: ' + name, 'description: ' + description, '---', '', 'Body of ' + name + '.', ''].join('\n');

test('the plugin exposes the shape the harness loads', async () => {
  const plugin = await import('../src/index.js');
  assert.equal(plugin.name, 'skill-forge');
  assert.deepEqual(plugin.inject, ['skills']);
  assert.equal(typeof plugin.apply, 'function');
  assert.equal(typeof plugin.Config, 'function');
  const resolved = plugin.Config({});
  assert.equal(resolved.providerName, 'skill-forge');
  assert.deepEqual(resolved.roots, ['~/.dsh/skill-forge']);
  assert.equal(resolved.autoDiscover, true);
  assert.equal(resolved.includeLoose, false);
});

test('a mounted plugin publishes its skills through the real registry', async () => {
  const { root, cleanup } = await fixture({
    'skills/alpha/SKILL.md': SKILL('alpha', 'First imported skill.'),
    'skills/beta/SKILL.md': SKILL('beta', 'Second imported skill.'),
  });
  const { ctx, dispose } = await bootRegistry();
  try {
    const fork = await mount(ctx, { roots: [path.join(root, 'skills')], autoDiscover: false, watch: false });
    const listed = await ctx.skills.list({ cwd: root });
    assert.deepEqual(listed.map((summary) => summary.name).sort(), ['alpha', 'beta']);
    assert.equal(listed[0].provider, 'skill-forge');

    const loaded = await ctx.skills.get('alpha', { cwd: root });
    assert.match(loaded.content, /Body of alpha/);
    assert.match(loaded.content, /^> Adapted from an? /);
    await fork.dispose();
  } finally {
    await dispose();
    await cleanup();
  }
});

test('an unnameable file is skipped and the rest still publish', async () => {
  const { root, cleanup } = await fixture({
    // A directory whose name slugifies to nothing yields no legal skill name.
    'skills/---/SKILL.md': '---\nname: ---\ndescription: No name survives.\n---\n\nbody\n',
    'skills/fine/SKILL.md': SKILL('fine', 'Still works.'),
  });
  const { ctx, dispose } = await bootRegistry();
  try {
    const fork = await mount(ctx, { roots: [path.join(root, 'skills')], autoDiscover: false, watch: false });
    const listed = await ctx.skills.list({ cwd: root });
    assert.deepEqual(listed.map((summary) => summary.name), ['fine']);
    await fork.dispose();
  } finally {
    await dispose();
    await cleanup();
  }
});

test('the contribution disappears when the plugin is disposed', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First.') });
  const { ctx, dispose } = await bootRegistry();
  try {
    const fork = await mount(ctx, { roots: [path.join(root, 'skills')], autoDiscover: false, watch: false });
    assert.equal((await ctx.skills.list({ cwd: root })).length, 1);
    await fork.dispose();
    assert.deepEqual(await ctx.skills.list({ cwd: root }), []);
  } finally {
    await dispose();
    await cleanup();
  }
});

test('a providerName collision with the bundled provider is not fatal', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': SKILL('alpha', 'First.') });
  const { ctx, dispose } = await bootRegistry();
  try {
    ctx.skills.registerProvider(() => ({ name: 'taken', list: () => [], get: () => undefined }));
    const fork = await mount(ctx, { roots: [path.join(root, 'skills')], providerName: 'taken', autoDiscover: false, watch: false });
    // A duplicate provider name is a profile misconfiguration: it must be
    // reported and the plugin left idle, never thrown out of apply().
    assert.deepEqual(await ctx.skills.list({ cwd: root }), []);
    await fork.dispose();
  } finally {
    await dispose();
    await cleanup();
  }
});

test('providerName "runtime" is refused instead of shadowing runtime skills', async () => {
  const { ctx, dispose } = await bootRegistry();
  try {
    const plugin = await import('../src/index.js');
    const logger = ctx.logger;
    const warnings = [];
    const original = logger.warn.bind(logger);
    logger.warn = (message) => {
      warnings.push(String(message));
      original(message);
    };
    try {
      const fork = ctx.plugin(plugin, { providerName: 'runtime', autoDiscover: false, watch: false });
      await fork;
      assert.match(warnings.join(' '), /"runtime" is reserved/);
      assert.deepEqual(await ctx.skills.list({ cwd: process.cwd() }), []);
    } finally {
      logger.warn = original;
    }
  } finally {
    await dispose();
  }
});
