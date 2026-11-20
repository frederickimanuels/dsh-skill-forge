/**
 * Re-reading one skill from disk.
 *
 * The registry caches candidates but not definitions: `get()` is called every
 * time a model actually loads a skill, and the author may have edited the file
 * since the scan. Re-reading has one more use - a candidate handed back by the
 * registry after our own cache was cleared (a fresh process, or a watcher that
 * fired) must still resolve.
 *
 * @module dsh-skill-forge/rehydrate
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { adaptRecord } from './adapt.js';
import { RESOURCE_DIRS, detectDialect } from './dialects.js';
import { listResources } from './discover.js';
import { splitFrontmatter } from './frontmatter.js';

/**
 * Re-derive a skill definition from its file.
 *
 * @param {string} file - absolute path of the instruction file.
 * @param {Record<string, unknown>} candidate - the candidate being resolved.
 * @param {object} options - adaptation options.
 * @param {string} options.providerName - provider name.
 * @param {number} [options.rankBoost] - rank adjustment.
 * @returns {Promise<Record<string, unknown> | undefined>} the definition, or `undefined` when the file is gone.
 */
export async function rehydrate(file, candidate, options) {
  let fileStat;
  try {
    fileStat = await stat(file);
  } catch {
    return undefined;
  }
  if (!fileStat.isFile()) return undefined;

  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }

  const dir = path.dirname(file);
  const baseName = path.basename(file);
  const locator = candidate?.locator ?? {};
  const root = typeof locator.root === 'string' ? locator.root : dir;
  const relativeDir = path.relative(root, dir);
  const segments = relativeDir.length === 0 ? [] : relativeDir.split(path.sep).filter((segment) => segment.length > 0).map((segment) => segment.toLowerCase());
  const split = splitFrontmatter(text);
  const dialect = detectDialect({
    filePath: file,
    baseName,
    segments: [...segments, baseName.toLowerCase()],
    frontmatter: split.data,
    hasFrontmatter: split.raw !== undefined,
  });

  const resources = await listResources(dir, RESOURCE_DIRS);
  const record = {
    dialect,
    file,
    dir,
    baseName,
    root,
    relativeFile: path.relative(root, file) || baseName,
    relativeDir,
    frontmatter: split.data,
    frontmatterRaw: split.raw,
    body: split.body,
    frontmatterError: split.error,
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    isBundleRoot: baseName.toLowerCase() === 'skill.md',
    resourceDirs: resources.dirs,
  };

  // Reuse the published name: a re-read must not rename the skill the model
  // asked for.
  const adapted = adaptRecord(record, {
    providerName: options.providerName,
    rankBoost: options.rankBoost,
    uniqueName: () => (typeof candidate?.name === 'string' ? candidate.name : undefined),
  });
  return adapted.definition;
}
