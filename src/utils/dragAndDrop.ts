import { db } from '../db/db';
import type { DropPosition, Block } from '../types';

/**
 * Checks if targetBlockId is sourceBlockId or a descendant of sourceBlockId.
 * Used to prevent dropping a parent block into its own child tree.
 */
export async function isDescendantOrSelf(sourceBlockId: string, targetBlockId: string): Promise<boolean> {
  if (sourceBlockId === targetBlockId) return true;

  let currentId: string | null = targetBlockId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === sourceBlockId) return true;
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const blockRecord: Block | undefined = await db.blocks.get(currentId);
    currentId = blockRecord?.parentId || null;
  }

  return false;
}

/**
 * Calculates drop position relative to element bounds.
 * Top 25%: 'above'
 * Bottom 25%: 'below'
 * Center 50%: 'inside' (make child)
 */
export function getDropPosition(event: React.DragEvent<HTMLElement>): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  const ratio = offsetY / rect.height;

  if (ratio < 0.25) return 'above';
  if (ratio > 0.75) return 'below';
  return 'inside';
}

function insertionIndex(targetIndex: number, position: Exclude<DropPosition, 'inside'>): number {
  return position === 'above' ? targetIndex : targetIndex + 1;
}

/** Reorders projects without changing any project contents. */
export async function reorderProject(
  sourceProjectId: string,
  targetProjectId: string,
  position: Exclude<DropPosition, 'inside'>
): Promise<boolean> {
  if (sourceProjectId === targetProjectId) return false;

  const projects = await db.projects.filter(project => !project.isTrash).toArray();
  projects.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

  const source = projects.find(project => project.id === sourceProjectId);
  const withoutSource = projects.filter(project => project.id !== sourceProjectId);
  const targetIndex = withoutSource.findIndex(project => project.id === targetProjectId);
  if (!source || targetIndex < 0) return false;

  withoutSource.splice(insertionIndex(targetIndex, position), 0, source);
  const updatedAt = Date.now();
  await db.transaction('rw', db.projects, async () => {
    await Promise.all(withoutSource.map((project, order) =>
      db.projects.update(project.id, { order, updatedAt })
    ));
  });
  return true;
}

/** Reorders blocks only when source and target already belong to the same column. */
export async function reorderBlockWithinParent(
  sourceBlockId: string,
  targetBlockId: string,
  position: Exclude<DropPosition, 'inside'>
): Promise<boolean> {
  if (sourceBlockId === targetBlockId) return false;

  const [source, target] = await Promise.all([
    db.blocks.get(sourceBlockId),
    db.blocks.get(targetBlockId)
  ]);
  if (!source || !target || source.projectId !== target.projectId || source.parentId !== target.parentId) return false;

  const siblings = await db.blocks
    .filter(block => block.projectId === source.projectId && block.parentId === source.parentId && !block.isTrash)
    .toArray();
  siblings.sort((a, b) => a.order - b.order);

  const withoutSource = siblings.filter(block => block.id !== sourceBlockId);
  const targetIndex = withoutSource.findIndex(block => block.id === targetBlockId);
  if (targetIndex < 0) return false;

  withoutSource.splice(insertionIndex(targetIndex, position), 0, source);
  const updatedAt = Date.now();
  await db.transaction('rw', db.blocks, async () => {
    await Promise.all(withoutSource.map((block, order) =>
      db.blocks.update(block.id, { order, updatedAt })
    ));
  });
  return true;
}

/**
 * Handles block relocation and reordering in Dexie DB.
 */
export async function moveBlockInTree(
  sourceBlockId: string,
  targetBlockId: string,
  position: DropPosition
): Promise<boolean> {
  const isInvalid = await isDescendantOrSelf(sourceBlockId, targetBlockId);
  if (isInvalid) {
    console.warn('Cannot move block into itself or its own sub-tree.');
    return false;
  }

  const sourceBlock = await db.blocks.get(sourceBlockId);
  const targetBlock = await db.blocks.get(targetBlockId);

  if (!sourceBlock || !targetBlock) return false;

  if (sourceBlock.projectId !== targetBlock.projectId) return false;

  const oldParentId = sourceBlock.parentId;
  const newParentId = position === 'inside' ? targetBlock.id : targetBlock.parentId;
  const now = Date.now();

  await db.transaction('rw', db.blocks, async () => {
    const destinationSiblings = await db.blocks
      .filter(block => block.projectId === targetBlock.projectId
        && block.parentId === newParentId
        && !block.isTrash
        && block.id !== sourceBlockId)
      .toArray();
    destinationSiblings.sort((a, b) => a.order - b.order);

    const insertIndex = position === 'inside'
      ? destinationSiblings.length
      : Math.max(0, destinationSiblings.findIndex(block => block.id === targetBlockId)
        + (position === 'below' ? 1 : 0));
    destinationSiblings.splice(insertIndex, 0, sourceBlock);

    await Promise.all(destinationSiblings.map((block, order) => db.blocks.update(block.id, {
      parentId: newParentId,
      order,
      updatedAt: now
    })));

    if (oldParentId !== newParentId) {
      const oldSiblings = await db.blocks
        .filter(block => block.projectId === sourceBlock.projectId
          && block.parentId === oldParentId
          && !block.isTrash
          && block.id !== sourceBlockId)
        .toArray();
      oldSiblings.sort((a, b) => a.order - b.order);
      await Promise.all(oldSiblings.map((block, order) => db.blocks.update(block.id, { order, updatedAt: now })));
    }

    for (const parentId of new Set([oldParentId, newParentId])) {
      if (!parentId) continue;
      const childCount = await db.blocks.filter(block => block.parentId === parentId && !block.isTrash).count();
      await db.blocks.update(parentId, { childCount, updatedAt: now });
    }
  });

  return true;
}

export async function updateBlockCounts(blockId: string) {
  const block = await db.blocks.get(blockId);
  if (!block) return;

  const childCount = await db.blocks
    .filter(b => b.projectId === block.projectId && b.parentId === blockId && !b.isTrash)
    .count();

  await db.blocks.update(blockId, { childCount });
}
