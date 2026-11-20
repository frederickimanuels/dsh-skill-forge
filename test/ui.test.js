/**
 * Store, bridge and client-manifest tests.
 *
 * These cover the pieces the settings UI sits on: the shared store module, the
 * HTTP routes the browser calls, and the package manifest that makes the
 * browser half loadable at all.
 *
 * @module test/ui
 */

import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fixture } from './helpers.js';
import { BRIDGE_PREFIX, createBridgeRoutes } from '../src/bridge.js';
import { importSkills, listStore, previewImport, removeSkill, storePath } from '../src/store.js';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');

/** A source tree holding two skills in different dialects. */
const SOURCE = {
  'claude/skills/pdf-tools/SKILL.md': ['---', 'name: pdf-tools', 'description: Fill and split PDF forms.', '---', '', 'Read @scripts/fill.py first.', ''].join('\n'),
  'claude/skills/pdf-tools/scripts/fill.py': "print('fill')\n",
  'agents/deploy/SKILL.md': ['---', 'name: deploy', 'description: Deploy the service to staging.', '---', '', 'Deploy steps.', ''].join('\n'),
};

/**
 * Invoke one bridge route the way the browser would.
 * @param {Array<Record<string, unknown>>} routes - route table.
 * @param {string} name - endpoint name after the prefix.
 * @param {{ body?: unknown, method?: string, headers?: Record<string, string> }} [options] - request shape.
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>} the response.
 */
async function callRoute(routes, name, options = {}) {
  const route = routes.find((candidate) => candidate.path === BRIDGE_PREFIX + '/' + name);
  assert.ok(route, 'route ' + name + ' is registered');
  const payload = options.body === undefined ? '' : JSON.stringify(options.body);
  const chunks = payload.length === 0 ? [] : [Buffer.from(payload)];
  const req = {
    method: options.method ?? 'POST',
    headers: { host: 'localhost:3000', ...(options.headers ?? {}) },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
  let status = 200;
  let text = '';
  const res = {
    writeHead(code) {
      status = code;
      return res;
    },
    end(value) {
      text = String(value ?? '');
      return res;
    },
  };
  await route.handler(req, res);
  return { status, body: text.length === 0 ? {} : JSON.parse(text) };
}

test('a git-free source is previewed without touching the store', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    const preview = await previewImport({ source: source.root, cwd: store.root, depth: 4 });
    try {
      assert.equal(preview.skills.length, 2);
      assert.deepEqual(preview.skills.map((skill) => skill.name).sort(), ['deploy', 'pdf-tools']);
      const listing = await listStore({ store: store.root });
      assert.equal(listing.exists, true);
      assert.equal(listing.skills.length, 0, 'preview writes nothing');
    } finally {
      await preview.cleanup();
    }
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('an import larger than the budget copies nothing instead of a prefix', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    const error = await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4, maxFiles: 1 }).then(
      () => undefined,
      (thrown) => thrown,
    );
    assert.ok(error instanceof Error, 'a truncated import must fail loudly');
    assert.match(error.message, /more skills than the 1 skill budget/);
    assert.match(error.message, /Raise maxFiles/);
    assert.equal((await listStore({ store: store.root })).skills.length, 0, 'a refused import writes nothing');
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('importing copies a whole bundle and its resources', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    const result = await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4 });
    assert.deepEqual(result.imported.sort(), ['deploy', 'pdf-tools']);
    assert.equal(result.store, store.root);
    assert.equal(result.dialects['pdf-tools'], 'agent-skills');
    const bundle = path.join(store.root, 'pdf-tools');
    assert.equal(await readFile(path.join(bundle, 'SKILL.md'), 'utf8').then((text) => text.includes('pdf-tools')), true);
    assert.equal(await readFile(path.join(bundle, 'scripts', 'fill.py'), 'utf8'), "print('fill')\n");
    const listing = await listStore({ store: store.root });
    assert.deepEqual(listing.skills.map((skill) => skill.name).sort(), ['deploy', 'pdf-tools']);
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('a second import skips existing skills unless force is set', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4 });
    const again = await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4 });
    assert.deepEqual(again.imported, []);
    assert.deepEqual(again.skipped.sort(), ['deploy', 'pdf-tools']);
    const forced = await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4, force: true });
    assert.deepEqual(forced.imported.sort(), ['deploy', 'pdf-tools']);
    assert.deepEqual(forced.skipped, []);
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('a dry run reports the plan and writes nothing', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    const result = await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4, dryRun: true });
    assert.deepEqual(result.planned.sort(), ['deploy', 'pdf-tools']);
    assert.deepEqual(result.imported, []);
    assert.equal((await listStore({ store: store.root })).skills.length, 0);
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('remove deletes one skill and refuses anything outside the store', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4 });
    const removed = await removeSkill({ name: 'deploy', store: store.root });
    assert.equal(removed.removed, true);
    assert.deepEqual((await listStore({ store: store.root })).skills.map((skill) => skill.name), ['pdf-tools']);
    const missing = await removeSkill({ name: 'deploy', store: store.root });
    assert.equal(missing.removed, false);
    await assert.rejects(() => removeSkill({ name: '../escape', store: store.root }), /not a skill name/);
    await assert.rejects(() => removeSkill({ name: 'Not A Name', store: store.root }), /not a skill name/);
    await assert.rejects(() => removeSkill({ name: '', store: store.root }), /not a skill name/);
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('the store path expands a leading tilde and defaults to the home store', () => {
  assert.equal(storePath(undefined, '/tmp'), path.join(process.env.HOME ?? '', '.dsh', 'skill-forge'));
  assert.equal(storePath('~/elsewhere', '/tmp'), path.join(process.env.HOME ?? '', 'elsewhere'));
  assert.equal(storePath('/abs/store', '/tmp'), '/abs/store');
});

test('the state route reports the store and the settings it was loaded with', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    await importSkills({ source: source.root, store: store.root, cwd: store.root, depth: 4 });
    const routes = createBridgeRoutes({ config: { store: store.root, roots: ['~/elsewhere'] }, defaultStore: '/tmp/fallback' });
    const state = await callRoute(routes, 'state', { method: 'GET' });
    assert.equal(state.status, 200);
    assert.equal(state.body.ok, true);
    assert.equal(state.body.store, store.root);
    assert.equal(state.body.skills.length, 2);
    assert.deepEqual(state.body.settings.roots, ['~/elsewhere']);
    assert.equal(state.body.settings.watch, true);
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('the import and remove routes round-trip through the store', async () => {
  const source = await fixture(SOURCE);
  const store = await fixture({});
  try {
    const routes = createBridgeRoutes({ config: { store: store.root }, defaultStore: '/tmp/fallback' });
    const imported = await callRoute(routes, 'import', { body: { source: source.root, depth: 4 } });
    assert.equal(imported.body.ok, true);
    assert.deepEqual(imported.body.imported.sort(), ['deploy', 'pdf-tools']);
    assert.equal(imported.body.state.skills.length, 2);
    const removed = await callRoute(routes, 'remove', { body: { name: 'deploy' } });
    assert.equal(removed.body.ok, true);
    assert.equal(removed.body.removed, true);
    assert.deepEqual(removed.body.state.skills.map((skill) => skill.name), ['pdf-tools']);
  } finally {
    await source.cleanup();
    await store.cleanup();
  }
});

test('a route reports a bad request as JSON instead of throwing', async () => {
  const store = await fixture({});
  try {
    const routes = createBridgeRoutes({ config: { store: store.root }, defaultStore: '/tmp/fallback' });
    const failed = await callRoute(routes, 'import', { body: { source: '' } });
    assert.equal(failed.status, 400);
    assert.equal(failed.body.ok, false);
    assert.match(String(failed.body.error), /needs a source/);
    const escape = await callRoute(routes, 'remove', { body: { name: '../etc' } });
    assert.equal(escape.status, 400);
    assert.match(String(escape.body.error), /not a skill name/);
  } finally {
    await store.cleanup();
  }
});

test('a cross-site request is refused', async () => {
  const store = await fixture({});
  try {
    const routes = createBridgeRoutes({ config: { store: store.root }, defaultStore: '/tmp/fallback' });
    const refused = await callRoute(routes, 'state', { method: 'GET', headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.ok, false);
    const foreignOrigin = await callRoute(routes, 'state', { method: 'GET', headers: { origin: 'https://evil.example' } });
    assert.equal(foreignOrigin.status, 403);
  } finally {
    await store.cleanup();
  }
});

test('the package declares a browser half the harness can load', async () => {
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.equal(manifest.exports['./client'], './client/index.js');
  const bundle = await readFile(path.join(PACKAGE_ROOT, 'client', 'index.js'), 'utf8');
  assert.match(bundle, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(bundle, /id: "@frederickimanuels\/dsh-skill-forge"/);
  assert.match(bundle, /exports\.apply = apply/);
  assert.match(bundle, /exports\.inject = inject/);
  assert.match(bundle, /settings\.section/);
  assert.match(bundle, new RegExp('api/dsh-skill-forge'));
  // A sidebar destination is two registrations that share one id: the
  // 'sidebar.panellist' row the shell paints and the 'main' panel it opens.
  // Losing either one leaves a clickable row that navigates nowhere, or a page
  // no row can reach, so both are pinned here.
  assert.match(bundle, /name: "sidebar\.panellist"/);
  assert.match(bundle, /name: "main",\s*\n\s*key: PANEL_ID/);
  assert.match(bundle, /var PANEL_ID = "skill-forge";/);
  // The sidebar registrant renders ONLY the glyph: the shell owns the button,
  // the label and the active state. A component that returns chrome would
  // double up on the row, so the icon must be a bare svg.
  assert.match(bundle, /function SkillsPanelIcon/);
  assert.match(bundle, /el\(\s*\n\s*"svg",/);
  // The page owns its own scroll container: a 'main' entry fills the centre
  // column and the shell paints no scroll chrome around it.
  assert.match(bundle, /className: "sf-page"/);
  assert.match(bundle, /className: "sf-pageScroll"/);
  // Nothing above the page scrolls — the layout shell clips overflow on purpose —
  // so the page must (a) be a column that flexes to the frame's height without
  // growing to its content, and (b) be the only box with overflow. A page whose
  // height collapses to 'auto' renders a scroller that never overflows, which is
  // exactly the 'the page will not scroll' report this design answers.
  assert.match(bundle, /\.sf-page\{box-sizing:border-box;height:100%;max-height:100%;min-height:0;min-width:0;flex:1 1 auto/);
  assert.match(bundle, /\.sf-page\{.*?overflow:hidden/);
  assert.match(bundle, /\.sf-pageScroll\{flex:1 1 0;min-height:0;overflow-y:auto/);
  // The stylesheet is upserted, not inserted once: a reloaded client must replace
  // the rules an earlier bundle left in the tab instead of silently keeping them.
  assert.match(bundle, /if \(tag\.textContent !== css\) tag\.textContent = css;/);
  // Only the modules the harness seeds are required: anything else would have
  // to be declared in dsh.client.external, and nothing is.
  const required = [...bundle.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  for (const name of required) {
    assert.ok(
      ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'].includes(name),
      'client bundle requires a module it did not declare: ' + name,
    );
  }
});

test('the plugin registers the bridge only when it has a web server', async () => {
  const store = await fixture({});
  try {
    const plugin = await import('../src/index.js');
    const registered = [];
    const ctx = {
      logger: { warn() {}, info() {}, debug() {} },
      effect() {
        return () => {};
      },
      skills: {
        registerProvider() {
          return () => {};
        },
      },
      inject(services, callback) {
        if (services.includes('webServer')) {
          callback({
            logger: ctx.logger,
            effect(fn) {
              fn();
              return () => {};
            },
            get() {
              return {
                register(route) {
                  registered.push(route.path);
                  return () => {};
                },
              };
            },
          });
        }
      },
    };
    plugin.apply(ctx, { ...plugin.Config({}), store: store.root });
    assert.deepEqual(registered.sort(), [
      '/api/dsh-skill-forge/import',
      '/api/dsh-skill-forge/preview',
      '/api/dsh-skill-forge/remove',
      '/api/dsh-skill-forge/state',
      '/api/dsh-skill-forge/store',
    ]);
    for (const route of registered) assert.ok(route.startsWith('/'), 'web server routes need an absolute pathname: ' + route);
    registered.length = 0;
    plugin.apply(ctx, { ...plugin.Config({}), store: store.root, ui: false });
    assert.deepEqual(registered, [], 'ui: false registers no routes');
  } finally {
    await store.cleanup();
  }
});