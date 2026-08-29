/**
 * HTML detection and sanitising for agent-supplied content.
 *
 * DeepScribe hands stored content back to agents as HTML, so agents regularly
 * mirror that format when they write. The Markdown converter escapes every tag,
 * which turned such a write into visible `&lt;h2&gt;` in the editor. This module
 * decides which of the two formats an incoming string is, and — when it is HTML
 * — reduces it to the small tag vocabulary the editor can store.
 *
 * The escaping in `markdownToHtml` was also the only thing keeping agents from
 * injecting arbitrary HTML, so opening an HTML route without an allowlist would
 * open that hole. Everything outside {@link ALLOWED_ATTRIBUTES} is therefore
 * dropped here, including every `data-*` attribute: HTML task markup loses the
 * `data-type="taskItem"` that makes it a todo, so the HTML route cannot create
 * one either.
 *
 * Shared domain core: imported by both the renderer/bridge path
 * (`src/mcp/bridge.ts`) and the standalone Node MCP server
 * (`mcp/direct-store.mjs`), so it must stay free of DOM and Node APIs.
 *
 * @module
 */

import { escapeHtml, markdownToHtml } from './markdown.mjs';

/**
 * Tags the editor can store, mapped to the attributes they may keep. Every
 * attribute outside this table is dropped, which covers `on*` handlers,
 * `style`, and all `data-*` attributes without naming them one by one.
 * @type {Record<string, readonly string[]>}
 */
export const ALLOWED_ATTRIBUTES = {
  p: [], br: [], hr: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  ul: [], ol: ['start'], li: [],
  blockquote: [],
  pre: [], code: ['class'],
  strong: [], em: [], s: [], u: [], mark: [], sub: [], sup: [],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  table: [], thead: [], tbody: [], tfoot: [], tr: [],
  th: ['colspan', 'rowspan', 'colwidth'],
  td: ['colspan', 'rowspan', 'colwidth']
};

/** Elements that never carry a closing tag. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Elements whose *contents* are thrown away with the tag. Anything that can
 * carry script, load a remote document, or act as a form control lives here;
 * keeping its text would be meaningless at best and executable at worst.
 */
const DROPPED_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'noscript', 'template', 'svg', 'math', 'link', 'meta', 'base', 'head', 'title',
  'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea',
  'audio', 'video', 'canvas', 'source', 'track', 'map', 'area', 'col', 'colgroup',
  'portal', 'marquee', 'param'
]);

/** Recognised as HTML by the sniffer, even where the sanitiser later unwraps them. */
const KNOWN_TAGS = new Set([
  ...Object.keys(ALLOWED_ATTRIBUTES), ...DROPPED_WITH_CONTENT,
  'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
  'figure', 'figcaption', 'caption', 'dl', 'dt', 'dd', 'label', 'fieldset', 'legend',
  'b', 'i', 'small', 'big', 'font', 'center', 'abbr', 'cite', 'q', 'del', 'ins',
  'kbd', 'samp', 'var', 'time', 'data', 'details', 'summary', 'address', 'picture', 'html', 'body'
]);

/** Schemes a link may point at. `javascript:` and `data:` are absent on purpose. */
const SAFE_LINK_SCHEMES = /^(?:https?|mailto|deepscribe):/i;
/** Images may only be fetched over the web; `data:` payloads stay out. */
const SAFE_IMAGE_SCHEMES = /^https?:/i;

/** Markdown block syntax at the start of a line, which marks the input as mixed. */
const MARKDOWN_BLOCK = /^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```)/m;

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', tab: '\t', newline: '\n', colon: ':' };

/**
 * Escapes a text node without mangling entities it already carries, so
 * round-tripped content keeps its `&amp;` instead of gaining another layer.
 * @param {string} value
 * @returns {string}
 */
function escapeText(value) {
  return String(value)
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]{1,30};|#\d{1,7};|#[xX][0-9a-fA-F]{1,6};)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {number} code
 * @param {string} fallback
 * @returns {string}
 */
function fromCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/**
 * Resolves the entities a scheme can hide behind — `&#106;`, `&#x6a;`,
 * `java&Tab;script:` — so the scheme test sees the real URL.
 * @param {string} value
 * @returns {string}
 */
function decodeEntities(value) {
  let decoded = String(value);
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded
      .replace(/&#[xX]([0-9a-fA-F]{1,6});?/g, (match, hex) => fromCodePoint(parseInt(hex, 16), match))
      .replace(/&#(\d{1,7});?/g, (match, digits) => fromCodePoint(parseInt(digits, 10), match))
      .replace(/&([a-zA-Z]+);/g, (match, name) => /** @type {Record<string, string>} */ (NAMED_ENTITIES)[String(name).toLowerCase()] ?? match);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

/**
 * @param {string} value
 * @param {RegExp} schemes
 * @returns {string | null} The original value when it is safe to keep.
 */
function safeUrl(value, schemes) {
  const raw = String(value ?? '').trim();
  const probe = Array.from(decodeEntities(raw)).filter(character => {
    const code = character.codePointAt(0) ?? 0;
    return code > 32 && code !== 127;
  }).join('');
  if (!probe) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(probe)) return schemes.test(probe) ? raw : null;
  if (probe.startsWith('//')) return null;
  return raw;
}

/**
 * @typedef {{ type: 'text', value: string }
 *   | { type: 'open' | 'close', name: string, attributes: string, selfClosing: boolean }} HtmlToken
 */

/**
 * Splits HTML into text and tag tokens. Quotes are respected while scanning for
 * the closing `>`, so an attribute value may contain one.
 * @param {string} input
 * @returns {HtmlToken[]}
 */
function tokenize(input) {
  /** @type {HtmlToken[]} */
  const tokens = [];
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf('<', cursor);
    if (start === -1) {
      tokens.push({ type: 'text', value: input.slice(cursor) });
      break;
    }
    if (start > cursor) tokens.push({ type: 'text', value: input.slice(cursor, start) });
    if (input.startsWith('<!--', start)) {
      const end = input.indexOf('-->', start + 4);
      cursor = end === -1 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith('<!', start) || input.startsWith('<?', start)) {
      const end = input.indexOf('>', start);
      cursor = end === -1 ? input.length : end + 1;
      continue;
    }
    const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(input.slice(start));
    if (!head) {
      tokens.push({ type: 'text', value: '<' });
      cursor = start + 1;
      continue;
    }
    let scan = start + head[0].length;
    let quote = '';
    while (scan < input.length) {
      const character = input[scan];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      scan += 1;
    }
    const body = input.slice(start + head[0].length, scan);
    tokens.push({
      type: head[1] ? 'close' : 'open',
      name: head[2].toLowerCase(),
      attributes: body.replace(/\/\s*$/, ''),
      selfClosing: /\/\s*$/.test(body)
    });
    cursor = scan + 1;
  }
  return tokens;
}

/**
 * @param {string} source
 * @returns {Array<{ name: string, value: string | null }>}
 */
function parseAttributes(source) {
  /** @type {Array<{ name: string, value: string | null }>} */
  const attributes = [];
  const pattern = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g;
  for (const match of String(source ?? '').matchAll(pattern)) {
    const value = match[2] ? match[2].replace(/^["']|["']$/g, '') : null;
    attributes.push({ name: match[1].toLowerCase(), value });
  }
  return attributes;
}

/**
 * Keeps only the attributes the tag is allowed to carry, and only where their
 * value is safe: links must use a known scheme, sizes must be numeric, and a
 * code class must name a language.
 * @param {string} tag
 * @param {string} source
 * @returns {string}
 */
function sanitizeAttributes(tag, source) {
  const allowed = ALLOWED_ATTRIBUTES[tag];
  if (!allowed || allowed.length === 0) return '';
  let result = '';
  const seen = new Set();
  for (const { name, value } of parseAttributes(source)) {
    if (!allowed.includes(name) || seen.has(name) || value === null) continue;
    let kept = value;
    if (name === 'href') kept = safeUrl(value, SAFE_LINK_SCHEMES) ?? '';
    else if (name === 'src') kept = safeUrl(value, SAFE_IMAGE_SCHEMES) ?? '';
    else if (name === 'class') kept = /^language-[a-zA-Z0-9_+-]+$/.test(value) ? value : '';
    else if (name !== 'alt' && name !== 'title') kept = /^\d[\d,]*$/.test(value.trim()) ? value.trim() : '';
    if (!kept) continue;
    seen.add(name);
    result += ` ${name}="${escapeHtml(kept)}"`;
  }
  return result;
}

/**
 * Reduces HTML to the tags and attributes the editor can store. Unknown tags
 * are unwrapped so their text survives; scriptable and embedding elements are
 * removed together with their contents.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeHtml(input) {
  /** @type {string[]} */
  const output = [];
  /** @type {string[]} */
  const stack = [];
  let dropping = '';
  let dropDepth = 0;

  for (const token of tokenize(String(input ?? ''))) {
    if (dropDepth > 0) {
      if (token.type === 'open' && token.name === dropping && !token.selfClosing) dropDepth += 1;
      else if (token.type === 'close' && token.name === dropping) dropDepth -= 1;
      continue;
    }
    if (token.type === 'text') {
      output.push(escapeText(token.value));
      continue;
    }
    if (DROPPED_WITH_CONTENT.has(token.name)) {
      if (token.type === 'open' && !token.selfClosing && !VOID_TAGS.has(token.name)) {
        dropping = token.name;
        dropDepth = 1;
      }
      continue;
    }
    if (!(token.name in ALLOWED_ATTRIBUTES)) continue; // Unwrap: the tag goes, its text stays.
    if (token.type === 'close') {
      const index = stack.lastIndexOf(token.name);
      if (index !== -1) while (stack.length > index) output.push(`</${stack.pop()}>`);
      continue;
    }
    const attributes = sanitizeAttributes(token.name, token.attributes);
    if (token.name === 'img' && !attributes.includes(' src=')) continue; // An image whose source was refused is noise.
    output.push(`<${token.name}${attributes}>`);
    if (!VOID_TAGS.has(token.name) && !token.selfClosing) stack.push(token.name);
  }
  while (stack.length > 0) output.push(`</${stack.pop()}>`);

  const html = output.join('');
  return html.trim() ? html : '<p></p>';
}

/**
 * Decides whether agent-supplied content is HTML rather than Markdown.
 *
 * Deliberately narrow: the content has to open with a real tag and close one,
 * and must not carry Markdown block syntax of its own. Markdown that merely
 * mentions a tag, and a stray `<` in prose, stay on the Markdown route where
 * they are escaped.
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeHtml(value) {
  const text = String(value ?? '').trim();
  if (!text.startsWith('<')) return false;
  const first = /^<\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/.exec(text);
  if (!first || !KNOWN_TAGS.has(first[1].toLowerCase())) return false;
  const close = /<\/\s*([a-zA-Z][a-zA-Z0-9]*)\s*>/.exec(text);
  const closesATag = close !== null && KNOWN_TAGS.has(close[1].toLowerCase());
  if (!closesATag && !/<\s*(?:br|hr|img)\b[^>]*>/i.test(text)) return false;
  return !MARKDOWN_BLOCK.test(text);
}

/**
 * The entry point for every agent-supplied content string: HTML is sanitised,
 * everything else keeps the existing Markdown conversion byte for byte.
 * @param {string} text
 * @returns {string}
 */
export function contentToHtml(text) {
  const value = String(text ?? '');
  return looksLikeHtml(value) ? sanitizeHtml(value) : markdownToHtml(value);
}
