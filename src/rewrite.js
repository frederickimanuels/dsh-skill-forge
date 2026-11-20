/**
 * Instruction rewriting for foreign skill bodies.
 *
 * Foreign skills assume tools this harness does not have. Claude Code spells
 * tools `Read`/`Bash`/`Grep`, uses `$ARGUMENTS` for invocation arguments,
 * injects command output with `!\`cmd\``, and pulls files in with `@path`.
 * Codex and Cursor write repository instructions addressed to an agent that
 * already knows the repository. None of that survives unchanged into a DSH
 * skill, so the body is rewritten into prose the model can actually follow
 * while keeping the author's original wording where it is still meaningful.
 *
 * Rewriting is deliberately conservative: it never deletes instructions, it
 * annotates them.
 *
 * @module dsh-skill-forge/rewrite
 */

/**
 * Foreign tool name (lower-cased) to the DSH tool that replaces it.
 * `null` marks a capability with no direct equivalent; those are reported
 * instead of silently dropped.
 * @type {Readonly<Record<string, string | null>>}
 */
export const TOOL_ALIASES = Object.freeze({
  read: 'read',
  write: 'write',
  edit: 'edit',
  multiedit: 'edit',
  notebookedit: 'write',
  bash: 'bash',
  shell: 'bash',
  terminal: 'bash',
  grep: 'grep',
  glob: 'glob',
  search: 'grep',
  ls: 'bash',
  webfetch: 'web_fetch',
  websearch: 'web_search',
  fetch: 'web_fetch',
  task: 'subagent',
  agent: 'subagent',
  todowrite: 'todo_write',
  todo: 'todo_write',
  skill: 'skill',
  python: 'bash',
  repl: 'bash',
});

/** Tools that DSH exposes but that foreign ecosystems name differently. */
const REVERSE_ALIASES = Object.freeze({
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  grep: 'Grep',
  glob: 'Glob',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
  subagent: 'Task',
  todo_write: 'TodoWrite',
  skill: 'Skill',
});

/**
 * Map one foreign tool name (possibly with an argument pattern such as
 * `Bash(git:*)`) to a DSH tool name.
 *
 * @param {string} spec - a single entry from a tool grant list.
 * @returns {{ dsh: string | null, pattern: string | undefined, original: string }}
 */
export function mapTool(spec) {
  const original = String(spec ?? '').trim();
  const match = /^([A-Za-z][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/.exec(original);
  if (match === null) return { dsh: null, pattern: undefined, original };
  const key = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
  const dsh = key in TOOL_ALIASES ? TOOL_ALIASES[key] : null;
  return { dsh, pattern: match[2], original };
}

/**
 * Split a tool grant list. Agent Skills separates grants with spaces,
 * Claude Code uses commas, and some authors mix both.
 * @param {unknown} value - the raw frontmatter value.
 * @returns {string[]} individual grants.
 */
export function splitToolList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter((item) => item.length > 0);
  if (typeof value !== 'string') return [];
  const out = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if ((char === ',' || /\s/.test(char)) && depth === 0) {
      if (current.trim().length > 0) out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) out.push(current.trim());
  return out;
}

/**
 * Describe a foreign tool grant list in terms of the harness.
 *
 * @param {unknown} value - raw `allowed-tools`/`allowed_tools` value.
 * @returns {{ granted: string[], mapped: Array<{ original: string, dsh: string | null, pattern: string | undefined }>, unmapped: string[] }}
 */
export function describeToolGrants(value) {
  const granted = splitToolList(value);
  const mapped = granted.map(mapTool);
  const unmapped = mapped.filter((entry) => entry.dsh === null).map((entry) => entry.original);
  return { granted, mapped, unmapped };
}

/** Matches `$ARGUMENTS`, `$1`..`$9`, `{{args}}`, `{args}`. */
const ARGUMENT_TOKEN = /\$(?:ARGUMENTS|\{ARGUMENTS\}|\d)|\{\{\s*args?\s*\}\}|\{\s*args?\s*\}/i;

/** Matches Claude Code inline command injection: !`cmd` or !cmd-to-end-of-line. */
const BASH_INJECTION = /!`([^`]+)`/g;

/** Matches `@path/to/file` references outside of email addresses. */
const FILE_REFERENCE = /(^|[\s(])@([A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)/g;

/**
 * Rewrite a skill body so its directives point at this harness.
 *
 * @param {string} body - the original Markdown body.
 * @param {object} [options] - adaptation context.
 * @param {boolean} [options.commandStyle] - treat the skill as a slash command (argument substitution is an invocation argument).
 * @returns {{ body: string, notes: string[], used: { arguments: boolean, bash: string[], files: string[] } }}
 */
export function rewriteBody(body, options = {}) {
  const source = typeof body === 'string' ? body : '';
  const notes = [];
  const used = { arguments: false, bash: [], files: [] };
  let output = source;

  const bashMatches = [...source.matchAll(BASH_INJECTION)].map((match) => match[1].trim());
  if (bashMatches.length > 0) {
    used.bash.push(...bashMatches);
    output = output.replace(BASH_INJECTION, (_match, command) => 'the output of the command `' + command.trim() + '`');
    notes.push('dynamic command injection rewritten to a run instruction (' + bashMatches.length + ' command' + (bashMatches.length === 1 ? '' : 's') + ')');
  }

  const fileRefs = [...source.matchAll(FILE_REFERENCE)].map((match) => match[2]);
  if (fileRefs.length > 0) {
    used.files.push(...fileRefs);
    output = output.replace(FILE_REFERENCE, (match, lead, path) => lead + 'the file `' + path + '`');
    notes.push('file references rewritten to read instructions (' + fileRefs.length + ')');
  }

  if (ARGUMENT_TOKEN.test(source)) {
    used.arguments = true;
    output = output.replace(new RegExp(ARGUMENT_TOKEN.source, 'gi'), 'the user\'s request');
    notes.push(options.commandStyle === true
      ? 'slash-command arguments rewritten to "the user\'s request"'
      : 'argument placeholders rewritten to "the user\'s request"');
  }

  return { body: output, notes, used };
}

/**
 * Render the adaptation preamble that precedes every rewritten body.
 *
 * The preamble is the only place the model learns that this skill came from
 * another ecosystem, which tools it may substitute, and which directories it
 * may load resources from.
 *
 * @param {object} skill - partially adapted skill.
 * @param {string} skill.dialect - dialect identifier.
 * @param {string} [skill.originPath] - the instruction file's path.
 * @param {{ mapped: Array<{ original: string, dsh: string | null }> }} [skill.grants] - foreign tool grants.
 * @param {readonly string[]} [skill.resources] - relative resource directories present.
 * @param {readonly string[]} [skill.notes] - rewrite notes.
 * @returns {string} Markdown preamble, ending with a blank line.
 */
export function renderPreamble(skill) {
  const lines = [];
  const dialect = skill.dialect ?? 'foreign';
  const article = /^[aeiou]/i.test(dialect) ? 'an' : 'a';
  lines.push('> Adapted from ' + article + ' ' + dialect + ' skill by dsh-skill-forge.');
  if (typeof skill.originPath === 'string' && skill.originPath.length > 0) {
    lines.push('> Original instruction file: `' + skill.originPath + '`');
  }

  const grants = skill.grants;
  if (grants !== undefined && Array.isArray(grants.mapped) && grants.mapped.length > 0) {
    const usable = grants.mapped.filter((entry) => entry.dsh !== null);
    const unusable = grants.mapped.filter((entry) => entry.dsh === null);
    if (usable.length > 0) {
      // Only name the harness tool when it differs from what the author wrote;
      // "Read -> Read tool" tells the model nothing.
      const pairs = usable.map((entry) => {
        // "Bash(pdftk:*)" already contains its pattern; do not print it twice.
        const suffix = entry.pattern === undefined || entry.original.includes('(') ? '' : ' (' + entry.pattern + ')';
        const label = entry.original + suffix;
        const harnessName = REVERSE_ALIASES[entry.dsh];
        return harnessName === undefined || harnessName === entry.original ? label : label + ' -> ' + harnessName + ' tool';
      });
      lines.push('> This skill expects these tools: ' + pairs.join(', ') + '. Use the harness equivalent, which is named the same where no arrow is shown.');
    }
    if (unusable.length > 0) {
      lines.push('> These granted tools have no harness equivalent and must be replaced with a harness tool or skipped: ' + unusable.map((entry) => entry.original).join(', ') + '.');
    }
  }

  if (Array.isArray(skill.resources) && skill.resources.length > 0) {
    lines.push('> This skill ships resources in: ' + skill.resources.join(', ') + '. Resolve those relative paths against the skill base directory and read only what the task needs.');
  }

  if (Array.isArray(skill.notes) && skill.notes.length > 0) {
    lines.push('> Adaptation applied: ' + skill.notes.join('; ') + '.');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Collapse a Markdown body into a single-line description.
 *
 * Used when a skill has no `description` frontmatter: the first real
 * paragraph becomes the catalog entry.
 *
 * @param {string} body - Markdown body.
 * @param {number} [limit] - maximum characters; the text is cut on a word boundary.
 * @returns {string} description, possibly empty.
 */
export function summarizeBody(body, limit = 240) {
  const text = typeof body === 'string' ? body : '';
  for (const rawBlock of text.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (block.length === 0) continue;
    if (block.startsWith('<!--')) continue;
    if (block.startsWith('>')) continue;
    // A document title describes the file, not the task the skill performs;
    // the first prose paragraph is the better catalog entry.
    if (/^#{1,6}\s/.test(block) && !block.includes('\n')) continue;
    if (/^#{1,6}\s/.test(block) && !/\n[^#\n]/.test(block)) continue;
    const cleaned = block
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/```[\s\S]*$/m, '')
      // A catalog description is plain text: inline code markers would be shown
      // to the model verbatim, so unwrap them but keep the code.
      .replace(/`([^`\n]*)`/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/\[(?<text>[^\]]*)\]\([^)]*\)/g, '$<text>')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length === 0) continue;
    if (cleaned.length <= limit) return cleaned;
    const cut = cleaned.lastIndexOf(' ', limit);
    return cleaned.slice(0, cut > limit * 0.6 ? cut : limit).trimEnd() + '…';
  }
  return '';
}
