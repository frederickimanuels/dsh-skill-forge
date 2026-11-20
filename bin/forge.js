#!/usr/bin/env node
/**
 * Command line companion for dsh-skill-forge.
 *
 * The plugin imports whatever it finds under its configured roots. This CLI
 * answers the two questions an operator has before that: "what would be
 * imported?" and "how do I get a skill from somewhere else into the store?".
 *
 * Nothing here is required for the plugin to work - the CLI reads the same
 * discovery code the provider uses, so `scan` is an honest preview. The copy,
 * preview and removal helpers live in `src/store.js` so this CLI and the
 * settings UI in `client/` cannot drift apart.
 *
 * @module dsh-skill-forge/cli
 */

import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PROJECT_GLOBS } from '../src/provider.js';
import { DIALECT_LABEL } from '../src/dialects.js';
import { discoverSkills, resolveRoot } from '../src/discover.js';
import { DIALECT_RANK } from '../src/adapt.js';
import {
  DEFAULT_STORE,
  dialectLabel,
  importSkills,
  listStore,
  previewImport,
  publishableRows,
  removeSkill,
} from '../src/store.js';

const USAGE = `dsh-skill-forge - import skills written for other agents into DeepSeek Harness

Usage:
  dsh-skill-forge scan [paths...]        Show which skills would be imported
  dsh-skill-forge import <source>        Copy skills from a directory or git URL into the store
  dsh-skill-forge list                   Show what is already in the store
  dsh-skill-forge remove <name>          Delete one skill from the store
  dsh-skill-forge doctor                 Check the store and the plugin defaults

Options:
  --store <dir>     Skill store to read or write (default: ~/.dsh/skill-forge)
  --json            Print machine-readable JSON where a command supports it
  --loose           Also import plain Markdown with no frontmatter
  --depth <n>       Directory depth to search (default: 3)
  --dry-run         (import) Show the copy plan without writing anything
  --force           (import) Replace an existing skill of the same name
  -h, --help        Show this help

Examples:
  dsh-skill-forge scan .
  dsh-skill-forge import https://github.com/benjitaylor/skills.git
  dsh-skill-forge import ./vendor/some-skills --dry-run
  dsh-skill-forge remove stageshow
`;

/**
 * Build the option set one invocation shares.
 * @param {string[]} argv - process arguments after the command name.
 * @returns {{ values: Record<string, unknown>, positionals: string[] }}
 */
function parse(argv) {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      store: { type: 'string' },
      json: { type: 'boolean', default: false },
      loose: { type: 'boolean', default: false },
      depth: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return { values: parsed.values, positionals: parsed.positionals };
}

/**
 * Print one adapted skill per line, aligned in a table.
 * @param {Array<Record<string, unknown>>} rows - described rows.
 * @param {string} [footer] - how to describe the scope of the listing.
 */
function printTable(rows, footer = 'would be published') {
  if (rows.length === 0) {
    console.log('No importable skills found.');
    return;
  }
  const widthOf = (pick) => rows.reduce((max, row) => Math.max(max, String(pick(row)).length), 0);
  const nameWidth = Math.max(4, widthOf((row) => row.name));
  const dialectWidth = Math.max(7, widthOf((row) => row.dialectLabel));
  for (const row of rows) {
    const flags = [row.modelInvocable ? 'model' : 'user-only'].join('');
    console.log(row.name.padEnd(nameWidth) + '  ' + row.dialectLabel.padEnd(dialectWidth) + '  ' + flags.padEnd(9) + '  ' + row.source);
  }
  console.log('');
  console.log(rows.length + (rows.length === 1 ? ' skill ' : ' skills ') + footer + '.');
}

/**
 * `scan`: report what the plugin would import without touching anything.
 * @param {string[]} targets - paths to scan.
 * @param {Record<string, unknown>} flags - parsed options.
 */
async function commandScan(targets, flags) {
  const cwd = process.cwd();
  const roots = (targets.length > 0 ? targets : [cwd]).map((target) => resolveRoot(target, cwd));
  const discovery = await discoverSkills({
    roots,
    cwd,
    depth: flags.depth === undefined ? 3 : Number(flags.depth),
    includeLoose: flags.loose === true,
  });
  const rows = publishableRows(discovery.skills).map((row) => ({
    name: row.definition.name,
    description: row.definition.description,
    dialect: row.definition.metadata.dialect,
    dialectLabel: dialectLabel(row.definition.metadata.dialect),
    source: row.definition.source,
    file: row.record.file,
    rank: row.definition.rank,
  }));
  if (flags.json === true) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  printTable(rows);
  for (const root of discovery.roots) {
    if (root.error !== undefined) console.error('warning: ' + root.error);
  }
}

/**
 * `import`: copy discovered skills into the store so the plugin publishes them.
 * @param {string} source - local path or git URL.
 * @param {Record<string, unknown>} flags - parsed options.
 */
async function commandImport(source, flags) {
  if (typeof source !== 'string' || source.length === 0) {
    console.error('import needs a source: a directory, a file, or a git URL.');
    return 1;
  }
  const cwd = process.cwd();
  const options = {
    source,
    store: typeof flags.store === 'string' ? flags.store : DEFAULT_STORE,
    cwd,
    loose: flags.loose === true,
    depth: flags.depth === undefined ? 4 : Number(flags.depth),
    force: flags.force === true,
    dryRun: flags['dry-run'] === true,
  };
  if (options.dryRun === true) {
    const preview = await previewImport(options);
    try {
      if (preview.skills.length === 0) {
        console.log('No importable skills in ' + source + '.');
        return 0;
      }
      console.log('Would import into ' + resolveRoot(options.store, cwd) + ':');
      for (const skill of preview.skills) console.log('  ' + skill.name + '  <-  ' + skill.file);
      return 0;
    } finally {
      await preview.cleanup();
    }
  }
  const result = await importSkills(options);
  if (result.planned.length === 0) {
    console.log('No importable skills in ' + source + '.');
    return 0;
  }
  for (const name of result.skipped) console.log('skipped ' + name + ': already in the store (use --force to replace)');
  for (const name of result.imported) console.log('imported ' + name + ' (' + dialectLabel(result.dialects[name]) + ')');
  if (result.imported.length > 0) {
    console.log('');
    console.log(result.imported.length + ' skill(s) copied to ' + result.store + '.');
    console.log('Make sure the plugin watches it: roots defaults to "~/.dsh/skill-forge".');
  }
  return 0;
}

/**
 * `list`: report the skills already in the store.
 * @param {Record<string, unknown>} flags - parsed options.
 */
async function commandList(flags) {
  const listing = await listStore({
    store: typeof flags.store === 'string' ? flags.store : DEFAULT_STORE,
    cwd: process.cwd(),
    loose: flags.loose === true,
    depth: 3,
  });
  if (listing.skills.length === 0) {
    console.log('The store at ' + listing.store + ' holds no skills yet.');
    console.log('Try: dsh-skill-forge import <path-or-git-url>');
    return;
  }
  console.log('Store: ' + listing.store);
  console.log('');
  printTable(listing.skills, 'in the store');
}

/**
 * `remove`: delete one skill directory from the store.
 * @param {string} name - skill directory name.
 * @param {Record<string, unknown>} flags - parsed options.
 */
async function commandRemove(name, flags) {
  if (typeof name !== 'string' || name.length === 0) {
    console.error('remove needs a skill name: dsh-skill-forge remove <name>');
    return 1;
  }
  const result = await removeSkill({ name, store: typeof flags.store === 'string' ? flags.store : DEFAULT_STORE, cwd: process.cwd() });
  if (result.removed === false) {
    console.log('The store holds no skill named ' + result.name + '.');
    return 0;
  }
  console.log('removed ' + result.name + ' from ' + result.store + '.');
  return 0;
}

/**
 * `doctor`: report the store, the default roots and what each dialect would get.
 * @param {Record<string, unknown>} flags - parsed options.
 */
async function commandDoctor(flags) {
  const cwd = process.cwd();
  const store = resolveRoot(typeof flags.store === 'string' ? flags.store : DEFAULT_STORE, cwd);
  const listing = await listStore({ store, cwd, loose: flags.loose === true });
  console.log('skill-forge doctor');
  console.log('  store:      ' + store + (listing.exists ? '' : '  (does not exist yet)'));
  console.log('  skills:     ' + listing.skills.length);
  console.log('  node:       ' + process.version);
  console.log('  dsh home:   ' + (process.env.DSH_HOME ?? path.join(homedir(), '.dsh')));
  console.log('');
  console.log('Dialect ranks (lower wins a name collision):');
  for (const [dialect, rank] of Object.entries(DIALECT_RANK)) {
    console.log('  ' + dialect.padEnd(18) + String(rank).padStart(4) + '  ' + (DIALECT_LABEL[dialect] ?? ''));
  }
  console.log('');
  console.log('Project locations auto-detected from the working directory:');
  const discovery = await discoverSkills({
    roots: PROJECT_GLOBS.map((entry) => path.resolve(cwd, entry)),
    cwd,
    depth: 3,
    includeLoose: flags.loose === true,
  });
  if (discovery.skills.length === 0) console.log('  (none found in ' + cwd + ')');
  for (const record of discovery.skills) {
    console.log('  ' + dialectLabel(record.dialect).padEnd(26) + record.relativeFile);
  }
  return 0;
}

/**
 * Entry point.
 * @param {string[]} argv - arguments after the executable name.
 * @returns {Promise<number>} process exit code.
 */
export async function main(argv) {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error(USAGE);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help === true || positionals.length === 0) {
    console.log(USAGE);
    return values.help === true ? 0 : 2;
  }
  const command = positionals[0];
  const rest = positionals.slice(1);
  try {
    switch (command) {
      case 'scan':
        await commandScan(rest, values);
        return 0;
      case 'import':
        return await commandImport(rest[0], values);
      case 'list':
        await commandList(values);
        return 0;
      case 'remove':
        return await commandRemove(rest[0], values);
      case 'doctor':
        return await commandDoctor(values);
      default:
        console.error('unknown command: ' + command);
        console.error('');
        console.error(USAGE);
        return 2;
    }
  } catch (error) {
    console.error('error: ' + (error instanceof Error ? error.message : String(error)));
    return 1;
  }
}

// Run only when executed as a program, so the module stays importable by tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

export { DEFAULT_STORE, USAGE };
