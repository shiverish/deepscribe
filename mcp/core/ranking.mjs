/**
 * Local lexical ranking for block search.
 *
 * Shared domain core: imported by the renderer/bridge path
 * (`src/utils/semanticSearch.ts`) and by the standalone Node MCP server
 * (`mcp/direct-store.mjs`), so it must stay free of DOM and Node APIs.
 *
 * @module
 */

import { buildSnippet, chunkBlockContent } from './chunking.mjs';
import { parseTaskHumanId } from './tasks.mjs';

/**
 * @typedef {import('../../src/types').Block} Block
 * @typedef {'title' | 'tag' | 'task-number' | 'body' | 'similar-title'} MatchReason
 * @typedef {object} ChunkHit
 * @property {Block} block
 * @property {number} score
 * @property {string} snippet
 * @property {MatchReason[]} matchReasons
 * @property {number} chunkIndex Index of the best-matching chunk, -1 when the hit came from metadata only.
 * @property {string} heading Heading the best-matching chunk sits under.
 */

const STOP_WORDS = new Set(['de', 'het', 'een', 'en', 'of', 'van', 'voor', 'met', 'in', 'op', 'aan', 'is', 'zijn', 'te', 'dit', 'dat']);

const CONCEPT_GROUPS = [
  ['todo', 'taak', 'taken', 'actie', 'werk'],
  ['idee', 'concept', 'gedachte', 'voorstel'],
  ['agent', 'agents', 'ai', 'assistent', 'automatisering'],
  ['bestand', 'bestanden', 'document', 'bijlage', 'file'],
  ['zoeken', 'zoekfunctie', 'vinden', 'search'],
  ['app', 'applicatie', 'software', 'programma'],
  ['fout', 'bug', 'probleem', 'issue'],
  ['ontwerp', 'design', 'ui', 'interface']
];

/**
 * @param {string} token
 * @returns {string}
 */
function normalizeToken(token) {
  return token.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '');
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokens(text) {
  return String(text ?? '').split(/\s+/).map(normalizeToken).filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * @param {string[]} queryTokens
 * @returns {Set<string>}
 */
function expandQuery(queryTokens) {
  const expanded = new Set(queryTokens);
  for (const token of queryTokens) {
    const group = CONCEPT_GROUPS.find(values => values.includes(token));
    group?.forEach(value => expanded.add(value));
  }
  return expanded;
}

/**
 * @param {string} value
 * @returns {Set<string>}
 */
function trigrams(value) {
  const padded = `  ${value} `;
  /** @type {Set<string>} */
  const result = new Set();
  for (let index = 0; index <= padded.length - 3; index += 1) result.add(padded.slice(index, index + 3));
  return result;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function trigramSimilarity(left, right) {
  const a = trigrams(left);
  const b = trigrams(right);
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return a.size + b.size ? (2 * overlap) / (a.size + b.size) : 0;
}

/**
 * @param {string} query
 * @returns {number[]}
 */
function extractQueryTaskNumbers(query) {
  /** @type {Set<number>} */
  const numbers = new Set();
  for (const part of String(query ?? '').trim().split(/\s+/)) {
    if (!part) continue;
    const fromId = parseTaskHumanId(part);
    if (fromId !== null) {
      numbers.add(fromId);
    } else if (/^\d+$/.test(part)) {
      const num = parseInt(part, 10);
      if (Number.isFinite(num) && num > 0) numbers.add(num);
    }
  }
  return Array.from(numbers);
}

/**
 * Scores blocks against a free-text query. Title, tags and task numbers weigh
 * heavier than body hits; concept groups let a synonym still match.
 * @param {Block[]} blocks
 * @param {string} query
 * @returns {Array<{ block: Block; score: number }>}
 */
export function rankBlocksLocally(blocks, query) {
  const queryTokens = tokens(query);
  const queryTaskNumbers = extractQueryTaskNumbers(query);
  if (queryTokens.length === 0 && queryTaskNumbers.length === 0) return [];
  const expanded = expandQuery(queryTokens);
  const normalizedQuery = queryTokens.join(' ');
  const trimmedQuery = String(query ?? '').trim();
  const singleTaskMatch = queryTaskNumbers.length === 1 && (
    parseTaskHumanId(trimmedQuery) !== null || /^\d+$/.test(trimmedQuery)
  );

  return blocks.map(block => {
    const titleTokens = tokens(block.title);
    const bodyTokens = tokens(block.plainText);
    const tagTokens = (block.tags || []).flatMap(tokens);
    const taskNumber = block.kind === 'task' && typeof block.task?.taskNumber === 'number' ? block.task.taskNumber : null;
    const taskTokens = taskNumber ? [`tsk-${taskNumber}`, `${taskNumber}`] : [];

    let score = 0;
    if (taskNumber !== null && queryTaskNumbers.includes(taskNumber)) {
      score += singleTaskMatch ? 100 : 50;
    }

    for (const token of expanded) {
      if (titleTokens.includes(token)) score += queryTokens.includes(token) ? 8 : 3;
      if (tagTokens.includes(token)) score += queryTokens.includes(token) ? 6 : 2;
      if (taskTokens.includes(token)) score += queryTokens.includes(token) ? 8 : 3;
      const bodyHits = bodyTokens.filter(value => value === token).length;
      score += Math.min(bodyHits, 4) * (queryTokens.includes(token) ? 2 : 1);
    }
    score += trigramSimilarity(normalizedQuery, normalizeToken(block.title)) * 4;
    return { block, score };
  }).filter(result => result.score >= 1).sort((a, b) => b.score - a.score || b.block.updatedAt - a.block.updatedAt);
}

/**
 * Counts occurrences per token so scoring is a lookup instead of a scan.
 * @param {string} text
 * @returns {Map<string, number>}
 */
function tokenCounts(text) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const token of tokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/**
 * The search index: one entry per block, holding its chunks with their token
 * counts already computed. Without this every query would re-tokenize the whole
 * workspace, which dominates query cost.
 *
 * Entries are keyed by block id and invalidated on `updatedAt`, so the index
 * holds at most one entry per block and can never serve stale content.
 * @type {Map<string, { updatedAt: number; entry: BlockIndexEntry }>}
 */
const indexCache = new Map();

/**
 * @typedef {object} IndexedChunk
 * @property {number} index
 * @property {string} heading
 * @property {string} text
 * @property {Map<string, number>} counts
 *
 * @typedef {object} BlockIndexEntry
 * @property {Set<string>} titleTokens
 * @property {Set<string>} tagTokens
 * @property {IndexedChunk[]} chunks
 */

/**
 * Returns the index entry for a block, rebuilding it only when the block changed.
 * @param {Block} block
 * @returns {BlockIndexEntry}
 */
export function indexEntryForBlock(block) {
  const cached = indexCache.get(block.id);
  if (cached && cached.updatedAt === block.updatedAt) return cached.entry;

  const entry = {
    titleTokens: new Set(tokens(block.title)),
    tagTokens: new Set((block.tags || []).flatMap(tokens)),
    chunks: chunkBlockContent(block.content || '').map(chunk => ({
      ...chunk,
      counts: tokenCounts(`${chunk.heading} ${chunk.text}`)
    }))
  };
  indexCache.set(block.id, { updatedAt: block.updatedAt, entry });
  return entry;
}

/**
 * Returns the chunks for a block, reusing the cached split when unchanged.
 * @param {Block} block
 * @returns {import('./chunking.mjs').BlockChunk[]}
 */
export function chunksForBlock(block) {
  return indexEntryForBlock(block).chunks.map(({ index, heading, text }) => ({ index, heading, text }));
}

/**
 * Drops cached chunks. Call with a block id when a block is trashed or deleted
 * so its chunks cannot outlive it; call without arguments to clear everything.
 * @param {string} [blockId]
 */
export function invalidateChunks(blockId) {
  if (blockId === undefined) indexCache.clear();
  else indexCache.delete(blockId);
}

/**
 * Scores blocks through their chunks, so one relevant passage inside a very
 * long block still surfaces, and reports which chunk matched.
 *
 * Metadata signals (title, tags, task number) belong to the block and are added
 * once, to its best chunk, rather than to every chunk.
 * @param {Block[]} blocks
 * @param {string} query
 * @returns {ChunkHit[]}
 */
export function rankChunksLocally(blocks, query) {
  const queryTokens = tokens(query);
  const queryTaskNumbers = extractQueryTaskNumbers(query);
  if (queryTokens.length === 0 && queryTaskNumbers.length === 0) return [];
  const expanded = expandQuery(queryTokens);
  const normalizedQuery = queryTokens.join(' ');
  const trimmedQuery = String(query ?? '').trim();
  const singleTaskMatch = queryTaskNumbers.length === 1 && (
    parseTaskHumanId(trimmedQuery) !== null || /^\d+$/.test(trimmedQuery)
  );

  /** @type {ChunkHit[]} */
  const hits = [];

  for (const block of blocks) {
    /** @type {Set<MatchReason>} */
    const matchReasons = new Set();
    const { titleTokens, tagTokens, chunks } = indexEntryForBlock(block);
    const taskNumber = block.kind === 'task' && typeof block.task?.taskNumber === 'number' ? block.task.taskNumber : null;
    const taskTokens = taskNumber ? new Set([`tsk-${taskNumber}`, `${taskNumber}`]) : null;

    let metadataScore = 0;
    if (taskNumber !== null && queryTaskNumbers.includes(taskNumber)) {
      metadataScore += singleTaskMatch ? 100 : 50;
      matchReasons.add('task-number');
    }
    for (const token of expanded) {
      const exact = queryTokens.includes(token);
      if (titleTokens.has(token)) {
        metadataScore += exact ? 8 : 3;
        matchReasons.add('title');
      }
      if (tagTokens.has(token)) {
        metadataScore += exact ? 6 : 2;
        matchReasons.add('tag');
      }
      if (taskTokens?.has(token)) {
        metadataScore += exact ? 8 : 3;
        matchReasons.add('task-number');
      }
    }
    const titleSimilarity = trigramSimilarity(normalizedQuery, normalizeToken(block.title)) * 4;
    if (titleSimilarity >= 1) matchReasons.add('similar-title');
    metadataScore += titleSimilarity;

    let bestChunkScore = 0;
    /** @type {IndexedChunk | null} */
    let bestChunk = null;
    for (const chunk of chunks) {
      let chunkScore = 0;
      let distinct = 0;
      for (const token of expanded) {
        const hitCount = chunk.counts.get(token) ?? 0;
        if (hitCount === 0) continue;
        chunkScore += Math.min(hitCount, 4) * (queryTokens.includes(token) ? 2 : 1);
        if (queryTokens.includes(token)) distinct += 1;
      }
      // Reward a chunk that carries several distinct query terms at once.
      if (distinct > 1) chunkScore *= 1 + (distinct - 1) * 0.5;
      if (chunkScore > bestChunkScore) {
        bestChunkScore = chunkScore;
        bestChunk = chunk;
      }
    }
    if (bestChunkScore > 0) matchReasons.add('body');

    const score = metadataScore + bestChunkScore;
    if (score < 1) continue;

    hits.push({
      block,
      score,
      snippet: buildSnippet(bestChunk ? bestChunk.text : block.plainText, queryTokens),
      matchReasons: [...matchReasons],
      chunkIndex: bestChunk ? bestChunk.index : -1,
      heading: bestChunk ? bestChunk.heading : ''
    });
  }

  return hits.sort((a, b) => b.score - a.score || b.block.updatedAt - a.block.updatedAt);
}
