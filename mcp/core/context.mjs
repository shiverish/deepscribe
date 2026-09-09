/**
 * Deterministic, budget-bounded context retrieval for agents.
 *
 * This module is deliberately storage-agnostic. Both the live Dexie bridge and
 * the offline SQLite adapter pass their records into this one domain function.
 */

import { collectRelatedBlocks } from './links.mjs';
import { rankChunksLocally } from './ranking.mjs';
import { htmlToPlainText } from './markdown.mjs';

const DEFAULT_MAX_CHARS = 12_000;
const MIN_MAX_CHARS = 1_000;
const MAX_MAX_CHARS = 50_000;
const MAX_PASSAGES = 10;
const MAX_RELATIONS = 10;
const RELATION_WEIGHTS = {
  'derived-from': 8,
  'source-of': 8,
  supports: 7,
  contradicts: 7,
  'relates-to': 4
};

/** @typedef {import('../../src/types').Project} Project */
/** @typedef {import('../../src/types').Block} Block */
/** @typedef {import('../../src/types').BlockLink} BlockLink */

/** @param {string} left @param {string} right */
function stableText(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

/** @param {unknown} value @returns {number} */
function normalizeMaxChars(value) {
  if (value === undefined) return DEFAULT_MAX_CHARS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_MAX_CHARS || value > MAX_MAX_CHARS) {
    throw new Error(`maxChars must be an integer between ${MIN_MAX_CHARS} and ${MAX_MAX_CHARS}.`);
  }
  return value;
}

/** @param {Project | undefined} project */
function activeProject(project) {
  return project && !project.isTrash && !project.systemKind;
}

/** @param {Block | undefined} block @param {Set<string>} projectIds */
function activeBlock(block, projectIds) {
  return block && !block.isTrash && projectIds.has(block.projectId);
}

/** @param {Block} block @param {Map<string, Block>} blocksById @returns {Block[]} */
function ancestry(block, blocksById) {
  /** @type {Block[]} */
  const result = [];
  const seen = new Set();
  /** @type {Block | undefined} */
  let current = block;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.unshift(current);
    current = current.parentId ? blocksById.get(current.parentId) : undefined;
  }
  return result;
}

/** @param {Block} left @param {Block} right @param {Map<string, Block>} blocksById */
function hierarchyDistance(left, right, blocksById) {
  if (left.projectId !== right.projectId) return null;
  const a = ancestry(left, blocksById);
  const b = ancestry(right, blocksById);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared].id === b[shared].id) shared += 1;
  return (a.length - shared) + (b.length - shared);
}

/** @param {unknown} value @param {number} maxChars */
function shortText(value, maxChars) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** @param {Block} block */
function taskHumanId(block) {
  return typeof block.task?.taskNumber === 'number' ? `#TSK-${block.task.taskNumber}` : undefined;
}

/** @param {unknown} value */
function prettyLength(value) {
  return JSON.stringify(value, null, 2).length;
}

/** @param {string} query @param {string | undefined} projectId @param {string | undefined} anchorBlockId @param {number} maxChars @returns {any} */
function createBudgetedResult(query, projectId, anchorBlockId, maxChars) {
  return {
    query,
    scope: {
      projectId: projectId ?? null,
      anchorBlockId: anchorBlockId ?? null
    },
    projects: [],
    anchor: null,
    passages: [],
    relations: [],
    tasks: [],
    budget: { maxChars, usedChars: 0, truncated: false }
  };
}

/** @param {any} result @param {number} maxChars */
function fits(result, maxChars) {
  // Leave room for the final usedChars value and a possible `truncated` flip.
  return prettyLength(result) <= maxChars - 24;
}

/** @param {any} result @param {'projects' | 'passages' | 'relations' | 'tasks'} key @param {any} value @param {number} maxChars */
function tryPush(result, key, value, maxChars) {
  result[key].push(value);
  if (fits(result, maxChars)) return true;
  result[key].pop();
  result.budget.truncated = true;
  return false;
}

/** @param {any} result @param {'anchor'} key @param {any} value @param {number} maxChars */
function trySet(result, key, value, maxChars) {
  const previous = result[key];
  result[key] = value;
  if (fits(result, maxChars)) return true;
  result[key] = previous;
  result.budget.truncated = true;
  return false;
}

/** @param {any} result */
function finishBudget(result) {
  // The number of digits in usedChars can change the serialized length. Iterate
  // until it describes the exact pretty-printed MCP payload length.
  for (let index = 0; index < 5; index += 1) {
    const measured = prettyLength(result);
    if (result.budget.usedChars === measured) break;
    result.budget.usedChars = measured;
  }
  return result;
}

/** @param {Block} block @param {Map<string, Block>} blocksById */
function pathSummary(block, blocksById) {
  return ancestry(block, blocksById).map(item => ({ blockId: item.id, title: item.title }));
}

/** @param {Project} project */
function projectSummary(project) {
  return {
    projectId: project.id,
    title: project.title,
    description: shortText(htmlToPlainText(project.description), 900),
    instructions: shortText(project.scratchpad, 1_400),
    updatedAt: project.updatedAt,
    instructionsUpdatedAt: project.scratchpadUpdatedAt ?? null
  };
}

/** @param {Project} project */
function minimalProjectSummary(project) {
  return {
    projectId: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    instructionsUpdatedAt: project.scratchpadUpdatedAt ?? null
  };
}

/**
 * Build one traceable context package for a concrete agent query.
 *
 * @param {{ query: string; projectId?: string; anchorBlockId?: string; maxChars?: number }} request
 * @param {{ projects: import('../../src/types').Project[]; blocks: import('../../src/types').Block[]; links: import('../../src/types').BlockLink[] }} records
 */
export function resolveAgentContext(request, records) {
  const query = String(request?.query ?? '').trim();
  if (!query) throw new Error('query is required.');
  const maxChars = normalizeMaxChars(request?.maxChars);
  const requestedProjectId = typeof request?.projectId === 'string' && request.projectId.trim() ? request.projectId.trim() : undefined;
  const anchorBlockId = typeof request?.anchorBlockId === 'string' && request.anchorBlockId.trim() ? request.anchorBlockId.trim() : undefined;

  const projects = (records?.projects ?? []).filter(activeProject);
  /** @type {Map<string, Project>} */
  const projectById = new Map(projects.map(project => [project.id, project]));
  if (requestedProjectId && !projectById.has(requestedProjectId)) throw new Error('Project not found.');

  const projectIds = new Set(projects.map(project => project.id));
  const blocks = (records?.blocks ?? []).filter(block => activeBlock(block, projectIds));
  /** @type {Map<string, Block>} */
  const blocksById = new Map(blocks.map(block => [block.id, block]));
  const anchor = anchorBlockId ? blocksById.get(anchorBlockId) : undefined;
  if (anchorBlockId && !anchor) throw new Error('Anchor block not found.');
  if (anchor && requestedProjectId && anchor.projectId !== requestedProjectId) {
    throw new Error('anchorBlockId does not belong to projectId.');
  }

  const scopedBlocks = requestedProjectId ? blocks.filter(block => block.projectId === requestedProjectId) : blocks;
  const allowedIds = new Set(scopedBlocks.map(block => block.id));
  const links = (records?.links ?? []).filter(link => blocksById.has(link.sourceBlockId) && blocksById.has(link.targetBlockId));

  const textHits = rankChunksLocally(scopedBlocks, query);
  const scored = new Map(textHits.map(hit => [hit.block.id, {
    block: hit.block,
    score: hit.score,
    snippet: hit.snippet,
    heading: hit.heading,
    chunkIndex: hit.chunkIndex,
    reasons: hit.matchReasons.map(reason => `text:${reason}`)
  }]));

  /** @type {Array<{ block: Block; distance: number; direction: 'outgoing' | 'incoming'; type: import('../../src/types').BlockLinkType }>} */
  let anchorRelations = [];
  if (anchor) {
    for (const block of scopedBlocks) {
      const distance = hierarchyDistance(anchor, block, blocksById);
      if (distance === null || distance > 3) continue;
      const bonus = distance === 0 ? 40 : distance === 1 ? 14 : distance === 2 ? 7 : 3;
      const entry = scored.get(block.id) ?? { block, score: 0, snippet: shortText(block.plainText, 280), heading: '', chunkIndex: -1, reasons: [] };
      entry.score += bonus;
      entry.reasons.push(distance === 0 ? 'anchor' : `hierarchy:${distance}`);
      scored.set(block.id, entry);
    }

    anchorRelations = collectRelatedBlocks(anchor.id, links, blocksById, { depth: 2 })
      .filter(entry => allowedIds.has(entry.block.id))
      .sort((left, right) => left.distance - right.distance
        || stableText(left.type, right.type)
        || stableText(left.direction, right.direction)
        || stableText(left.block.id, right.block.id));
    for (const related of anchorRelations) {
      const weight = RELATION_WEIGHTS[related.type] ?? 4;
      const entry = scored.get(related.block.id) ?? { block: related.block, score: 0, snippet: shortText(related.block.plainText, 280), heading: '', chunkIndex: -1, reasons: [] };
      entry.score += weight / related.distance;
      entry.reasons.push(`relation:${related.type}:${related.direction}:${related.distance}`);
      scored.set(related.block.id, entry);
    }
  }

  const ranked = [...scored.values()].sort((left, right) => right.score - left.score
    || (right.block.updatedAt ?? 0) - (left.block.updatedAt ?? 0)
    || stableText(left.block.id, right.block.id));

  const result = createBudgetedResult(query, requestedProjectId, anchorBlockId, maxChars);
  /** @type {string[]} */
  const relevantProjectIds = [];
  for (const id of [requestedProjectId, anchor?.projectId, ...ranked.map(entry => entry.block.projectId)]) {
    if (id && !relevantProjectIds.includes(id)) relevantProjectIds.push(id);
  }
  for (const id of relevantProjectIds.slice(0, 3)) {
    const project = projectById.get(id);
    if (!project) continue;
    if (!tryPush(result, 'projects', projectSummary(project), maxChars)) {
      tryPush(result, 'projects', minimalProjectSummary(project), maxChars);
    }
  }

  if (anchor) {
    const siblings = scopedBlocks.filter(block => block.parentId === anchor.parentId && block.id !== anchor.id)
      .sort((left, right) => left.order - right.order || stableText(left.id, right.id))
      .slice(0, 8).map(block => ({ blockId: block.id, title: block.title, updatedAt: block.updatedAt }));
    const children = scopedBlocks.filter(block => block.parentId === anchor.id)
      .sort((left, right) => left.order - right.order || stableText(left.id, right.id))
      .slice(0, 8).map(block => ({ blockId: block.id, title: block.title, updatedAt: block.updatedAt }));
    const fullAnchor = {
      blockId: anchor.id,
      projectId: anchor.projectId,
      title: anchor.title,
      updatedAt: anchor.updatedAt,
      path: pathSummary(anchor, blocksById),
      siblings,
      children
    };
    const minimalAnchor = { blockId: anchor.id, projectId: anchor.projectId, title: anchor.title, updatedAt: anchor.updatedAt };
    if (!trySet(result, 'anchor', fullAnchor, maxChars)) trySet(result, 'anchor', minimalAnchor, maxChars);
  }

  for (const entry of ranked.slice(0, MAX_PASSAGES)) {
    const block = entry.block;
    tryPush(result, 'passages', {
      blockId: block.id,
      projectId: block.projectId,
      projectTitle: projectById.get(block.projectId)?.title ?? null,
      title: block.title,
      heading: entry.heading || null,
      snippet: shortText(entry.snippet || block.plainText, 360),
      score: Math.round(entry.score * 10) / 10,
      matchReasons: [...new Set(entry.reasons)].sort(stableText),
      chunkIndex: entry.chunkIndex >= 0 ? entry.chunkIndex : null,
      updatedAt: block.updatedAt
    }, maxChars);
  }

  const selectedIds = new Set(result.passages.map((/** @type {any} */ passage) => passage.blockId));
  const relationRows = anchor
    ? anchorRelations.map(entry => ({ fromBlockId: anchor.id, ...entry }))
    : [...selectedIds].slice(0, 4).flatMap(fromBlockId => collectRelatedBlocks(fromBlockId, links, blocksById, { depth: 1 })
      .filter(entry => allowedIds.has(entry.block.id))
      .map(entry => ({ fromBlockId, ...entry })));
  const seenRelations = new Set();
  for (const entry of relationRows.sort((left, right) => left.distance - right.distance
    || stableText(left.fromBlockId, right.fromBlockId)
    || stableText(left.type, right.type)
    || stableText(left.direction, right.direction)
    || stableText(left.block.id, right.block.id)).slice(0, MAX_RELATIONS)) {
    const key = `${entry.fromBlockId}\u0000${entry.block.id}\u0000${entry.type}\u0000${entry.direction}`;
    if (seenRelations.has(key)) continue;
    seenRelations.add(key);
    tryPush(result, 'relations', {
      fromBlockId: entry.fromBlockId,
      blockId: entry.block.id,
      projectId: entry.block.projectId,
      projectTitle: projectById.get(entry.block.projectId)?.title ?? null,
      title: entry.block.title,
      type: entry.type,
      direction: entry.direction,
      distance: entry.distance,
      updatedAt: entry.block.updatedAt
    }, maxChars);
  }

  const relevantTasks = scopedBlocks.filter(block => block.kind === 'task' && block.task && (
    selectedIds.has(block.id)
    || block.id === anchor?.id
    || (block.dependsOn ?? []).some(id => selectedIds.has(id))
    || [...selectedIds].some(id => blocksById.get(id)?.dependsOn?.includes(block.id))
  )).sort((left, right) => (left.task?.position ?? left.order) - (right.task?.position ?? right.order) || stableText(left.id, right.id));
  for (const task of relevantTasks) {
    const taskMetadata = task.task;
    if (!taskMetadata) continue;
    tryPush(result, 'tasks', {
      blockId: task.id,
      humanId: taskHumanId(task) ?? null,
      projectId: task.projectId,
      title: task.title,
      status: taskMetadata.status,
      assigneeTarget: taskMetadata.agentTarget,
      dependsOn: (task.dependsOn ?? []).map(id => {
        const dependency = blocksById.get(id);
        return { blockId: id, title: dependency?.title ?? null, status: dependency?.task?.status ?? null, missing: !dependency };
      }),
      updatedAt: task.updatedAt
    }, maxChars);
  }

  return finishBudget(result);
}

export const CONTEXT_LIMITS = Object.freeze({
  defaultMaxChars: DEFAULT_MAX_CHARS,
  minMaxChars: MIN_MAX_CHARS,
  maxMaxChars: MAX_MAX_CHARS
});
