/**
 * Splits stored block HTML into retrievable chunks.
 *
 * A block can hold an entire manuscript chapter, so scoring whole blocks buries
 * a single relevant paragraph in tens of thousands of characters. Chunks keep
 * the heading they sit under, so a hit can be shown and explained in context.
 *
 * Shared domain core: imported by the renderer/bridge path and by the
 * standalone Node MCP server, so it must stay free of DOM and Node APIs.
 *
 * @module
 */

import { htmlToPlainText } from './markdown.mjs';

/**
 * @typedef {object} BlockChunk
 * @property {number} index Position of the chunk within its block, from 0.
 * @property {string} heading Nearest enclosing heading, '' when there is none.
 * @property {string} text Plain text of the chunk.
 */

export const DEFAULT_CHUNK_OPTIONS = {
  /** Preferred chunk length; segments are packed up to this size. */
  targetChars: 700,
  /** A single segment longer than this is split further. */
  maxChars: 1200,
  /** Tail of the previous chunk repeated so matches spanning a seam survive. */
  overlapChars: 120
};

const BLOCK_BOUNDARY = /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr|table|ul|ol)\s*>/gi;
const HEADING = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i;

/**
 * Splits HTML into its block-level segments, each tagged with the heading in
 * force at that point.
 * @param {string} content
 * @returns {Array<{ heading: string; text: string }>}
 */
function segmentsFromHtml(content) {
  const html = String(content ?? '');
  /** @type {Array<{ heading: string; text: string }>} */
  const segments = [];
  let heading = '';
  let cursor = 0;

  BLOCK_BOUNDARY.lastIndex = 0;
  for (const match of html.matchAll(BLOCK_BOUNDARY)) {
    const end = (match.index ?? 0) + match[0].length;
    const raw = html.slice(cursor, end);
    cursor = end;

    const headingMatch = HEADING.exec(raw);
    if (headingMatch) {
      const headingText = htmlToPlainText(headingMatch[2]).trim();
      if (headingText) {
        heading = headingText;
        continue;
      }
    }

    const text = htmlToPlainText(raw).replace(/\s+/g, ' ').trim();
    if (text) segments.push({ heading, text });
  }

  const tail = htmlToPlainText(html.slice(cursor)).replace(/\s+/g, ' ').trim();
  if (tail) segments.push({ heading, text: tail });
  return segments;
}

/**
 * Splits an oversized segment on sentence boundaries, falling back to a hard
 * cut when a single sentence is itself too long.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function splitLongSegment(text, maxChars) {
  /** @type {string[]} */
  const parts = [];
  let remainder = text;

  while (remainder.length > maxChars) {
    const window = remainder.slice(0, maxChars);
    const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
    const wordEnd = window.lastIndexOf(' ');
    const cut = sentenceEnd > maxChars * 0.5 ? sentenceEnd + 1
      : wordEnd > maxChars * 0.5 ? wordEnd
        : maxChars;
    parts.push(remainder.slice(0, cut).trim());
    remainder = remainder.slice(cut).trim();
  }

  if (remainder) parts.push(remainder);
  return parts;
}

/**
 * Turns stored block HTML into chunks ready for scoring.
 *
 * Segments are packed up to `targetChars` and never cross a heading, so a chunk
 * always describes one part of the document. Consecutive chunks under the same
 * heading share a short overlap so a phrase split across a seam still matches.
 * @param {string} content Stored block HTML.
 * @param {Partial<typeof DEFAULT_CHUNK_OPTIONS>} [options]
 * @returns {BlockChunk[]}
 */
export function chunkBlockContent(content, options = {}) {
  const { targetChars, maxChars, overlapChars } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const segments = segmentsFromHtml(content);
  /** @type {BlockChunk[]} */
  const chunks = [];

  /** @type {string[]} */
  let buffer = [];
  let bufferLength = 0;
  let bufferHeading = '';

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(' ').trim();
    if (text) chunks.push({ index: chunks.length, heading: bufferHeading, text });
    buffer = [];
    bufferLength = 0;
  };

  for (const segment of segments) {
    if (segment.heading !== bufferHeading) {
      flush();
      bufferHeading = segment.heading;
    }

    for (const piece of segment.text.length > maxChars ? splitLongSegment(segment.text, maxChars) : [segment.text]) {
      if (bufferLength > 0 && bufferLength + piece.length > targetChars) {
        const previous = buffer.join(' ');
        flush();
        const overlap = previous.slice(-overlapChars).trim();
        if (overlap && overlapChars > 0) {
          buffer.push(overlap);
          bufferLength = overlap.length;
        }
      }
      buffer.push(piece);
      bufferLength += piece.length;
    }
  }
  flush();

  if (chunks.length === 0) {
    const fallback = htmlToPlainText(content).replace(/\s+/g, ' ').trim();
    if (fallback) chunks.push({ index: 0, heading: '', text: fallback });
  }
  return chunks;
}

/**
 * Builds a readable excerpt centred on the first matching term.
 * @param {string} text
 * @param {string[]} terms Normalized query tokens.
 * @param {number} [width]
 * @returns {string}
 */
export function buildSnippet(text, terms, width = 240) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  if (source.length <= width) return source;

  let position = -1;
  for (const term of terms) {
    if (!term) continue;
    const found = source.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
    if (found >= 0 && (position < 0 || found < position)) position = found;
  }
  if (position < 0) return `${source.slice(0, width).trim()}…`;

  const start = Math.max(0, position - Math.floor(width / 3));
  const end = Math.min(source.length, start + width);
  const wordStart = start > 0 ? source.indexOf(' ', start) + 1 || start : 0;
  const excerpt = source.slice(wordStart, end).trim();
  return `${wordStart > 0 ? '…' : ''}${excerpt}${end < source.length ? '…' : ''}`;
}
