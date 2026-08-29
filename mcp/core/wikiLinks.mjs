/**
 * The `[[Title]]` syntax users write to reference another block.
 *
 * Shared domain core: imported by both the renderer/bridge path and the
 * standalone Node MCP server, so it must stay free of DOM and Node APIs.
 *
 * @module
 */

const WIKI_LINK_PATTERN = /\[\[([^\r\n]{1,120}?)\]\]/g;

/**
 * Returns the distinct titles referenced in a piece of text, in the order they
 * first appear.
 * @param {string} text
 * @returns {string[]}
 */
export function extractWikiLinks(text) {
  /** @type {Set<string>} */
  const links = new Set();
  for (const match of String(text ?? '').matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1].trim();
    if (title) links.add(title);
  }
  return [...links];
}
