/**
 * Dialect detection for foreign skill formats.
 *
 * A "dialect" is one ecosystem's convention for laying instruction files on
 * disk. DeepSeek Harness ships a loader for its own convention only (a
 * `SKILL.md` bundle with YAML frontmatter carrying `name` and
 * `description`). Everything else in the wild - Claude Code skills and slash
 * commands, Cursor project rules, repository `AGENTS.md` files, bare Markdown
 * notes - is shaped differently, so this plugin classifies each candidate file
 * before adapting it.
 *
 * @module dsh-skill-forge/dialects
 */

/**
 * Dialect identifiers. Each one names a *shape on disk*, not a vendor.
 * @type {Readonly<Record<string, string>>}
 */
export const DIALECT = Object.freeze({
  /** `<dir>/SKILL.md` bundle following the Agent Skills open standard. */
  agentSkills: 'agent-skills',
  /** A flat `*.md` file carrying `name` + `description` frontmatter. */
  flatSkill: 'flat-skill',
  /** Claude Code skill (`SKILL.md` plus `argument-hint`, `$ARGUMENTS`, tool grants). */
  claudeCode: 'claude-code',
  /** Claude Code slash command from `.claude/commands/<name>.md`. */
  claudeCommand: 'claude-command',
  /** Cursor project rule (`.cursor/rules/*.mdc` with `globs`/`alwaysApply`). */
  cursorRule: 'cursor-rule',
  /** Legacy single-file `.cursorrules`. */
  cursorLegacy: 'cursor-legacy',
  /** Repository instructions: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`. */
  repoInstructions: 'repo-instructions',
  /** Markdown with no frontmatter and no ecosystem marker. */
  looseMarkdown: 'loose-markdown',
});

/** Human-readable one-liners used by `forge scan`. */
export const DIALECT_LABEL = Object.freeze({
  [DIALECT.agentSkills]: 'Agent Skills bundle',
  [DIALECT.flatSkill]: 'single-file skill',
  [DIALECT.claudeCode]: 'Claude Code skill',
  [DIALECT.claudeCommand]: 'Claude Code slash command',
  [DIALECT.cursorRule]: 'Cursor project rule',
  [DIALECT.cursorLegacy]: 'legacy .cursorrules',
  [DIALECT.repoInstructions]: 'repository instructions',
  [DIALECT.looseMarkdown]: 'plain Markdown',
});

/** Frontmatter keys that only ever appear in Claude Code skills. */
const CLAUDE_KEYS = [
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'allowedTools',
  'argument-hint',
  'argumentHint',
  'model',
  'context',
];

/** Frontmatter keys that only ever appear in Cursor rules. */
const CURSOR_KEYS = ['alwaysApply', 'always-apply', 'globs', 'trigger'];

/** Repository instruction basenames, lower-cased. */
const REPO_INSTRUCTION_NAMES = new Set([
  'agents.md',
  'claude.md',
  'gemini.md',
  'codex.md',
  'copilot-instructions.md',
  'instructions.md',
]);

/**
 * Classify one instruction file.
 *
 * Detection is ordered from most specific to least: an explicit directory
 * convention wins, then distinctive frontmatter keys, then the filename, and
 * only then whether the file happens to carry `name`/`description`.
 *
 * @param {object} input - observation about the file.
 * @param {string} input.filePath - absolute path of the instruction file.
 * @param {string} input.baseName - its basename, any case.
 * @param {readonly string[]} input.segments - its path segments, any case, for directory conventions.
 * @param {Record<string, unknown>} input.frontmatter - parsed frontmatter (may be empty).
 * @param {boolean} input.hasFrontmatter - whether a leading `---` fence was present.
 * @returns {string} one of {@link DIALECT}.
 */
export function detectDialect(input) {
  const base = String(input.baseName ?? '').toLowerCase();
  const segments = (input.segments ?? []).map((segment) => String(segment).toLowerCase());
  const frontmatter = input.frontmatter ?? {};
  const keys = Object.keys(frontmatter);

  // 1. Directory conventions decide first: they are unambiguous even when the
  //    file itself carries no distinguishing metadata.
  if (base === '.cursorrules') return DIALECT.cursorLegacy;
  if (base.endsWith('.mdc')) return DIALECT.cursorRule;
  if (segments.includes('.cursor') && segments.includes('rules')) return DIALECT.cursorRule;
  // 2. Filenames that repository tooling standardised on.
  if (REPO_INSTRUCTION_NAMES.has(base)) return DIALECT.repoInstructions;
  // 3. Frontmatter keys that only one ecosystem writes.
  if (keys.some((key) => CURSOR_KEYS.includes(key))) return DIALECT.cursorRule;
  const hasClaudeKeys = keys.some((key) => CLAUDE_KEYS.includes(key));
  // 4. The bundle name itself. A bundle under .claude/skills/ that uses no
  //    Claude-specific key is plain Agent Skills: it is portable, and treating
  //    it as Claude Code would only add rewriting it does not need.
  if (base === 'skill.md') return hasClaudeKeys ? DIALECT.claudeCode : DIALECT.agentSkills;
  // 5. A slash command lives in a commands directory, or declares an argument
  //    hint without the bundle shape.
  if (segments.includes('commands')) return DIALECT.claudeCommand;
  if (hasClaudeKeys) return DIALECT.claudeCommand;
  // 6. Anything with a header at all is at least a single-file skill; the rest
  //    is prose until an operator opts into loose Markdown.
  if (input.hasFrontmatter === true) return DIALECT.flatSkill;
  return DIALECT.looseMarkdown;
}

/**
 * Whether a directory convention demands a `SKILL.md` at the directory root.
 * These bundles never contribute loose sibling Markdown files as skills.
 * @param {readonly string[]} segments - lower-cased path segments.
 * @returns {boolean} true for `skills/<name>/` style nesting.
 */
export function isSkillBundleDir(segments) {
  return segments.some((segment) => segment === 'skills');
}

/**
 * Names of the document directories an Agent Skills bundle may carry. They are
 * advertised to the model as relative paths inside the resource base.
 * @type {readonly string[]}
 */
export const RESOURCE_DIRS = Object.freeze(['references', 'scripts', 'assets', 'examples', 'templates', 'resources']);
