import type { Block } from '../types';

export interface SelectionFallbackResult {
  newPath: string[];
  focusedId: string | null;
  focusedLevel: number;
}

export function getDeleteFallbackTarget(
  deletedBlock: Block,
  allBlocks: Block[],
  currentPath: string[]
): SelectionFallbackResult {
  // Find all non-trashed siblings on the same level excluding the deleted block
  const remainingSiblings = allBlocks
    .filter(b => b.projectId === deletedBlock.projectId && b.parentId === deletedBlock.parentId && !b.isTrash && b.id !== deletedBlock.id)
    .sort((a, b) => a.order - b.order);

  // Find original index among all non-trashed siblings prior to deletion
  const sortedOriginalSiblings = allBlocks
    .filter(b => b.projectId === deletedBlock.projectId && b.parentId === deletedBlock.parentId && !b.isTrash)
    .sort((a, b) => a.order - b.order);

  const deletedIndex = sortedOriginalSiblings.findIndex(b => b.id === deletedBlock.id);

  let targetBlock: Block | null = null;

  if (remainingSiblings.length > 0) {
    if (deletedIndex > 0) {
      // 1. Prefer previous sibling
      targetBlock = sortedOriginalSiblings[deletedIndex - 1] || remainingSiblings[remainingSiblings.length - 1];
    } else {
      // 2. Next sibling (if deleted item was the first item)
      targetBlock = sortedOriginalSiblings[deletedIndex + 1] || remainingSiblings[0];
    }
  }

  const deletedIndexInPath = currentPath.indexOf(deletedBlock.id);
  if (deletedIndexInPath === -1) {
    return {
      newPath: currentPath,
      focusedId: currentPath.length > 0 ? currentPath[currentPath.length - 1] : null,
      focusedLevel: currentPath.length
    };
  }
  const parentPath = currentPath.slice(0, deletedIndexInPath);

  if (targetBlock) {
    const newPath = [...parentPath, targetBlock.id];
    return {
      newPath,
      focusedId: targetBlock.id,
      focusedLevel: newPath.length
    };
  } else {
    // 3. No siblings left -> fallback to parent block or project level
    return {
      newPath: parentPath,
      focusedId: parentPath.length > 0 ? parentPath[parentPath.length - 1] : deletedBlock.projectId,
      focusedLevel: parentPath.length
    };
  }
}
