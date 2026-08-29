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
import { markdownToHtml } from './markdown.mjs';
import { parseTaskHumanId } from './tasks.mjs';

/**
 * @typedef {import('../../src/types').Block} Block
 * @typedef {import('../../src/types').Project} Project
 * @typedef {'title' | 'tag' | 'task-number' | 'body' | 'similar-title'} MatchReason
 * @typedef {object} ChunkHit
 * @property {Block} block
 * @property {number} score
 * @property {string} snippet
 * @property {MatchReason[]} matchReasons
 * @property {number} chunkIndex Index of the best-matching chunk, -1 when the hit came from metadata only.
 * @property {string} heading Heading the best-matching chunk sits under.
 *
 * @typedef {object} ProjectHit
 * @property {Project} project
 * @property {number} score
 * @property {string} snippet
 * @property {MatchReason[]} matchReasons
 * @property {string} heading Heading the best-matching passage sits under.
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
 * Entries are keyed by record id and invalidated on a version string, so the
 * index holds at most one entry per record and can never serve stale content.
 * Block and project ids carry distinct prefixes, so they share this map safely.
 * @type {Map<string, { version: string; entry: IndexEntry }>}
 */
const indexCache = new Map();

/**
 * @param {string} id
 * @param {string} version
 * @param {() => IndexEntry} build
 * @returns {IndexEntry}
 */
function cachedEntry(id, version, build) {
  const cached = indexCache.get(id);
  if (cached && cached.version === version) return cached.entry;
  const entry = build();
  indexCache.set(id, { version, entry });
  return entry;
}

/**
 * @typedef {object} IndexedChunk
 * @property {number} index
 * @property {string} heading
 * @property {string} text
 * @property {Map<string, number>} counts
 *
 * @typedef {object} IndexEntry
 * @property {Set<string>} titleTokens
 * @property {Set<string>} tagTokens
 * @property {IndexedChunk[]} chunks
 */

/**
 * Returns the index entry for a block, rebuilding it only when the block changed.
 * @param {Block} block
 * @returns {IndexEntry}
 */
export function indexEntryForBlock(block) {
  return cachedEntry(block.id, String(block.updatedAt), () => ({
    titleTokens: new Set(tokens(block.title)),
    tagTokens: new Set((block.tags || []).flatMap(tokens)),
    chunks: chunkBlockContent(block.content || '').map(chunk => ({
      ...chunk,
      counts: tokenCounts(`${chunk.heading} ${chunk.text}`)
    }))
  }));
}

/**
 * Returns the index entry for a project.
 *
 * A project is not a block, but its description and scratchpad hold decisions
 * that exist nowhere else. The scratchpad is Markdown, so it is converted first
 * and its `##` headings become chunk headings — which is what lets a hit report
 * the section it came from.
 * @param {Project} project
 * @returns {IndexEntry}
 */
export function indexEntryForProject(project) {
  const version = `${project.updatedAt}:${project.scratchpadUpdatedAt ?? 0}`;
  return cachedEntry(project.id, version, () => {
    const segments = [
      ...chunkBlockContent(project.description || ''),
      ...chunkBlockContent(markdownToHtml(project.scratchpad || ''))
    ];
    return {
      titleTokens: new Set(tokens(project.title)),
      tagTokens: new Set((project.tags || []).flatMap(tokens)),
      chunks: segments.map((chunk, index) => ({
        ...chunk,
        index,
        counts: tokenCounts(`${chunk.heading} ${chunk.text}`)
      }))
    };
  });
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
 * @typedef {object} QueryState
 * @property {string[]} queryTokens
 * @property {Set<string>} expanded
 * @property {number[]} queryTaskNumbers
 * @property {boolean} singleTaskMatch
 * @property {string} normalizedQuery
 */

/**
 * Prepares a query once so every candidate is scored against the same state.
 * @param {string} query
 * @returns {QueryState | null} Null when the query carries nothing to match on.
 */
function buildQueryState(query) {
  const queryTokens = tokens(query);
  const queryTaskNumbers = extractQueryTaskNumbers(query);
  if (queryTokens.length === 0 && queryTaskNumbers.length === 0) return null;
  const trimmedQuery = String(query ?? '').trim();
  return {
    queryTokens,
    expanded: expandQuery(queryTokens),
    queryTaskNumbers,
    singleTaskMatch: queryTaskNumbers.length === 1 && (
      parseTaskHumanId(trimmedQuery) !== null || /^\d+$/.test(trimmedQuery)
    ),
    normalizedQuery: queryTokens.join(' ')
  };
}

/**
 * Scores one indexed record: metadata signals count once, and the body score
 * comes from the single best-matching chunk rather than the whole document.
 * @param {IndexEntry} entry
 * @param {string} title
 * @param {QueryState} state
 * @param {number | null} taskNumber
 * @returns {{ score: number; bestChunk: IndexedChunk | null; matchReasons: MatchReason[] } | null}
 */
function scoreEntry(entry, title, state, taskNumber) {
  const { queryTokens, expanded, queryTaskNumbers, singleTaskMatch, normalizedQuery } = state;
  /** @type {Set<MatchReason>} */
  const matchReasons = new Set();
  const taskTokens = taskNumber ? new Set([`tsk-${taskNumber}`, `${taskNumber}`]) : null;

  let metadataScore = 0;
  if (taskNumber !== null && queryTaskNumbers.includes(taskNumber)) {
    metadataScore += singleTaskMatch ? 100 : 50;
    matchReasons.add('task-number');
  }
  for (const token of expanded) {
    const exact = queryTokens.includes(token);
    if (entry.titleTokens.has(token)) {
      metadataScore += exact ? 8 : 3;
      matchReasons.add('title');
    }
    if (entry.tagTokens.has(token)) {
      metadataScore += exact ? 6 : 2;
      matchReasons.add('tag');
    }
    if (taskTokens?.has(token)) {
      metadataScore += exact ? 8 : 3;
      matchReasons.add('task-number');
    }
  }
  const titleSimilarity = trigramSimilarity(normalizedQuery, normalizeToken(title)) * 4;
  if (titleSimilarity >= 1) matchReasons.add('similar-title');
  metadataScore += titleSimilarity;

  let bestChunkScore = 0;
  /** @type {IndexedChunk | null} */
  let bestChunk = null;
  for (const chunk of entry.chunks) {
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
  return score >= 1 ? { score, bestChunk, matchReasons: [...matchReasons] } : null;
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
  const state = buildQueryState(query);
  if (!state) return [];

  /** @type {ChunkHit[]} */
  const hits = [];
  for (const block of blocks) {
    const taskNumber = block.kind === 'task' && typeof block.task?.taskNumber === 'number' ? block.task.taskNumber : null;
    const scored = scoreEntry(indexEntryForBlock(block), block.title, state, taskNumber);
    if (!scored) continue;
    hits.push({
      block,
      score: scored.score,
      snippet: buildSnippet(scored.bestChunk ? scored.bestChunk.text : block.plainText, state.queryTokens),
      matchReasons: scored.matchReasons,
      chunkIndex: scored.bestChunk ? scored.bestChunk.index : -1,
      heading: scored.bestChunk ? scored.bestChunk.heading : ''
    });
  }
  return hits.sort((a, b) => b.score - a.score || b.block.updatedAt - a.block.updatedAt);
}

/**
 * Scores projects on their title, tags, description and scratchpad, so the
 * decisions recorded there are findable rather than effectively non-existent.
 * @param {Project[]} projects
 * @param {string} query
 * @returns {ProjectHit[]}
 */
export function rankProjectsLocally(projects, query) {
  const state = buildQueryState(query);
  if (!state) return [];

  /** @type {ProjectHit[]} */
  const hits = [];
  for (const project of projects) {
    const scored = scoreEntry(indexEntryForProject(project), project.title, state, null);
    if (!scored) continue;
    hits.push({
      project,
      score: scored.score,
      snippet: buildSnippet(scored.bestChunk ? scored.bestChunk.text : project.title, state.queryTokens),
      matchReasons: scored.matchReasons,
      heading: scored.bestChunk ? scored.bestChunk.heading : ''
    });
  }
  return hits.sort((a, b) => b.score - a.score || b.project.updatedAt - a.project.updatedAt);
}
