import type { Block } from '../types';

export function hasUnseenAgentEdits(block: Block): boolean {
  return typeof block.lastAgentEditAt === 'number'
    && block.lastAgentEditAt > (block.lastSeenAgentEditAt ?? 0);
}

export interface AgentEditCounts {
  /** Unread agent edits in a block's own subtree, task blocks included. */
  byBlock: Record<string, number>;
  /** Every unread agent edit in a project, whatever kind of block it sits on. */
  byProject: Record<string, number>;
  /** Project cards split the total: content the agent wrote in ordinary blocks… */
  unseenBlockEditsByProject: Record<string, number>;
  /** …and the tasks it created or updated, which lead somewhere else entirely. */
  unseenTaskEditsByProject: Record<string, number>;
}

export function formatAgentEditBadgeLabel(hasOwnUpdate: boolean, subtreeCount: number): string {
  const descendantCount = Math.max(0, subtreeCount - (hasOwnUpdate ? 1 : 0));
  if (hasOwnUpdate && descendantCount > 0) return `New · ${descendantCount} below`;
  if (hasOwnUpdate) return 'New from agent';
  return `${descendantCount} below`;
}

export interface ProjectAgentBadges {
  blockEditCount: number;
  taskEditCount: number;
  /** Whether the card keeps its alert glow. */
  hasAgentUpdates: boolean;
  blockBadgeTitle: string;
  taskBadgeTitle: string;
}

/**
 * What a project card says about the agent work waiting in it. The two counts stay
 * apart because they lead to different places: a document edit is read in the
 * columns, a task update in the task list the badge opens.
 */
export function describeProjectAgentBadges(blockEditCount: number, taskEditCount: number): ProjectAgentBadges {
  const blocks = Math.max(0, blockEditCount);
  const tasks = Math.max(0, taskEditCount);
  return {
    blockEditCount: blocks,
    taskEditCount: tasks,
    hasAgentUpdates: blocks > 0 || tasks > 0,
    blockBadgeTitle: `${blocks} block${blocks === 1 ? '' : 's'} with unread agent edits.`,
    taskBadgeTitle: `${tasks} task${tasks === 1 ? '' : 's'} with unread agent updates. Open the task list for this project.`
  };
}

export function calculateAgentEditCounts(blocks: Block[]): AgentEditCounts {
  const activeBlocks = blocks.filter(block => !block.isTrash);
  const byId = new Map(activeBlocks.map(block => [block.id, block]));
  const byBlock: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const unseenBlockEditsByProject: Record<string, number> = {};
  const unseenTaskEditsByProject: Record<string, number> = {};

  for (const changedBlock of activeBlocks) {
    if (!hasUnseenAgentEdits(changedBlock)) continue;
    byProject[changedBlock.projectId] = (byProject[changedBlock.projectId] ?? 0) + 1;
    const perKind = changedBlock.kind === 'task' ? unseenTaskEditsByProject : unseenBlockEditsByProject;
    perKind[changedBlock.projectId] = (perKind[changedBlock.projectId] ?? 0) + 1;

    const visited = new Set<string>();
    let current: Block | undefined = changedBlock;
    while (current && current.projectId === changedBlock.projectId && !visited.has(current.id)) {
      visited.add(current.id);
      byBlock[current.id] = (byBlock[current.id] ?? 0) + 1;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }

  return { byBlock, byProject, unseenBlockEditsByProject, unseenTaskEditsByProject };
}

export function countUnseenAgentEdits(blocks: Block[], projectId: string): number {
  return calculateAgentEditCounts(blocks).byProject[projectId] ?? 0;
}
