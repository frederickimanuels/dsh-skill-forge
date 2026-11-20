/**
 * Filesystem discovery for foreign skills.
 *
 * The scan is intentionally shallow and conservative: a skill catalog is
 * model-facing, so anything that is not clearly an instruction file (a README,
 * a changelog, the Markdown inside a bundle's `references/`) must not become a
 * skill. Three rules encode that:
 *
 * 1. A directory containing `SKILL.md` is a bundle. The bundle's `SKILL.md`
 *    is the skill; sibling Markdown is a resource and the walk does not
 *    descend into it.
 * 2. A file is an instruction file when its dialect says so (see
 *    `dialects.js`), never merely because it ends in `.md`.
 * 3. Repository boilerplate names are excluded by default.
 *
 * @module dsh-skill-forge/discover
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { DIALECT, detectDialect } from './dialects.js';
import { splitFrontmatter } from './frontmatter.js';

/** Directories that never contain skills worth importing. */
export const DEFAULT_EXCLUDES = Object.freeze([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.next',
  '.cache',
  'coverage',
]);

/** Instruction-file basenames that are repository boilerplate, not skills. */
const BOILERPLATE = new Set([
  'readme.md',
  'changelog.md',
  'changes.md',
  'license.md',
  'notice.md',
  'contributing.md',
  'code_of_conduct.md',
  'security.md',
  'support.md',
  'authors.md',
  'history.md',
  'releases.md',
]);

/** Largest instruction file the scan will read, in bytes. */
const MAX_INSTRUCTION_BYTES = 512 * 1024;

/**
 * Expand `~` and resolve a root against a working directory.
 * @param {string} root - configured root.
 * @param {string} cwd - working directory the roots are relative to.
 * @returns {string} absolute path.
 */
export function resolveRoot(root, cwd) {
  const text = String(root ?? '').trim();
  if (text.length === 0) return path.resolve(cwd);
  if (text === '~') return homedir();
  if (text.startsWith('~/') || text.startsWith('~' + path.sep)) return path.join(homedir(), text.slice(2));
  return path.isAbsolute(text) ? path.normalize(text) : path.resolve(cwd, text);
}

/**
 * Scan one root for instruction files.
 *
 * @param {string} root - absolute root path.
 * @param {object} [options] - scan limits.
 * @param {number} [options.depth] - maximum directory depth below the root.
 * @param {boolean} [options.includeLoose] - admit frontmatter-less Markdown that no dialect claims.
 * @param {readonly string[]} [options.exclude] - directory names to skip.
 * @param {number} [options.maxFiles] - hard cap on discovered skills.
 * @returns {Promise<{ skills: Array<Record<string, unknown>>, truncated: boolean, error: string | undefined }>}
 */
export async function scanRoot(root, options = {}) {
  const depth = Number.isFinite(options.depth) ? Math.max(1, Math.floor(options.depth)) : 3;
  // Configured excludes are additive: an operator adding `coverage` must not
  // accidentally start importing `node_modules`.
  const exclude = new Set([...DEFAULT_EXCLUDES, ...(options.exclude ?? [])].map((entry) => String(entry).toLowerCase()));
  const includeLoose = options.includeLoose === true;
  const maxFiles = Number.isFinite(options.maxFiles) ? Math.max(1, Math.floor(options.maxFiles)) : 500;
  const visited = new Set();
  const skills = [];
  let truncated = false;

  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (error) {
    return { skills, truncated, error: describeFsError(root, error) };
  }

  if (rootStat.isFile()) {
    const skill = await inspectFile(root, root, { includeLoose, isRoot: true });
    if (skill !== undefined) skills.push(skill);
    return { skills, truncated, error: undefined };
  }

  /** Walk one directory; `relativePath` is the path shown to the model. */
  const walk = async (dir, segments, level) => {
    if (level > depth || truncated) return;
    let real;
    try {
      real = await realpath(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    // Rule 1: a directory holding SKILL.md is a bundle; do not descend into it.
    const isBundle = entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'skill.md');

    for (const entry of entries) {
      if (truncated) return;
      const full = path.join(dir, entry.name);
      const lower = entry.name.toLowerCase();
      if (entry.isDirectory()) {
        if (exclude.has(lower)) continue;
        if (isBundle) continue;
        await walk(full, [...segments, lower], level + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!lower.endsWith('.md') && !lower.endsWith('.mdc') && lower !== '.cursorrules') continue;
      if (BOILERPLATE.has(lower)) continue;
      if (isBundle && lower !== 'skill.md') continue;
      const skill = await inspectFile(full, root, { includeLoose, isRoot: false, segments });
      if (skill === undefined) continue;
      if (skill.dialect === DIALECT.looseMarkdown && !includeLoose) continue;
      skills.push(skill);
      if (skills.length >= maxFiles) {
        truncated = true;
        return;
      }
    }
  };

  await walk(root, [], 0);
  return { skills, truncated, error: undefined };
}

/**
 * Recognize a redirect file.
 *
 * `CLAUDE.md` is conventionally one line, `@AGENTS.md`, meaning "read that
 * file instead". Importing the redirect as a skill publishes a catalog entry
 * whose whole body is a path - noise next to the real instructions, which are
 * imported separately. Such a file has no content of its own.
 *
 * @param {string} body - Markdown body with frontmatter removed.
 * @returns {string[]} referenced paths, or an empty array when the body says more.
 */
function redirectTargets(body) {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.startsWith('#') === false);
  if (lines.length === 0) return [];
  const targets = [];
  for (const line of lines) {
    const match = /^@([^\s]+)$/.exec(line);
    if (match === null) return [];
    targets.push(match[1]);
  }
  return targets;
}

/**
 * Read one file and describe it as a discovered skill, or `undefined` when it
 * is not an instruction file.
 *
 * @param {string} filePath - absolute path.
 * @param {string} root - root the file was found under.
 * @param {object} context - scan context.
 * @returns {Promise<Record<string, unknown> | undefined>}
 */
async function inspectFile(filePath, root, context) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return undefined;
  }
  if (!fileStat.isFile() || fileStat.size === 0 || fileStat.size > MAX_INSTRUCTION_BYTES) return undefined;

  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
  if (text.trim().length === 0) return undefined;

  const baseName = path.basename(filePath);
  const dir = path.dirname(filePath);
  const relativeDir = path.relative(root, dir);
  const segments = relativeDir.length === 0 ? [] : relativeDir.split(path.sep).filter((segment) => segment.length > 0).map((segment) => segment.toLowerCase());
  const split = splitFrontmatter(text);
  const dialect = detectDialect({
    filePath,
    baseName,
    segments: [...segments, baseName.toLowerCase()],
    frontmatter: split.data,
    hasFrontmatter: split.raw !== undefined,
  });

  return {
    dialect,
    file: filePath,
    dir,
    baseName,
    root,
    redirectTargets: redirectTargets(split.body),
    relativeFile: path.relative(root, filePath) || baseName,
    relativeDir,
    frontmatter: split.data,
    frontmatterRaw: split.raw,
    body: split.body,
    frontmatterError: split.error,
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    isBundleRoot: baseName.toLowerCase() === 'skill.md',
  };
}

function describeFsError(target, error) {
  const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'ENOENT') return 'root ' + target + ' does not exist';
  if (code === 'EACCES' || code === 'EPERM') return 'root ' + target + ' is not readable';
  if (code === 'ENOTDIR') return 'root ' + target + ' is not a directory';
  return 'root ' + target + ' could not be scanned: ' + (error instanceof Error ? error.message : String(error));
}

/**
 * Scan several roots and merge the results, keeping discovery order stable so
 * candidate ranking is deterministic.
 *
 * @param {object} options - scan configuration.
 * @param {readonly string[]} options.roots - configured roots.
 * @param {string} options.cwd - working directory.
 * @param {number} [options.depth] - recursion limit.
 * @param {boolean} [options.includeLoose] - admit frontmatter-less Markdown.
 * @param {readonly string[]} [options.exclude] - excluded directories.
 * @param {number} [options.maxFiles] - total cap.
 * @returns {Promise<{ skills: Array<Record<string, unknown>>, roots: Array<{ path: string, count: number, error?: string }>, truncated: boolean }>}
 */
export async function discoverSkills(options) {
  const cwd = options.cwd;
  const roots = options.roots ?? [];
  const maxFiles = Number.isFinite(options.maxFiles) ? Math.max(1, Math.floor(options.maxFiles)) : 500;
  const seen = new Set();
  const skills = [];
  const reports = [];
  let truncated = false;
  for (const configured of roots) {
    const root = resolveRoot(configured, cwd);
    if (seen.has(root)) continue;
    seen.add(root);
    const result = await scanRoot(root, {
      depth: options.depth,
      includeLoose: options.includeLoose,
      exclude: options.exclude,
      maxFiles: Math.max(1, maxFiles - skills.length),
    });
    const report = { path: root, count: result.skills.length };
    if (result.error !== undefined) report.error = result.error;
    reports.push(report);
    for (const skill of result.skills) {
      if (skills.length >= maxFiles) {
        truncated = true;
        break;
      }
      // Keep the resolved root: rehydration rebuilds relative paths from it.
      skill.root = root;
      skills.push(skill);
    }
    if (result.truncated) truncated = true;
    if (skills.length >= maxFiles) break;
  }
  return { skills, roots: reports, truncated };
}

/**
 * List the files a bundle exposes as loadable resources.
 *
 * @param {string} dir - bundle directory.
 * @param {readonly string[]} resourceDirs - candidate subdirectory names.
 * @param {number} [limit] - maximum entries per directory.
 * @returns {Promise<{ dirs: string[], files: Array<{ path: string, dir: string }> }>}
 */
export async function listResources(dir, resourceDirs, limit = 60) {
  const dirs = [];
  const files = [];
  for (const name of resourceDirs) {
    let entries;
    try {
      entries = await readdir(path.join(dir, name), { withFileTypes: true });
    } catch {
      continue;
    }
    const usable = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
    if (usable.length === 0) continue;
    dirs.push(name + '/ (' + usable.length + ' file' + (usable.length === 1 ? '' : 's') + ')');
    for (const fileName of usable.slice(0, limit)) files.push({ dir: name, path: name + '/' + fileName });
  }
  return { dirs, files };
}
