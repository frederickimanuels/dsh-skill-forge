/**
 * Store operations shared by the CLI and the settings UI.
 *
 * The plugin publishes whatever it finds under its roots; this module is the
 * write side - bringing a foreign skill repository into the store and taking
 * one back out again. Keeping it here (rather than in the CLI) is what lets the
 * browser half do exactly what `dsh-skill-forge import` does, with the same
 * discovery rules, the same dialect adaptation and the same names.
 *
 * Nothing in this module touches a harness service: it takes a store directory
 * and returns plain data, so it is testable on its own.
 *
 * @module dsh-skill-forge/store
 */

import { cp, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DIALECT_LABEL } from './dialects.js';
import { discoverSkills, resolveRoot } from './discover.js';
import { SKILL_NAME, adaptRecord, slugify } from './adapt.js';
import { checkPublishable } from './validate.js';

const execFileAsync = promisify(execFile);

/** Where imported skills are copied when no store is given. */
export const DEFAULT_STORE = path.join(homedir(), '.dsh', 'skill-forge');

/** File names that are never copied out of a source tree. */
const COPY_SKIPS = new Set(['.git', 'node_modules', '.DS_Store']);

/** The dialect label a UI should show, falling back to the raw id. */
export function dialectLabel(dialect) {
  return DIALECT_LABEL[dialect] ?? String(dialect);
}

/**
 * Resolve the store directory for one working directory.
 * @param {string | undefined} store - configured store, or undefined for the default.
 * @param {string} cwd - working directory used to resolve a relative path.
 * @returns {string} absolute store path.
 */
export function storePath(store, cwd) {
  return resolveRoot(typeof store === 'string' && store.length > 0 ? store : DEFAULT_STORE, cwd);
}

/**
 * Adapt one discovered record the way the provider will, keeping names unique.
 * @param {Record<string, unknown>} record - a record from `discoverSkills`.
 * @param {Set<string>} taken - names already claimed in this batch.
 * @returns {{ definition?: Record<string, unknown>, warnings: string[], reason?: string }}
 */
export function nameFor(record, taken) {
  return adaptRecord(record, {
    providerName: 'skill-forge',
    uniqueName: (name) => {
      if (!taken.has(name)) return name;
      for (let suffix = 2; suffix < 100; suffix += 1) {
        const candidate = slugify(name + '-' + suffix);
        if (!taken.has(candidate)) return candidate;
      }
      return slugify(name + '-' + taken.size);
    },
  });
}

/**
 * Turn discovered records into the publishable rows a UI or the CLI shows.
 * @param {Array<Record<string, unknown>>} records - discovered skill records.
 * @returns {Array<{ record: Record<string, unknown>, definition: Record<string, unknown> }>} publishable rows.
 */
export function publishableRows(records) {
  const taken = new Set();
  const rows = [];
  for (const record of records) {
    const adapted = nameFor(record, taken);
    if (adapted.definition === undefined) continue;
    if (checkPublishable(adapted.definition, 'skill-forge').ok !== true) continue;
    taken.add(adapted.definition.name);
    rows.push({ record, definition: adapted.definition });
  }
  return rows;
}

/**
 * Describe one publishable row as plain JSON for a browser.
 * @param {{ record: Record<string, unknown>, definition: Record<string, unknown> }} row - a publishable row.
 * @returns {Record<string, unknown>} the wire shape.
 */
export function describeRow(row) {
  const { record, definition } = row;
  return {
    name: definition.name,
    description: typeof definition.description === 'string' ? definition.description : '',
    dialect: record.dialect,
    dialectLabel: dialectLabel(record.dialect),
    source: definition.source,
    file: record.file,
    dir: record.dir,
    relativeFile: record.relativeFile,
    rank: definition.rank,
    modelInvocable: definition.invocation?.modelInvocable === true,
    userInvocable: definition.invocation?.userInvocable === true,
    resources: Array.isArray(record.resourceDirs) ? record.resourceDirs : [],
    size: typeof record.size === 'number' ? record.size : undefined,
    mtimeMs: typeof record.mtimeMs === 'number' ? record.mtimeMs : undefined,
  };
}

/**
 * Read what the store currently holds.
 *
 * A store can outgrow the discovery budget (a corpus of a few hundred skills
 * does it), so the listing says so instead of quietly reporting a short count:
 * `truncated` is true and `maxFiles` names the cap that was hit.
 *
 * @param {{ store?: string, cwd?: string, loose?: boolean, depth?: number, maxFiles?: number }} options - read options.
 * @returns {Promise<{ store: string, exists: boolean, skills: Array<Record<string, unknown>>, truncated: boolean, maxFiles: number, errors: string[] }>} the store listing.
 */
export async function listStore(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const store = storePath(options.store, cwd);
  const maxFiles = Number.isFinite(options.maxFiles) ? Math.max(1, Math.floor(options.maxFiles)) : 2000;
  const exists = await stat(store).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (exists === false) return { store, exists, skills: [], truncated: false, maxFiles, errors: [] };
  const discovery = await discoverSkills({
    roots: [store],
    cwd,
    depth: Number.isFinite(options.depth) ? options.depth : 3,
    includeLoose: options.loose === true,
    maxFiles,
  });
  return {
    store,
    exists,
    skills: publishableRows(discovery.skills).map(describeRow),
    truncated: discovery.truncated === true,
    maxFiles,
    errors: discovery.roots.filter((root) => root.error !== undefined).map((root) => String(root.error)),
  };
}

/**
 * Materialize a source into a local directory, cloning git URLs.
 * @param {string} source - local path or git URL.
 * @param {string} cwd - working directory for a relative path.
 * @returns {Promise<{ dir: string, cleanup: () => Promise<void> }>} the local directory.
 */
export async function materialize(source, cwd) {
  const isUrl = /^(https?:\/\/|git@|ssh:\/\/)/.test(source);
  if (isUrl === false) {
    const dir = resolveRoot(source, cwd);
    const info = await stat(dir);
    if (info.isDirectory() === false && info.isFile() === false) throw new Error('not a file or directory: ' + dir);
    return { dir, cleanup: async () => {} };
  }
  const staging = await mkdtemp(path.join(tmpdir(), 'skill-forge-clone-'));
  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--quiet', source, staging], { timeout: 120_000 });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error('could not clone ' + source + ': ' + message);
  }
  return { dir: staging, cleanup: async () => rm(staging, { recursive: true, force: true }) };
}

/**
 * Work out what importing a source would copy, without touching the store.
 * @param {{ source: string, cwd?: string, loose?: boolean, depth?: number }} options - preview options.
 * @returns {Promise<{ source: string, dir: string, skills: Array<Record<string, unknown>>, cleanup: () => Promise<void> }>} the plan.
 */
export async function previewImport(options) {
  const cwd = options.cwd ?? process.cwd();
  if (typeof options.source !== 'string' || options.source.trim().length === 0) throw new Error('import needs a source: a directory, a file, or a git URL');
  const { dir, cleanup } = await materialize(options.source.trim(), cwd);
  try {
    const discovery = await discoverSkills({
      roots: [dir],
      cwd,
      depth: Number.isFinite(options.depth) ? options.depth : 4,
      includeLoose: options.loose === true,
    });
    const skills = publishableRows(discovery.skills).map(describeRow);
    return { source: options.source.trim(), dir, skills, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * Copy discovered skills from a source into the store.
 *
 * A bundle skill (`SKILL.md`) is copied whole so its `references/`,
 * `scripts/` and `assets/` keep resolving; a single-file skill becomes a
 * one-file directory named after the skill.
 *
 * @param {{ source: string, store?: string, cwd?: string, loose?: boolean, depth?: number, force?: boolean, dryRun?: boolean }} options - import options.
 * @returns {Promise<{ store: string, source: string, imported: string[], skipped: string[], planned: string[], dialects: Record<string, string> }>} what happened.
 */
export async function importSkills(options) {
  const cwd = options.cwd ?? process.cwd();
  const store = storePath(options.store, cwd);
  const preview = await previewImport({ ...options, cwd });
  try {
    const planned = preview.skills.map((skill) => skill.name);
    const dialects = Object.fromEntries(preview.skills.map((skill) => [skill.name, skill.dialect]));
    if (options.dryRun === true || preview.skills.length === 0) {
      return { store, source: preview.source, imported: [], skipped: [], planned, dialects };
    }
    await mkdir(store, { recursive: true });
    const imported = [];
    const skipped = [];
    for (const skill of preview.skills) {
      const destination = path.join(store, skill.name);
      const exists = await stat(destination).then(
        () => true,
        () => false,
      );
      if (exists === true && options.force !== true) {
        skipped.push(skill.name);
        continue;
      }
      if (exists === true) await rm(destination, { recursive: true, force: true });
      await mkdir(destination, { recursive: true });
      const isBundle = path.basename(String(skill.file)).toLowerCase() === 'skill.md';
      const from = isBundle ? String(skill.dir) : String(skill.file);
      const to = isBundle ? destination : path.join(destination, path.basename(String(skill.file)));
      await cp(from, to, {
        recursive: true,
        filter: (file) => COPY_SKIPS.has(path.basename(file)) === false,
      });
      imported.push(skill.name);
    }
    return { store, source: preview.source, imported, skipped, planned, dialects };
  } finally {
    await preview.cleanup();
  }
}

/**
 * Delete one skill directory from the store.
 *
 * Only kebab-case names are accepted and the resolved target must sit directly
 * inside the store, so a browser client cannot ask for `../../etc`.
 *
 * @param {{ name: string, store?: string, cwd?: string }} options - removal options.
 * @returns {Promise<{ store: string, name: string, removed: boolean, path: string }>} the outcome.
 */
export async function removeSkill(options) {
  const cwd = options.cwd ?? process.cwd();
  const store = storePath(options.store, cwd);
  const name = typeof options.name === 'string' ? options.name.trim() : '';
  if (SKILL_NAME.test(name) === false) throw new Error('refusing to remove "' + name + '": not a skill name');
  const target = path.resolve(store, name);
  if (path.dirname(target) !== path.resolve(store)) throw new Error('refusing to remove "' + name + '": outside the store');
  const exists = await stat(target).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (exists === false) return { store, name, removed: false, path: target };
  await rm(target, { recursive: true, force: true });
  return { store, name, removed: true, path: target };
}

/**
 * List the top-level entries of the store, including ones that hold no skill.
 * @param {{ store?: string, cwd?: string }} options - read options.
 * @returns {Promise<string[]>} directory names in the store.
 */
export async function storeEntries(options = {}) {
  const store = storePath(options.store, options.cwd ?? process.cwd());
  const entries = await readdir(store, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.') === false).map((entry) => entry.name);
}
