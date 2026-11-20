/**
 * dsh-skill-forge - imports foreign AI skills into DeepSeek Harness.
 *
 * Plugins in this harness are cordis plugins: a module exporting `name`,
 * the services it `inject`s, an optional `Config` schema, and `apply`.
 * This one registers a single skill provider. The provider contract lives in
 * `@deepseek-ai/dsh-skill`, which the host already resolves, so the plugin
 * needs no runtime dependencies and no build step.
 *
 * @module dsh-skill-forge
 */

import z from '@deepseek-ai/schemastery';
import { createSkillForgeProvider } from './provider.js';
import { BRIDGE_PREFIX, createBridgeRoutes } from './bridge.js';
import { DEFAULT_STORE } from './store.js';
import { RESERVED_PROVIDER } from './validate.js';

/** Plugin name shown in `dsh --dump-config`. */
export const name = 'skill-forge';

/** The registry service this plugin publishes skills through. */
export const inject = ['skills'];

/**
 * Plugin configuration.
 *
 * Defaults are chosen so that adding the plugin to a profile does something
 * useful with no configuration at all: it reads the conventional project
 * locations plus `~/.dsh/skill-forge`, and publishes whatever it finds.
 */
export const Config = z.object({
  providerName: z.string().default('skill-forge').description('Provider name stamped on every imported skill; must stay unique per profile and must not be "runtime".'),
  roots: z.array(z.string()).default(['~/.dsh/skill-forge']).description('Directories or files to import. Relative paths resolve against the agent working directory; ~ expands to the home directory.'),
  autoDiscover: z.boolean().default(true).description('Also scan the project-local conventions (.claude/skills, .agents/skills, .cursor/rules, AGENTS.md, CLAUDE.md, and friends) from the agent working directory.'),
  includeLoose: z.boolean().default(false).description('Import Markdown files that have no frontmatter and belong to no known dialect. Off by default: a README next to a skill would otherwise become one.'),
  depth: z.number().default(3).description('Maximum directory depth below each root when looking for skills.'),
  maxFiles: z.number().default(500).description('Maximum number of imported skills per working directory.'),
  exclude: z.array(z.string()).default([]).description('Extra directory names to skip during discovery, on top of the built-in list (node_modules, .git, dist, ...).'),
  deny: z.array(z.string()).default([]).description('Imported skill names to drop from the catalog, after name normalization.'),
  rankBoost: z.number().default(0).description('Added to each dialect default rank. Lower ranks win when two providers publish the same name; use a negative value to prefer forged skills.'),
  includeCommandArgumentHint: z.boolean().default(true).description('Carry a Claude Code skill\'s argument-hint into the adapted instructions.'),
  watch: z.boolean().default(true).description('Watch the imported roots and refresh the catalog when files change.'),
  logAdaptations: z.boolean().default(true).description('Log one line per imported skill (dialect, name, source) so an operator can see what the plugin picked up.'),
  store: z.string().default(DEFAULT_STORE).description('Directory the settings UI imports into and removes from. The CLI uses the same default; set this when you keep the store somewhere other than ~/.dsh/skill-forge.'),
  ui: z.boolean().default(true).description('Serve the skills management page under Settings > Skills and the HTTP bridge it talks to. Turn it off to load the plugin headless with no web routes.'),
});

/**
 * Register the provider with the skill registry.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {Record<string, unknown>} config - resolved configuration.
 */
export function apply(ctx, config) {
  const providerName = typeof config.providerName === 'string' && config.providerName.length > 0 ? config.providerName : 'skill-forge';
  if (providerName === RESERVED_PROVIDER) {
    ctx.logger.warn('skill-forge: providerName "runtime" is reserved by the skill registry; keeping the provider disabled. Set a different providerName to enable it.');
    return;
  }

  const provider = createSkillForgeProvider({ config, providerName, logger: ctx.logger });

  if (config.ui !== false) registerBridge(ctx, config);

  ctx.effect(() => {
    let dispose;
    try {
      dispose = ctx.skills.registerProvider((control) => {
        provider.bind(control);
        // The provider answers `list` by scanning lazily, so registration does
        // no filesystem work; the first catalog read pays for the scan.
        return {
          name: providerName,
          list: (options) => provider.list(options),
          get: (candidate, options) => provider.get(candidate, options),
        };
      });
    } catch (error) {
      // A duplicate provider name is a profile misconfiguration, not a reason
      // to take the whole profile down: report it and leave the plugin idle.
      ctx.logger.warn('skill-forge: cannot register provider "' + providerName + '": ' + (error instanceof Error ? error.message : String(error)));
      provider.dispose();
      return () => {};
    }
    return () => {
      provider.dispose();
      dispose();
    };
  }, 'skill-forge.provider');
}

/**
 * Serve the settings bridge, when this profile has a web server.
 *
 * The plugin's contract with the harness is the skill provider, so the UI is
 * optional: a headless profile has no `webServer` service and simply never
 * reaches the callback. Registering routes is an exact-path registration, so a
 * second load of the plugin would collide - the effect disposer removes them
 * again on unload.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {Record<string, unknown>} config - resolved configuration.
 */
function registerBridge(ctx, config) {
  ctx.inject(['webServer'], (sctx) => {
    sctx.effect(() => {
      const routes = createBridgeRoutes({
        config,
        defaultStore: DEFAULT_STORE,
        warn: (message) => ctx.logger.warn(message),
      });
      const disposers = [];
      for (const route of routes) {
        const dispose = sctx.get('webServer').register(route);
        disposers.push(dispose);
      }
      return () => {
        for (const dispose of disposers.reverse()) dispose();
      };
    }, 'skill-forge.bridge');
    sctx.logger.debug('skill-forge: serving ' + BRIDGE_PREFIX + ' for the skills page');
  });
}

export default { name, inject, Config, apply };
