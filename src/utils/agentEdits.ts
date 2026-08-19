import type { Block } from '../types';

export function hasUnseenAgentEdits(block: Block): boolean {
  return typeof block.lastAgentEditAt === 'number'
    && block.lastAgentEditAt > (block.lastSeenAgentEditAt ?? 0);
}

export interface AgentEditCounts {
  byBlock: Record<string, number>;
  byProject: Record<string, number>;
}

export function formatAgentEditBadgeLabel(hasOwnUpdate: boolean, subtreeCount: number): string {
  const descendantCount = Math.max(0, subtreeCount - (hasOwnUpdate ? 1 : 0));
  if (hasOwnUpdate && descendantCount > 0) return `New · ${descendantCount} below`;
  if (hasOwnUpdate) return 'New from agent';
  return `${descendantCount} below`;
}

export function calculateAgentEditCounts(blocks: Block[]): AgentEditCounts {
  const activeBlocks = blocks.filter(block => !block.isTrash);
  const byId = new Map(activeBlocks.map(block => [block.id, block]));
  const byBlock: Record<string, number> = {};
  const byProject: Record<string, number> = {};

  for (const changedBlock of activeBlocks) {
    if (!hasUnseenAgentEdits(changedBlock)) continue;
    byProject[changedBlock.projectId] = (byProject[changedBlock.projectId] ?? 0) + 1;

    const visited = new Set<string>();
    let current: Block | undefined = changedBlock;
    while (current && current.projectId === changedBlock.projectId && !visited.has(current.id)) {
      visited.add(current.id);
      byBlock[current.id] = (byBlock[current.id] ?? 0) + 1;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }

  return { byBlock, byProject };
}

export function countUnseenAgentEdits(blocks: Block[], projectId: string): number {
  return calculateAgentEditCounts(blocks).byProject[projectId] ?? 0;
}
