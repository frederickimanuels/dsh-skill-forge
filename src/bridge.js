/**
 * HTTP bridge for the skill-management UI.
 *
 * The settings page is browser code, so it cannot touch the filesystem: it
 * asks these routes instead. They are plain `webServer` routes registered
 * under one prefix, with JSON in and JSON out, exactly like the bridge the
 * bundled settings pages use.
 *
 * Every write goes through `src/store.js`, the same module the CLI uses, so
 * importing from the UI and importing from a terminal cannot behave
 * differently.
 *
 * @module dsh-skill-forge/bridge
 */

import { DEFAULT_STORE, importSkills, listStore, previewImport, removeSkill, storePath } from './store.js';

/**
 * Prefix every route shares, as an absolute pathname.
 *
 * The web server matches on the request pathname, so the leading slash is
 * required: `api/...` would register a route nothing can ever match.
 */
export const BRIDGE_PREFIX = '/api/dsh-skill-forge';

/** Largest JSON body we accept, in bytes. */
const MAX_BODY_BYTES = 64 * 1024;

/** How many skills one `state` answer may carry, well above the catalog budget. */
const LISTING_MAX_FILES = 5000;

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON-serializable payload.
 */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end(payload);
}

/**
 * Read and parse a JSON request body.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<Record<string, unknown>>} parsed body, empty when absent.
 */
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text.length === 0) return {};
  const parsed = JSON.parse(text);
  return parsed !== null && typeof parsed === 'object' && Array.isArray(parsed) === false ? parsed : {};
}

/**
 * Decide whether a request may reach the bridge.
 *
 * The page is served from the same origin as these routes, so a request from
 * another site is always refused; a missing Host header means something other
 * than a browser is calling, which is fine for a local operator.
 *
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {boolean} true when the request may proceed.
 */
function isAllowed(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin === 'string' && origin.length > 0 && typeof host === 'string') {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Build the route table.
 *
 * @param {object} options - route options.
 * @param {Record<string, unknown>} options.config - the plugin configuration.
 * @param {string} options.defaultStore - resolved store directory.
 * @param {(message: string) => void} [options.warn] - logger.
 * @returns {Array<Record<string, unknown>>} routes for `webServer.register`.
 */
export function createBridgeRoutes(options) {
  const config = options.config ?? {};
  const defaultStore = options.defaultStore;
  const store = typeof config.store === 'string' && config.store.length > 0 ? config.store : defaultStore;

  /** Answer shape shared by `state` and the mutating routes. */
  const describeState = async (cwd) => {
    // The page is a management view, so it asks for a far larger budget than
    // the catalog needs: an operator who imported a few hundred skills should
    // still see all of them. When even that runs out, `truncated` says so.
    const listing = await listStore({
      store,
      cwd,
      loose: config.includeLoose === true,
      maxFiles: LISTING_MAX_FILES,
    });
    return {
      store: listing.store,
      defaultStore,
      exists: listing.exists,
      truncated: listing.truncated,
      maxFiles: listing.maxFiles,
      errors: listing.errors,
      skills: listing.skills,
      settings: {
        roots: Array.isArray(config.roots) ? config.roots : [DEFAULT_STORE],
        autoDiscover: config.autoDiscover !== false,
        includeLoose: config.includeLoose === true,
        depth: Number.isFinite(config.depth) ? config.depth : 3,
        maxFiles: listing.maxFiles,
        watch: config.watch !== false,
      },
    };
  };

  const handler = (fn) => async (req, res) => {
    if (isAllowed(req) === false) {
      writeJson(res, 403, { ok: false, error: 'cross-site request refused' });
      return;
    }
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const payload = await fn(body, req);
      writeJson(res, 200, { ok: true, ...payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.warn?.('skill-forge: bridge ' + message);
      writeJson(res, 400, { ok: false, error: message });
    }
  };

  return [
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/state',
      handler: handler(async (_body, req) => describeState(cwdFor(req))),
    },
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/preview',
      handler: handler(async (body, req) => {
        const preview = await previewImport({
          source: String(body.source ?? ''),
          cwd: cwdFor(req),
          loose: body.loose === true || config.includeLoose === true,
          depth: Number.isFinite(body.depth) ? Number(body.depth) : 4,
        });
        try {
          return { source: preview.source, dir: preview.dir, skills: preview.skills };
        } finally {
          await preview.cleanup();
        }
      }),
    },
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/import',
      handler: handler(async (body, req) => {
        const cwd = cwdFor(req);
        const result = await importSkills({
          source: String(body.source ?? ''),
          store,
          cwd,
          loose: body.loose === true || config.includeLoose === true,
          depth: Number.isFinite(body.depth) ? Number(body.depth) : 4,
          force: body.force === true,
        });
        const state = await describeState(cwd);
        return {
          source: result.source,
          imported: result.imported,
          skipped: result.skipped,
          planned: result.planned,
          dialects: result.dialects,
          state,
        };
      }),
    },
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/remove',
      handler: handler(async (body, req) => {
        const result = await removeSkill({ name: String(body.name ?? ''), store, cwd: cwdFor(req) });
        const state = await describeState(cwdFor(req));
        return { name: result.name, removed: result.removed, state };
      }),
    },
    {
      kind: 'exact',
      path: BRIDGE_PREFIX + '/store',
      handler: handler(async (_body, req) => ({ store: storePath(store, cwdFor(req)) })),
    },
  ];
}

/**
 * The working directory a request acts on.
 *
 * A browser has no notion of a working directory, and the store is absolute,
 * so the harness default is the honest answer: skills in the store are visible
 * from every session.
 *
 * @param {import('node:http').IncomingMessage} _req - request (unused).
 * @returns {string} working directory.
 */
function cwdFor(_req) {
  return process.cwd();
}
