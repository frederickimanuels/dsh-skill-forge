/**
 * Locate the harness packages a test needs.
 *
 * The plugin itself imports nothing but host packages, so a test that mounts a
 * real registry has to find the same copies the harness would. The bare
 * specifier resolves when the checkout is linked into `node_modules`; otherwise
 * we fall back to the globally installed `dsh` package, which is where those
 * packages actually live for a running install.
 *
 * @module test/host
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGES = ['cordis', 'schemastery', 'dsh-skill'];

/** Directories that may contain `@deepseek-ai/<pkg>`, most specific first. */
function candidateRoots() {
  const roots = [];
  if (process.env.DSH_PACKAGE_ROOT !== undefined) roots.push(process.env.DSH_PACKAGE_ROOT);
  const local = path.resolve(import.meta.dirname, '..', 'node_modules');
  roots.push(local);
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    roots.push(path.join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules'));
    roots.push(globalRoot);
  } catch {
    /* npm is not on PATH; the remaining roots may still work. */
  }
  return roots;
}

/**
 * Resolve one harness package to a file URL.
 * @param {string} pkg - package name without the scope.
 * @returns {string} a file URL importable by the test.
 */
export function hostPackage(pkg) {
  if (PACKAGES.includes(pkg) === false) throw new Error('unknown host package: ' + pkg);
  for (const root of candidateRoots()) {
    const dir = path.join(root, '@deepseek-ai', pkg);
    if (existsSync(path.join(dir, 'package.json')) === false) continue;
    const require = createRequire(path.join(dir, 'package.json'));
    try {
      return pathToFileURL(require.resolve('@deepseek-ai/' + pkg)).href;
    } catch {
      /* fall through to the next root */
    }
    return pathToFileURL(path.join(dir, 'lib', pkg === 'schemastery' ? 'index.mjs' : 'index.js')).href;
  }
  throw new Error('cannot find @deepseek-ai/' + pkg + '; install the dsh package or set DSH_PACKAGE_ROOT');
}

/** Import the cordis `Context` class the harness boots plugins with. */
export async function loadContext() {
  const mod = await import(hostPackage('cordis'));
  return mod.Context ?? mod.default?.Context ?? mod.default;
}

/** Import the real `SkillRegistry` service. */
export async function loadSkillRegistry() {
  const mod = await import(hostPackage('dsh-skill'));
  return mod.SkillRegistry ?? mod.default;
}

/**
 * Boot an isolated cordis app with a real skill registry mounted.
 * @returns {Promise<{ ctx: object, fork: object, dispose: () => Promise<void> }>}
 */
export async function bootRegistry() {
  const Context = await loadContext();
  const SkillRegistry = await loadSkillRegistry();
  const ctx = new Context();
  const fork = ctx.plugin(SkillRegistry);
  await fork;
  return {
    ctx,
    fork,
    dispose: async () => {
      await fork.dispose?.();
    },
  };
}
