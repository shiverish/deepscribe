import type { Block, BlockDependencyStatus } from '../types';

/**
 * Checks if a block is considered completed / resolved.
 * A block is completed if it has a completion tag (done, agent-done, completed)
 * or if all of its checklist tasks are completed (when tasks exist).
 */
export function isBlockCompleted(block: Block): boolean {
  if (block.isTrash) return false;
  if (block.kind === 'task' && block.task) return block.task.status === 'done';

  const hasDoneTag = block.tags.some(tag => {
    const normalized = tag.toLowerCase().trim();
    return normalized === 'done' || normalized === 'agent-done' || normalized === 'completed' || normalized === 'klaar' || normalized === 'afgerond';
  });

  if (hasDoneTag) return true;

  if (block.taskCount > 0 && block.completedTaskCount >= block.taskCount) {
    return true;
  }

  return false;
}

/**
 * Sanitizes and deduplicates a list of block dependency IDs.
 */
export function sanitizeDependsOn(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        unique.add(trimmed);
      }
    }
  }
  return Array.from(unique);
}

/**
 * Checks whether adding `candidateDependencyId` to `blockId`'s dependencies would create a cycle.
 */
export function detectCircularDependency(
  allBlocks: Block[],
  blockId: string,
  candidateDependencyId: string
): boolean {
  if (blockId === candidateDependencyId) return true;

  const byId = new Map(allBlocks.filter(b => !b.isTrash).map(b => [b.id, b]));
  const visited = new Set<string>();
  const queue: string[] = [candidateDependencyId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === blockId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentBlock = byId.get(currentId);
    if (currentBlock && Array.isArray(currentBlock.dependsOn)) {
      for (const nextId of currentBlock.dependsOn) {
        if (!visited.has(nextId)) {
          queue.push(nextId);
        }
      }
    }
  }

  return false;
}

/**
 * Evaluates the full dependency and blocker status for a given block.
 */
export function getBlockDependencyStatus(
  block: Block,
  allBlocks: Block[]
): BlockDependencyStatus {
  const activeBlocks = allBlocks.filter(b => !b.isTrash);
  const byId = new Map(activeBlocks.map(b => [b.id, b]));

  const dependsOnIds = sanitizeDependsOn(block.dependsOn);
  const pendingDependencies: Block[] = [];
  const completedDependencies: Block[] = [];
  const missingDependencyIds: string[] = [];

  for (const depId of dependsOnIds) {
    const targetBlock = byId.get(depId);
    if (!targetBlock) {
      missingDependencyIds.push(depId);
      continue;
    }

    if (isBlockCompleted(targetBlock)) {
      completedDependencies.push(targetBlock);
    } else {
      pendingDependencies.push(targetBlock);
    }
  }

  // Find blocks that depend on this block
  const blocking = activeBlocks.filter(other => {
    if (other.id === block.id) return false;
    const otherDepends = sanitizeDependsOn(other.dependsOn);
    return otherDepends.includes(block.id);
  });

  const isBlocked = pendingDependencies.length > 0;

  return {
    isBlocked,
    pendingDependencies,
    completedDependencies,
    missingDependencyIds,
    blocking
  };
}

/**
 * Formats dependencies into Markdown for inclusion in work items or daily summaries.
 */
export function formatDependencyMarkdown(
  dependencies: Block[],
  _allBlocks?: Block[]
): string {
  if (dependencies.length === 0) return '';

  const lines = dependencies.map(dep => {
    const completed = isBlockCompleted(dep);
    const check = completed ? '[x]' : '[ ]';
    const statusText = completed ? 'Done' : 'Pending';
    return `- ${check} [[${dep.title}]] (\`${dep.id}\`) — *${statusText}*`;
  });

  return `## Dependencies\n\n${lines.join('\n')}`;
}
