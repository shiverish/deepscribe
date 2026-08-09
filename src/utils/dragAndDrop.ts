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

  const oldParentId = sourceBlock.parentId;

  if (position === 'inside') {
    const newParentId = targetBlock.id;

    const childrenCount = await db.blocks
      .where('parentId')
      .equals(newParentId)
      .and(b => !b.isTrash)
      .count();

    await db.blocks.update(sourceBlockId, {
      parentId: newParentId,
      order: childrenCount,
      updatedAt: Date.now()
    });

    await updateBlockCounts(newParentId);
  } else {
    const newParentId = targetBlock.parentId;
    const siblings = await db.blocks
      .filter(b => b.projectId === targetBlock.projectId && b.parentId === newParentId && !b.isTrash)
      .toArray();

    siblings.sort((a, b) => a.order - b.order);

    const filteredSiblings = siblings.filter(b => b.id !== sourceBlockId);
    const targetIndex = filteredSiblings.findIndex(b => b.id === targetBlockId);

    const insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
    filteredSiblings.splice(insertIndex, 0, sourceBlock);

    await db.transaction('rw', db.blocks, async () => {
      for (let i = 0; i < filteredSiblings.length; i++) {
        await db.blocks.update(filteredSiblings[i].id, {
          parentId: newParentId,
          order: i,
          updatedAt: Date.now()
        });
      }
    });
  }

  if (oldParentId && oldParentId !== (position === 'inside' ? targetBlock.id : targetBlock.parentId)) {
    await updateBlockCounts(oldParentId);
  }

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
