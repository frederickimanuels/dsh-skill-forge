/**
 * Frontmatter parsing for foreign skill formats.
 *
 * Every ecosystem this plugin targets ships instruction files with a YAML
 * frontmatter header: Agent Skills / Claude Code `SKILL.md`, Cursor `.mdc`
 * rules, and assorted hand-written Markdown. DeepSeek Harness' own loader
 * handles that header with the full `yaml` package, but a plugin that ships
 * into arbitrary profiles should not pull a parser (or a second copy of one)
 * into the host. This module implements the subset those formats actually use:
 *
 * - `key: value` scalars, single/double quoted, with escapes
 * - nested mappings by indentation
 * - block sequences (`- item`) and flow sequences (`[a, b]`)
 * - literal/folded block scalars (`|`, `>`, with `-`/`+` chomping)
 * - trailing comments, boolean/number/null coercion, folded plain scalars
 *
 * Anything outside that subset is kept verbatim as a string rather than
 * rejected: a skill whose frontmatter is odd should still import, with the odd
 * value visible to the reader, instead of vanishing from the catalog.
 *
 * @module dsh-skill-forge/frontmatter
 */

const OPENING_FENCE = /^---[ \t]*\r?\n/;
const CLOSING_FENCE = /^---[ \t]*\r?$/gm;

/**
 * Split a Markdown file into its frontmatter mapping and its body.
 *
 * A file without a leading fence, or with an unterminated fence, keeps its
 * entire contents as the body and reports `data: {}`.
 *
 * @param {string} text - the raw file contents.
 * @returns {{ data: Record<string, unknown>, body: string, raw: string | undefined, error: string | undefined }}
 */
export function splitFrontmatter(text) {
  // Editors on Windows and some copy-paste paths leave a byte-order mark in
  // front of the fence; it is invisible in every tool the author uses.
  const source = (typeof text === 'string' ? text : '').replace(/^\uFEFF/, '');
  const opening = OPENING_FENCE.exec(source);
  if (opening === null) return { data: {}, body: source, raw: undefined, error: undefined };

  const rest = source.slice(opening[0].length);
  CLOSING_FENCE.lastIndex = 0;
  const closing = CLOSING_FENCE.exec(rest);
  if (closing === null) return { data: {}, body: source, raw: undefined, error: 'unterminated frontmatter' };

  const raw = rest.slice(0, closing.index);
  const body = rest.slice(closing.index + closing[0].length).replace(/^\r?\n/, '');
  try {
    return { data: parseYaml(raw), body, raw, error: undefined };
  } catch (error) {
    return { data: {}, body, raw, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Parse the YAML subset described by this module.
 *
 * @param {string} text - YAML source without the surrounding fences.
 * @returns {Record<string, unknown>} the parsed mapping (sequences at the root are keyed by index).
 */
export function parseYaml(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => ({ raw, indent: leadingSpaces(raw), content: raw.trim() }))
    .filter((line) => line.content.length > 0 && !line.content.startsWith('#'));
  if (lines.length === 0) return {};
  const state = { lines, index: 0 };
  const value = parseBlock(state, lines[0].indent);
  return value === null || typeof value !== 'object' ? {} : value;
}

function leadingSpaces(line) {
  let count = 0;
  while (count < line.length && line[count] === ' ') count += 1;
  return count;
}

function parseBlock(state, indent) {
  const line = state.lines[state.index];
  if (line === undefined) return {};
  return line.content.startsWith('- ') || line.content === '-' ? parseSequence(state, indent) : parseMapping(state, indent);
}

function parseMapping(state, indent) {
  const result = {};
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new Error(`unexpected indentation on line "${line.content}"`);
    if (line.content.startsWith('- ') || line.content === '-') break;
    const entry = splitKey(line.content);
    if (entry === undefined) {
      // A bare scalar cannot extend a mapping; keep it addressable instead of throwing.
      state.index += 1;
      continue;
    }
    const { key, rest } = entry;
    state.index += 1;
    result[key] = parseValue(state, rest, indent);
  }
  return result;
}

function parseSequence(state, indent) {
  const result = [];
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.indent !== indent) break;
    if (!(line.content.startsWith('- ') || line.content === '-')) break;
    const itemText = line.content === '-' ? '' : line.content.slice(2);
    state.index += 1;
    if (itemText.length === 0) {
      const next = state.lines[state.index];
      result.push(next !== undefined && next.indent > indent ? parseBlock(state, next.indent) : null);
      continue;
    }
    const nested = splitKey(itemText);
    if (nested !== undefined && !itemText.startsWith('"') && !itemText.startsWith("'")) {
      // "- key: value" opens a mapping item; the remaining keys are indented
      // past the dash and share that deeper indentation.
      const objectIndent = indent + 2;
      const object = {};
      object[nested.key] = parseValue(state, nested.rest, objectIndent);
      while (state.index < state.lines.length) {
        const candidate = state.lines[state.index];
        if (candidate.indent !== objectIndent) break;
        const pair = splitKey(candidate.content);
        if (pair === undefined) break;
        state.index += 1;
        object[pair.key] = parseValue(state, pair.rest, objectIndent);
      }
      result.push(object);
      continue;
    }
    result.push(parseScalarText(itemText, state, indent));
  }
  return result;
}

/** Split `key: value` while respecting quoted keys. */
function splitKey(text) {
  if (text.startsWith('"') || text.startsWith("'")) {
    const quote = text[0];
    let index = 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === quote) break;
      index += 1;
    }
    const restStart = text.indexOf(':', index);
    if (restStart === -1) return undefined;
    const rawKey = text.slice(0, index + 1);
    return { key: unquote(rawKey), rest: text.slice(restStart + 1).trim() };
  }
  const colon = text.indexOf(':');
  if (colon <= 0) return undefined;
  const key = text.slice(0, colon).trim();
  const after = text.slice(colon + 1);
  // `http://x` inside a bare scalar is not a key; mapping keys never contain spaces
  // before the colon except when quoted, which the branch above covers.
  if (key.length === 0 || /\s/.test(key)) return undefined;
  return { key, rest: after.trim() };
}

function parseValue(state, rest, indent) {
  if (rest.length === 0) {
    const next = state.lines[state.index];
    if (next === undefined) return null;
    if (next.indent > indent) return parseBlock(state, next.indent);
    if (next.indent === indent && (next.content.startsWith('- ') || next.content === '-')) return parseSequence(state, indent);
    return null;
  }
  return parseScalarText(rest, state, indent);
}

function parseScalarText(text, state, indent) {
  const trimmed = text.trim();
  const block = /^([|>])([+-]?)(?:[ \t]+#.*)?$/.exec(trimmed);
  if (block !== null) return parseBlockScalar(state, block[1], block[2], indent);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return parseFlowSequence(trimmed);
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return parseFlowMapping(trimmed);
  return foldPlain(trimmed, state, indent);
}

function foldPlain(text, state, indent) {
  let value = text;
  // Plain scalars continue on deeper-indented lines; folded with a single space.
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.indent <= indent) break;
    if (line.content.startsWith('- ') && line.indent === indent + 2) break;
    value += ' ' + line.content;
    state.index += 1;
  }
  return coerce(stripComment(value));
}

function stripComment(text) {
  let quote = undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== undefined) {
      if (char === '\\' && quote === '"') {
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(text[index - 1]))) return text.slice(0, index).trimEnd();
  }
  return text.trim();
}

function coerce(text) {
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) return unquote(text);
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return unquote(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~' || text === '') return null;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

function unquote(text) {
  if (text.length < 2) return text;
  if (text[0] === '"' && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (match, escape) => {
      if (escape.length === 5) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      return { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[escape] ?? match;
    });
  }
  if (text[0] === "'" && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

function parseFlowSequence(text) {
  const inner = text.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return splitFlow(inner).map((item) => coerce(item.trim()));
}

function parseFlowMapping(text) {
  const inner = text.slice(1, -1).trim();
  if (inner.length === 0) return {};
  const result = {};
  for (const item of splitFlow(inner)) {
    const entry = splitKey(item.trim());
    if (entry !== undefined) result[entry.key] = coerce(entry.rest);
  }
  return result;
}

function splitFlow(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== undefined) {
      current += char;
      if (char === '\\' && quote === '"') {
        current += text[index + 1] ?? '';
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '[' || char === '{') depth += 1;
    if (char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

function parseBlockScalar(state, style, chomp, indent) {
  const collected = [];
  let blockIndent;
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.content.length === 0) {
      collected.push('');
      state.index += 1;
      continue;
    }
    if (line.indent <= indent) break;
    blockIndent ??= line.indent;
    if (line.indent < blockIndent) break;
    collected.push(' '.repeat(line.indent - blockIndent) + line.raw.trimStart());
    state.index += 1;
  }
  let text = style === '|' ? collected.join('\n') : collected.join('\n').replace(/\n(?=[^\n])/g, ' ');
  if (chomp === '+') text += '\n';
  else if (chomp !== '-') text = text.length > 0 ? text + '\n' : text;
  return text;
}
