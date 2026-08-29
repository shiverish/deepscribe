/**
 * Block dependency rules: completion, cycle detection and blocker status.
 *
 * Shared domain core: imported by the renderer/bridge path
 * (`src/utils/dependencyUtils.ts`) and by the standalone Node MCP server
 * (`mcp/direct-store.mjs`), so it must stay free of DOM and Node APIs.
 *
 * @module
 */

/**
 * @typedef {import('../../src/types').Block} Block
 * @typedef {import('../../src/types').BlockDependencyStatus} BlockDependencyStatus
 */

const COMPLETION_TAGS = new Set(['done', 'agent-done', 'completed', 'klaar', 'afgerond']);

/**
 * Checks whether a block counts as completed or resolved.
 *
 * A typed task follows its own status; any other block counts as completed when
 * it carries a completion tag, or when every checklist item on it is checked.
 * @param {Block} block
 * @returns {boolean}
 */
export function isBlockCompleted(block) {
  if (block.isTrash) return false;
  if (block.kind === 'task' && block.task) return block.task.status === 'done';

  const hasDoneTag = (block.tags || []).some(tag => COMPLETION_TAGS.has(String(tag).toLowerCase().trim()));
  if (hasDoneTag) return true;

  return block.taskCount > 0 && block.completedTaskCount >= block.taskCount;
}

/**
 * Sanitizes and deduplicates a list of block dependency IDs.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function sanitizeDependsOn(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Set<string>} */
  const unique = new Set();
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) unique.add(trimmed);
    }
  }
  return Array.from(unique);
}

/**
 * Checks whether adding `candidateDependencyId` to `blockId` would create a cycle.
 * @param {Block[]} allBlocks
 * @param {string} blockId
 * @param {string} candidateDependencyId
 * @returns {boolean}
 */
export function detectCircularDependency(allBlocks, blockId, candidateDependencyId) {
  if (blockId === candidateDependencyId) return true;

  const byId = new Map(allBlocks.filter(b => !b.isTrash).map(b => [b.id, b]));
  /** @type {Set<string>} */
  const visited = new Set();
  const queue = [candidateDependencyId];

  while (queue.length > 0) {
    const currentId = /** @type {string} */ (queue.shift());
    if (currentId === blockId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentBlock = byId.get(currentId);
    if (currentBlock && Array.isArray(currentBlock.dependsOn)) {
      for (const nextId of currentBlock.dependsOn) {
        if (!visited.has(nextId)) queue.push(nextId);
      }
    }
  }

  return false;
}

/**
 * Evaluates the full dependency and blocker status for a given block.
 * @param {Block} block
 * @param {Block[]} allBlocks
 * @returns {BlockDependencyStatus}
 */
export function getBlockDependencyStatus(block, allBlocks) {
  const activeBlocks = allBlocks.filter(b => !b.isTrash);
  const byId = new Map(activeBlocks.map(b => [b.id, b]));

  const dependsOnIds = sanitizeDependsOn(block.dependsOn);
  /** @type {Block[]} */
  const pendingDependencies = [];
  /** @type {Block[]} */
  const completedDependencies = [];
  /** @type {string[]} */
  const missingDependencyIds = [];

  for (const depId of dependsOnIds) {
    const targetBlock = byId.get(depId);
    if (!targetBlock) {
      missingDependencyIds.push(depId);
      continue;
    }
    if (isBlockCompleted(targetBlock)) completedDependencies.push(targetBlock);
    else pendingDependencies.push(targetBlock);
  }

  const blocking = activeBlocks.filter(other => {
    if (other.id === block.id) return false;
    return sanitizeDependsOn(other.dependsOn).includes(block.id);
  });

  return {
    isBlocked: pendingDependencies.length > 0,
    pendingDependencies,
    completedDependencies,
    missingDependencyIds,
    blocking
  };
}

/**
 * Formats dependencies as Markdown for work items and daily summaries.
 * @param {Block[]} dependencies
 * @param {Block[]} [_allBlocks] Accepted for call-site compatibility; unused.
 * @returns {string}
 */
export function formatDependencyMarkdown(dependencies, _allBlocks) {
  if (!dependencies || dependencies.length === 0) return '';

  const lines = dependencies.map(dep => {
    const completed = isBlockCompleted(dep);
    const check = completed ? '[x]' : '[ ]';
    const statusText = completed ? 'Done' : 'Pending';
    return `- ${check} [[${dep.title}]] (\`${dep.id}\`) — *${statusText}*`;
  });

  return `## Dependencies\n\n${lines.join('\n')}`;
}
