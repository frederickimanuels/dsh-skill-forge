/**
 * Fixture helpers.
 *
 * Every fixture is written to a fresh temporary directory instead of being
 * committed. That keeps files a harness might auto-load as project instructions
 * (AGENTS.md, CLAUDE.md) out of this repository, and it lets a test mutate a
 * skill and assert on the next scan.
 *
 * @module test/helpers
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Create a temporary directory holding the given files.
 *
 * @param {Record<string, string>} files - relative path to contents.
 * @returns {Promise<{ root: string, cleanup: () => Promise<void> }>}
 */
export async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'skill-forge-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return {
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Every dialect this plugin understands, laid out where each one lives. */
export const DIALECT_FILES = {
  '.claude/skills/pdf-tools/SKILL.md': [
    '---',
    'name: pdf-tools',
    'description: Fill, split and merge PDF forms from the command line.',
    'allowed-tools: Bash(pdftk:*) Read Write UnknownTool',
    'argument-hint: <input.pdf> [output.pdf]',
    '---',
    '',
    '# PDF tools',
    '',
    'Run !`pdftk --version` first to confirm the binary is installed.',
    '',
    'Then read @scripts/fill.py and apply it.',
    '',
    'Fill the fields from the request: $ARGUMENTS',
    '',
  ].join('\n'),
  '.claude/skills/pdf-tools/scripts/fill.py': "print('fill')\n",
  '.claude/skills/pdf-tools/references/fields.md': '# Fields\n',
  '.claude/commands/release.md': ['---', 'description: Cut a release with the given version.', 'argument-hint: <version>', 'disable-model-invocation: true', '---', '', 'Bump the version to $1, then run the release checks.', ''].join('\n'),
  '.agents/skills/deploy/SKILL.md': ['---', 'name: deploy', 'description: Deploy the service to staging.', 'metadata:', '  version: "2.0"', '  owner: platform', 'license: MIT', '---', '', 'Deploy steps.', ''].join('\n'),
  '.cursor/rules/style.mdc': ['---', 'description: House CSS style', 'globs: ["src/**/*.css"]', 'alwaysApply: false', '---', '', 'Prefer logical properties over physical ones.', ''].join('\n'),
  '.cursor/rules/always.mdc': ['---', 'alwaysApply: true', '---', '', 'Never commit to main.', ''].join('\n'),
  '.cursorrules': 'Use two-space indentation.\n',
  'AGENTS.md': '# Project\n\nRun npm test before committing.\n',
  'CLAUDE.md': '@AGENTS.md\n',
  'docs/guide.md': '# Guide\n\nJust prose, not a skill.\n',
  'docs/plan.md': ['---', 'name: plan', 'description: Planning checklist for larger refactors.', '---', '', 'Write the plan first.', ''].join('\n'),
  'README.md': '# Fixture\n\nRepository readme.\n',
};
