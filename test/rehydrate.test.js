import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scanRoot } from '../src/discover.js';
import { rehydrate } from '../src/rehydrate.js';
import { DIALECT_FILES, fixture } from './helpers.js';

const OPTIONS = { providerName: 'skill-forge' };

test('rehydrate rebuilds a definition from the file on disk', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: Original.\n---\n\nOriginal body.\n' });
  try {
    const { skills } = await scanRoot(path.join(root, 'skills'), { depth: 2 });
    const candidate = {
      name: 'alpha',
      locator: { file: skills[0].file, root: path.join(root, 'skills'), dialect: skills[0].dialect },
    };
    const definition = await rehydrate(candidate.locator.file, candidate, OPTIONS);
    assert.equal(definition.name, 'alpha');
    assert.match(definition.content, /Original body/);
  } finally {
    await cleanup();
  }
});

test('rehydrate reflects an edit made after the scan', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: Original.\n---\n\nOriginal body.\n' });
  try {
    const { skills } = await scanRoot(path.join(root, 'skills'), { depth: 2 });
    const file = skills[0].file;
    await writeFile(file, '---\nname: alpha\ndescription: Rewritten.\n---\n\nRewritten body.\n');
    const definition = await rehydrate(file, { name: 'alpha', locator: { file, root: path.join(root, 'skills') } }, OPTIONS);
    assert.match(definition.content, /Rewritten body/);
    assert.equal(definition.description, 'Rewritten.');
  } finally {
    await cleanup();
  }
});

test('rehydrate pins the published name even if the frontmatter changed', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: Original.\n---\n\nbody\n' });
  try {
    const file = path.join(root, 'skills', 'alpha', 'SKILL.md');
    await writeFile(file, '---\nname: renamed\ndescription: Renamed.\n---\n\nbody\n');
    const definition = await rehydrate(file, { name: 'alpha', locator: { file, root: path.join(root, 'skills') } }, OPTIONS);
    assert.equal(definition.name, 'alpha');
  } finally {
    await cleanup();
  }
});

test('rehydrate returns undefined once the file is gone', async () => {
  const { root, cleanup } = await fixture({ 'skills/alpha/SKILL.md': '---\nname: alpha\ndescription: X.\n---\nbody\n' });
  try {
    const gone = path.join(root, 'skills', 'alpha', 'SKILL.md');
    const { rm } = await import('node:fs/promises');
    await rm(gone);
    assert.equal(await rehydrate(gone, { name: 'alpha' }, OPTIONS), undefined);
  } finally {
    await cleanup();
  }
});

test('rehydrate returns undefined for a directory', async () => {
  assert.equal(await rehydrate(process.cwd(), { name: 'x' }, OPTIONS), undefined);
});

test('rehydrate reaches the same dialect and resource base as the scan', async () => {
  const { root, cleanup } = await fixture(DIALECT_FILES);
  try {
    const bundle = path.join(root, '.claude', 'skills', 'pdf-tools', 'SKILL.md');
    const scanned = (await scanRoot(root, { depth: 4 })).skills.find((skill) => skill.file === bundle);
    const definition = await rehydrate(bundle, { name: 'pdf-tools', locator: { file: bundle, root } }, OPTIONS);
    // The fixture bundle ships `allowed-tools`, a Claude-only key, so both
    // paths must agree on Claude Code rather than Agent Skills.
    assert.equal(scanned.dialect, 'claude-code');
    assert.equal(definition.metadata.dialect, scanned.dialect);
    assert.equal(definition.resourceBase.path, path.join(root, '.claude', 'skills', 'pdf-tools'));
  } finally {
    await cleanup();
  }
});
