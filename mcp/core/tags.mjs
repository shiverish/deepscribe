/**
 * Tag normalization and validation.
 *
 * Shared domain core: this module is imported both by the renderer/bridge path
 * (`src/utils/tagUtils.ts`) and by the standalone Node MCP server
 * (`mcp/direct-store.mjs`), so it must stay free of DOM and Node APIs.
 *
 * @module
 */

export const TAG_MAX_LENGTH = 48;

const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

/**
 * Produces the canonical representation used in storage and comparisons.
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  return String(tag ?? '').normalize('NFC').trim().replace(/^#+/, '').trim().toLowerCase();
}

/**
 * Validates user or imported input and returns its canonical representation.
 * @param {string} input
 * @returns {{ tag: string | null; error: string | null }}
 */
export function parseTag(input) {
  const tag = normalizeTag(input);
  if (!tag) return { tag: null, error: 'Enter a tag.' };
  if (tag.length > TAG_MAX_LENGTH) {
    return { tag: null, error: `A tag can contain no more than ${TAG_MAX_LENGTH} characters.` };
  }
  if (!TAG_PATTERN.test(tag)) {
    return { tag: null, error: 'Use only letters, numbers, hyphens, and underscores.' };
  }
  return { tag, error: null };
}

/**
 * Normalizes, validates and deduplicates a list while preserving its order.
 * @param {readonly string[]} [tags]
 * @returns {string[]}
 */
export function sanitizeTags(tags = []) {
  const result = new Set();
  for (const candidate of tags) {
    const parsed = parseTag(candidate);
    if (parsed.tag) result.add(parsed.tag);
  }
  return Array.from(result);
}

/**
 * Merges tag arrays using the same validation as manual input and imports.
 * @param {readonly string[]} [existing]
 * @param {readonly string[]} [additions]
 * @returns {string[]}
 */
export function mergeTags(existing = [], additions = []) {
  return sanitizeTags([...existing, ...additions]);
}
