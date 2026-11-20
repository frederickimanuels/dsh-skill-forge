/**
 * Adapting a discovered instruction file into a DSH skill.
 *
 * A discovery record is just "here is a Markdown file and the dialect it
 * belongs to". This module turns that into the shape the harness catalogs:
 * a kebab-case `name`, a one-line `description`, invocation flags, a rank, a
 * resource base, and the instruction `content` the model finally reads.
 *
 * Two rules drive every fallback here. First, adapt rather than reject: a
 * foreign skill missing required metadata still imports, with the missing
 * field derived from the body. Second, never invent authority: invocation
 * flags are only relaxed when the source format explicitly says so.
 *
 * @module dsh-skill-forge/adapt
 */

import path from 'node:path';
import { DIALECT } from './dialects.js';
import { describeToolGrants, renderPreamble, rewriteBody, summarizeBody } from './rewrite.js';

/** The harness' skill-name grammar. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Longest skill name the harness accepts. */
const MAX_NAME = 64;
/** Longest description the Agent Skills standard allows. */
const MAX_DESCRIPTION = 1024;

/**
 * Turn arbitrary text into a legal DSH skill name.
 * @param {unknown} value - proposed name.
 * @returns {string} kebab-case name matching `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, or `''`.
 */
export function slugify(value) {
  const text = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  let slug = text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  if (slug.length > MAX_NAME) {
    slug = slug.slice(0, MAX_NAME);
    const cut = slug.lastIndexOf('-');
    if (cut > 1) slug = slug.slice(0, cut);
    slug = slug.replace(/-+$/g, '');
  }
  return slug;
}

/**
 * Read the first present key from a frontmatter mapping.
 * @param {Record<string, unknown>} data - frontmatter.
 * @param {readonly string[]} keys - candidate keys, in priority order.
 * @returns {unknown} the first defined value.
 */
function pick(data, keys) {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Coerce a frontmatter boolean written as a string.
 * @param {unknown} value - raw value.
 * @returns {boolean | undefined} tri-state.
 */
function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === 'yes' || text === 'on' || text === '1') return true;
    if (text === 'false' || text === 'no' || text === 'off' || text === '0') return false;
  }
  return undefined;
}

/**
 * Clamp a description to the catalog limit on a word boundary.
 * @param {string} text - description text.
 * @returns {string} the description.
 */
function clampDescription(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (value.length <= MAX_DESCRIPTION) return value;
  const cut = value.lastIndexOf(' ', MAX_DESCRIPTION);
  return value.slice(0, cut > MAX_DESCRIPTION * 0.6 ? cut : MAX_DESCRIPTION).trimEnd();
}

/**
 * Invocation policy for a dialect. Repository instruction files are reachable
 * by the user but should not be auto-invoked for unrelated requests; skills are
 * model-invocable unless the source format opts out.
 *
 * @param {string} dialect - dialect identifier.
 * @param {Record<string, unknown>} data - frontmatter.
 * @returns {{ modelInvocable: boolean, userInvocable: boolean, reason: string }}
 */
export function invocationFor(dialect, data) {
  let modelInvocable = true;
  let userInvocable = true;
  let reason = 'format default';

  // Claude Code: disable-model-invocation / user-invocable.
  const disabled = asBoolean(pick(data, ['disable-model-invocation', 'disableModelInvocation', 'disable_model_invocation']));
  if (disabled === true) {
    modelInvocable = false;
    reason = 'frontmatter disable-model-invocation';
  }
  const legacyModel = asBoolean(data.modelInvocable);
  if (legacyModel !== undefined) {
    modelInvocable = legacyModel;
    reason = 'frontmatter modelInvocable';
  }
  const userFlag = asBoolean(pick(data, ['user-invocable', 'userInvocable', 'user_invocable']));
  if (userFlag !== undefined) userInvocable = userFlag;

  if (dialect === DIALECT.repoInstructions && reason === 'format default') {
    // AGENTS.md addresses every request in a repository; keeping it
    // model-invocable would let it win unrelated tasks. It stays available by
    // explicit name.
    modelInvocable = false;
    reason = 'repository instructions are user-invocable only';
  }
  if (dialect === DIALECT.cursorRule) {
    const always = asBoolean(pick(data, ['alwaysApply', 'always-apply']));
    if (always === true) {
      modelInvocable = true;
      reason = 'cursor rule alwaysApply';
    }
  }
  return { modelInvocable, userInvocable, reason };
}

/**
 * Lowest rank a forged skill is given.
 *
 * The registry sorts candidates by ascending rank and the first one wins, so a
 * *larger* number means *lower* priority. The bundled filesystem provider uses
 * 100 (project) through 600 (bundled); forged skills start above all of them so
 * an import never shadows a skill the harness or the project author already
 * provides. Lowering `rankBoost` is the documented way to opt into shadowing.
 */
export const FORGE_RANK_BASE = 620;

/**
 * Default rank per dialect. Ranks order the catalog when two providers offer
 * the same name; a lower rank wins. Within one provider, a file the author
 * wrote as a skill outranks repository-level instructions, and repository
 * instructions outrank a directory of loose Markdown.
 * @type {Readonly<Record<string, number>>}
 */
export const DIALECT_RANK = Object.freeze({
  [DIALECT.agentSkills]: FORGE_RANK_BASE,
  [DIALECT.claudeCode]: FORGE_RANK_BASE + 10,
  [DIALECT.flatSkill]: FORGE_RANK_BASE + 20,
  [DIALECT.claudeCommand]: FORGE_RANK_BASE + 30,
  [DIALECT.cursorRule]: FORGE_RANK_BASE + 40,
  [DIALECT.repoInstructions]: FORGE_RANK_BASE + 50,
  [DIALECT.cursorLegacy]: FORGE_RANK_BASE + 60,
  [DIALECT.looseMarkdown]: FORGE_RANK_BASE + 70,
});

/**
 * Build the skill content the model reads: an adaptation preamble followed by
 * the rewritten body.
 *
 * @param {object} record - discovery record.
 * @param {object} parts - already-derived pieces.
 * @returns {string} Markdown content.
 */
function composeContent(record, parts) {
  const rewritten = rewriteBody(record.body, { commandStyle: record.dialect === DIALECT.claudeCommand });
  const notes = [...rewritten.notes];
  if (record.frontmatterError !== undefined) {
    notes.push('frontmatter could not be fully parsed (' + record.frontmatterError + '); no metadata was dropped from the body');
  }
  const preamble = renderPreamble({
    dialect: record.dialect,
    originPath: record.file,
    grants: parts.grants,
    resources: parts.resourceDirs,
    notes,
  });
  const body = rewritten.body.replace(/^\n+/, '');
  return preamble + (body.endsWith('\n') ? body : body + '\n');
}

/**
 * Adapt one discovery record into a harness skill definition.
 *
 * @param {Record<string, unknown>} record - output of `discover.scanRoot`.
 * @param {object} options - adaptation options.
 * @param {string} options.providerName - provider name the candidate must declare.
 * @param {number} [options.rankBoost] - added to the dialect rank; negative values win ties.
 * @param {boolean} [options.includeCommandArgumentHint] - append Claude's `argument-hint` as guidance.
 * @param {(name: string) => string} [options.uniqueName] - name allocator for collisions.
 * @returns {{ definition: Record<string, unknown> | undefined, warnings: string[], reason?: string }}
 */
export function adaptRecord(record, options) {
  const providerName = options.providerName;
  const data = record.frontmatter ?? {};
  const warnings = [];
  const resourceDirs = Array.isArray(record.resourceDirs) ? record.resourceDirs : [];

  const proposed = pick(data, ['name', 'id', 'slug', 'title']);
  let name = slugify(proposed);
  if (name.length === 0) name = slugify(record.isBundleRoot === true ? path.basename(record.dir) : path.basename(record.baseName, path.extname(record.baseName)));
  if (name.length === 0) name = slugify(path.basename(record.dir));
  if (name.length === 0) {
    return { definition: undefined, warnings, reason: 'no usable name could be derived from ' + record.file };
  }
  if (proposed !== undefined && slugify(proposed) !== String(proposed)) {
    warnings.push('name "' + String(proposed) + '" normalized to "' + slugify(proposed) + '"');
  }
  const allocated = typeof options.uniqueName === 'function' ? options.uniqueName(name) : name;
  const unique = typeof allocated === 'string' && allocated.length > 0 ? allocated : name;
  if (unique !== name) warnings.push('name "' + name + '" collided in the catalog; published as "' + unique + '"');
  name = unique;

  // A file that only points at another file ("@AGENTS.md") is a redirect, not
  // an instruction set: the target is discovered and imported on its own, so
  // publishing the redirect would add a catalog entry whose body is a path.
  const redirectTargets = Array.isArray(record.redirectTargets) ? record.redirectTargets : [];
  if (redirectTargets.length > 0) {
    return {
      definition: undefined,
      warnings,
      reason: 'only redirects to ' + redirectTargets.join(', ') + '; the referenced file is imported on its own',
    };
  }

  const rawDescription = pick(data, ['description', 'summary', 'when_to_use', 'whenToUse']);
  let description = typeof rawDescription === 'string' ? clampDescription(rawDescription) : '';
  if (description.length === 0) {
    description = clampDescription(summarizeBody(record.body));
    if (description.length === 0) description = 'Instructions imported from ' + record.relativeFile;
    else warnings.push('description derived from the first paragraph');
  }
  if (description.length === 0) return { definition: undefined, warnings, reason: 'no description could be derived for ' + record.file };

  const invocation = invocationFor(record.dialect, data);
  const whenToUseRaw = pick(data, ['when_to_use', 'whenToUse', 'when-to-use']);
  const whenToUse = typeof whenToUseRaw === 'string' && whenToUseRaw.trim().length > 0 && whenToUseRaw !== rawDescription ? whenToUseRaw.trim() : undefined;

  const grants = describeToolGrants(pick(data, ['allowed-tools', 'allowedTools', 'allowed_tools', 'tools']));
  const argumentHint = pick(data, ['argument-hint', 'argumentHint']);
  const commandNotes = [];
  if (typeof argumentHint === 'string' && options.includeCommandArgumentHint !== false) {
    commandNotes.push('expected invocation: ' + argumentHint.trim());
  }

  // An argument hint is useful for any skill the user can invoke by name, not
  // only for slash commands: it tells the model what a good request looks like.
  const carriedHint = argumentHint !== undefined && options.includeCommandArgumentHint !== false;
  const commandBody = carriedHint ? commandNotes.join('; ') : '';
  const content = composeContent(record, { grants, resourceDirs }) + (commandBody.length > 0 ? '\n> ' + commandBody + '.\n' : '');

  const metadata = {
    dialect: record.dialect,
    origin: record.file,
    root: record.root,
    ...(typeof data.license === 'string' ? { license: data.license } : {}),
    ...(typeof data.version === 'string' ? { version: data.version } : {}),
    ...(data.metadata !== null && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? data.metadata : {}),
  };
  if (data.metadata !== null && typeof data.metadata === 'object' && !Array.isArray(data.metadata)) {
    for (const [key, value] of Object.entries(data.metadata)) {
      if (typeof value === 'string') metadata[key] = value;
    }
  }

  const definition = {
    name,
    description,
    invocation: { modelInvocable: invocation.modelInvocable, userInvocable: invocation.userInvocable },
    source: record.dialect + ':' + record.relativeFile,
    provider: providerName,
    rank: (DIALECT_RANK[record.dialect] ?? 300) + (Number.isFinite(options.rankBoost) ? options.rankBoost : 0),
    locator: { file: record.file, dialect: record.dialect, root: record.root },
    path: record.file,
    resourceBase: { kind: 'directory', path: record.dir },
    ...(whenToUse === undefined ? {} : { whenToUse }),
    metadata,
    content,
  };
  return { definition, warnings };
}
