/**
 * The `skill-forge` skill provider.
 *
 * The harness asks a provider two questions: which candidates exist for a
 * working directory, and what the definition behind one candidate is. This
 * module answers both by scanning the configured roots, adapting every
 * instruction file it finds, and re-reading a file on demand so an edited
 * skill always loads with its current text.
 *
 * Scanning is cached for the duration of one `collect()` revision: the
 * registry invalidates on its own schedule, and a filesystem walk per tool call
 * would be wasteful. A dependency-free `fs.watch` on each root keeps the
 * catalog live, mirroring the bundled filesystem provider, without pulling
 * chokidar into the host.
 *
 * @module dsh-skill-forge/provider
 */

import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { adaptRecord, slugify } from './adapt.js';
import { discoverSkills, listResources, resolveRoot } from './discover.js';
import { RESOURCE_DIRS } from './dialects.js';
import { checkPublishable } from './validate.js';

/**
 * Project-relative locations that ecosystems conventionally use. They are only
 * scanned when `autoDiscover` is on, and a missing one is simply skipped.
 * @type {readonly string[]}
 */
export const PROJECT_GLOBS = Object.freeze([
  '.claude/skills',
  '.claude/commands',
  '.agents/skills',
  '.cursor/rules',
  '.cursorrules',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
]);

/**
 * Create the provider object handed to `ctx.skills.registerProvider`.
 *
 * @param {object} options - construction options.
 * @param {Record<string, unknown>} options.config - resolved plugin config.
 * @param {string} options.providerName - provider name to stamp on candidates.
 * @param {{ warn: (message: string) => void, debug?: (message: string) => void }} [options.logger] - host logger.
 * @returns {{ name: string, list: Function, get: Function, dispose: Function }}
 */
/**
 * Find the closest ancestor of `target` that exists, so a watcher can be
 * placed there while `target` itself is still missing.
 * @param {string} target - absolute path that may not exist yet.
 * @returns {string | undefined} existing ancestor, or undefined at the root.
 */
function nearestExistingParent(target) {
  let current = path.dirname(target);
  for (let level = 0; level < 64; level += 1) {
    if (existsSync(current)) return current === target ? undefined : current;
    const next = path.dirname(current);
    if (next === current) return undefined;
    current = next;
  }
  return undefined;
}

export function createSkillForgeProvider(options) {
  const config = options.config ?? {};
  const providerName = options.providerName;
  const logger = options.logger;
  const warn = (message) => {
    if (logger !== undefined && typeof logger.warn === 'function') logger.warn('skill-forge: ' + message);
  };
  const info = (message) => {
    if (config.logAdaptations === false) return;
    if (logger !== undefined && typeof logger.info === 'function') logger.info('skill-forge: ' + message);
  };

  /** @type {Map<string, { skills: Array<Record<string, unknown>>, truncated: boolean, roots: Array<Record<string, unknown>> }>} */
  const caches = new Map();
  /** @type {Map<string, { watchers: import('node:fs').FSWatcher[], timer: NodeJS.Timeout | undefined }>} */
  const watchers = new Map();
  let control;
  let disposed = false;

  const currentControl = () => control;

  /**
   * Resolve the roots for one working directory: configured roots plus the
   * project-local conventions, in the order the author expects.
   * @param {string} cwd - working directory.
   * @returns {string[]} absolute roots, deduplicated.
   */
  const rootsFor = (cwd) => {
    const configured = Array.isArray(config.roots) ? config.roots : [];
    const roots = [];
    for (const entry of configured) roots.push(resolveRoot(entry, cwd));
    if (config.autoDiscover !== false) {
      for (const relative of PROJECT_GLOBS) roots.push(path.resolve(cwd, relative));
    }
    const seen = new Set();
    return roots.filter((root) => {
      if (seen.has(root)) return false;
      seen.add(root);
      return true;
    });
  };

  /** Debounced "the catalog changed" signal shared by every watcher. */
  const scheduleInvalidate = (entry) => () => {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      caches.clear();
      const active = currentControl();
      if (active !== undefined) active.invalidate();
    }, 250);
    if (typeof entry.timer.unref === 'function') entry.timer.unref();
  };

  /** Install one watcher, returning it or undefined when it cannot be created. */
  const openWatcher = (target, options, onEvent) => {
    try {
      const watcher = watch(target, { ...options, persistent: false }, onEvent);
      watcher.on('error', () => {
        try {
          watcher.close();
        } catch {
          /* already closed */
        }
      });
      return watcher;
    } catch {
      return undefined;
    }
  };

  const ensureWatchers = (roots) => {
    if (config.watch === false) return;
    for (const root of roots) {
      if (watchers.has(root) || disposed) continue;
      const entry = { watchers: [], timer: undefined, parent: false };
      const invalidateLater = scheduleInvalidate(entry);

      const watcher = openWatcher(root, { recursive: true }, invalidateLater);
      if (watcher !== undefined) {
        entry.watchers.push(watcher);
        watchers.set(root, entry);
        continue;
      }

      // The root does not exist yet - the common case for a store the operator
      // has not populated. Watching the nearest existing ancestor keeps the
      // catalog live so a later `forge import` shows up without a restart.
      const parent = nearestExistingParent(root);
      if (parent === undefined) continue;
      entry.parent = true;
      const parentWatcher = openWatcher(parent, { recursive: false }, () => {
        // The root may exist now: upgrade to a real recursive watcher before
        // signalling, otherwise later edits inside it stay invisible.
        if (entry.parent === true) {
          const upgrade = openWatcher(root, { recursive: true }, invalidateLater);
          if (upgrade !== undefined) {
            entry.parent = false;
            entry.watchers.push(upgrade);
            for (const existing of entry.watchers) {
              if (existing === parentWatcher) {
                try {
                  existing.close();
                } catch {
                  /* already closed */
                }
              }
            }
          }
        }
        invalidateLater();
      });
      if (parentWatcher === undefined) continue;
      entry.watchers.push(parentWatcher);
      watchers.set(root, entry);
    }
  };

  /**
   * Scan and adapt every root for a working directory.
   * @param {string} cwd - working directory.
   * @param {AbortSignal | undefined} signal - cancellation.
   * @returns {Promise<{ candidates: Array<Record<string, unknown>>, complete: boolean }>}
   */
  const collect = async (cwd, signal) => {
    const cached = caches.get(cwd);
    if (cached !== undefined) {
      return { candidates: cached.skills.map((skill) => skill.definition), complete: !cached.truncated };
    }
    const roots = rootsFor(cwd);
    ensureWatchers(roots);
    const discovered = await discoverSkills({
      roots,
      cwd,
      depth: config.depth,
      includeLoose: config.includeLoose === true,
      exclude: config.exclude,
      maxFiles: config.maxFiles,
    });
    if (signal !== undefined && signal.aborted === true) throw new Error('skill-forge scan was aborted');

    const names = new Set();
    const deny = new Set((Array.isArray(config.deny) ? config.deny : []).map((entry) => String(entry)));
    const skills = [];
    for (const record of discovered.skills) {
      if (signal !== undefined && signal.aborted === true) throw new Error('skill-forge scan was aborted');
      const resources = await listResources(record.dir, RESOURCE_DIRS);
      record.resourceDirs = resources.dirs;
      const adapted = adaptRecord(record, {
        providerName,
        rankBoost: config.rankBoost,
        includeCommandArgumentHint: config.includeCommandArgumentHint !== false,
        uniqueName: (name) => {
          if (!names.has(name)) return name;
          for (let suffix = 2; suffix < 100; suffix += 1) {
            const candidate = slugify(name + '-' + suffix);
            if (!names.has(candidate)) return candidate;
          }
          return slugify(name + '-' + names.size);
        },
      });
      for (const warning of adapted.warnings) warn(warning + ' (' + record.file + ')');
      if (adapted.definition === undefined) {
        warn('skipped ' + record.file + ': ' + adapted.reason);
        continue;
      }
      if (deny.has(adapted.definition.name)) continue;
      const publishable = checkPublishable(adapted.definition, providerName);
      if (publishable.ok !== true) {
        warn('skipped ' + record.file + ': ' + publishable.violations.join('; '));
        continue;
      }
      names.add(adapted.definition.name);
      info('published ' + adapted.definition.name + ' (' + record.dialect + ') from ' + record.file);
      skills.push({ record, definition: adapted.definition });
    }
    for (const root of discovered.roots) {
      if (root.error !== undefined) warn(root.error);
    }
    caches.set(cwd, { skills, truncated: discovered.truncated, roots: discovered.roots });
    return { candidates: skills.map((skill) => skill.definition), complete: !discovered.truncated };
  };

  const provider = {
    name: providerName,

    /**
     * Report the candidates visible from one working directory.
     * @param {{ cwd?: string, signal?: AbortSignal }} options - registry lookup options.
     */
    async list(options = {}) {
      const cwd = typeof options.cwd === 'string' && options.cwd.length > 0 ? options.cwd : process.cwd();
      return collect(cwd, options.signal);
    },

    /**
     * Load one candidate's definition, re-reading its file so edits take effect
     * immediately and a deleted skill disappears instead of serving stale text.
     * @param {Record<string, unknown>} candidate - a candidate previously returned by `list`.
     * @param {{ cwd?: string, signal?: AbortSignal }} options - registry lookup options.
     */
    async get(candidate, options = {}) {
      const locator = candidate?.locator;
      const file = locator !== null && typeof locator === 'object' ? locator.file : undefined;
      if (typeof file !== 'string') return undefined;
      const cwd = typeof options.cwd === 'string' && options.cwd.length > 0 ? options.cwd : process.cwd();
      const cached = caches.get(cwd);
      const entry = cached?.skills.find((skill) => skill.definition.name === candidate.name);
      if (entry !== undefined) return entry.definition;

      // A candidate that survived registry caching but not our cache: re-read
      // the file rather than failing, so a fresh process still resolves it.
      const { rehydrate } = await import('./rehydrate.js');
      const definition = await rehydrate(file, candidate, { providerName, rankBoost: config.rankBoost });
      if (definition === undefined) {
        warn('skill "' + String(candidate.name) + '" was removed from disk; it is no longer available');
        return undefined;
      }
      return definition;
    },

    /**
     * Stop filesystem watchers. Called from the plugin disposer.
     */
    dispose() {
      disposed = true;
      for (const entry of watchers.values()) {
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        for (const watcher of entry.watchers) {
          try {
            watcher.close();
          } catch {
            /* already closed */
          }
        }
      }
      watchers.clear();
      caches.clear();
    },
  };

  /**
   * Bind the registry control handle so watcher-driven invalidations reach it.
   * @param {{ signal: AbortSignal, invalidate: () => void }} handle - registry control.
   */
  provider.bind = (handle) => {
    control = handle;
  };

  return provider;
}
