import assert from 'node:assert/strict';
import test from 'node:test';
import { DIALECT, DIALECT_LABEL, RESOURCE_DIRS, detectDialect, isSkillBundleDir } from '../src/dialects.js';

/** Build the arguments detectDialect expects. */
function detect(relativePath, frontmatter = {}) {
  const segments = relativePath.split('/').map((segment) => segment.toLowerCase());
  return detectDialect({
    filePath: '/repo/' + relativePath,
    baseName: segments[segments.length - 1],
    segments,
    frontmatter,
    hasFrontmatter: Object.keys(frontmatter).length > 0,
  });
}

test('detectDialect recognizes the Agent Skills bundle', () => {
  // A standards-compliant bundle stays portable even under .claude/skills/:
  // it needs no Claude-specific rewriting.
  assert.equal(detect('.claude/skills/pdf-tools/SKILL.md', { name: 'pdf-tools', description: 'x' }), DIALECT.agentSkills);
  assert.equal(detect('.agents/skills/deploy/SKILL.md', { name: 'deploy', description: 'x' }), DIALECT.agentSkills);
  assert.equal(detect('skills/plain/SKILL.md'), DIALECT.agentSkills);
});

test('detectDialect flags a bundle that uses Claude-only frontmatter', () => {
  const claude = detect('.claude/skills/pdf-tools/SKILL.md', { name: 'pdf-tools', description: 'x', 'allowed-tools': 'Read' });
  assert.equal(claude, DIALECT.claudeCode);
});

test('detectDialect distinguishes Claude slash commands', () => {
  assert.equal(detect('.claude/commands/release.md', { description: 'x' }), DIALECT.claudeCommand);
  assert.equal(detect('commands/release.md', { description: 'x' }), DIALECT.claudeCommand);
});

test('detectDialect recognizes Cursor rules and the legacy file', () => {
  assert.equal(detect('.cursor/rules/style.mdc', { globs: '*' }), DIALECT.cursorRule);
  assert.equal(detect('rules/style.mdc'), DIALECT.cursorRule);
  assert.equal(detect('.cursorrules'), DIALECT.cursorLegacy);
});

test('detectDialect recognizes repository instruction files', () => {
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CODEX.md', 'instructions.md']) {
    const dialect = detect(name);
    assert.equal(dialect, DIALECT.repoInstructions, name);
  }
  assert.equal(detect('.github/copilot-instructions.md'), DIALECT.repoInstructions);
});

test('detectDialect falls back to flat skill, then loose Markdown', () => {
  assert.equal(detect('docs/plan.md', { name: 'plan', description: 'x' }), DIALECT.flatSkill);
  assert.equal(detect('docs/plan.md', { description: 'x' }), DIALECT.flatSkill);
  assert.equal(detect('docs/guide.md'), DIALECT.looseMarkdown);
});

test('every dialect has a human label', () => {
  for (const value of Object.values(DIALECT)) {
    assert.equal(typeof DIALECT_LABEL[value], 'string', value);
    assert.equal(DIALECT_LABEL[value].length > 0, true, value);
  }
});

test('RESOURCE_DIRS covers the conventions skills actually ship', () => {
  for (const name of ['references', 'scripts', 'assets', 'examples']) {
    assert.equal(RESOURCE_DIRS.includes(name), true, name);
  }
});

test('isSkillBundleDir spots bundle folders and paths', () => {
  assert.equal(isSkillBundleDir(['.claude', 'skills', 'pdf-tools', 'skill.md']), true);
  assert.equal(isSkillBundleDir(['some', 'other', 'file.md']), false);
});
