import { describe, expect, it } from 'vitest';
import { getDeleteFallbackTarget } from './selectionUtils';
import type { Block } from '../types';

function createMockBlock(id: string, projectId: string, parentId: string | null, order: number): Block {
  return {
    id,
    projectId,
    parentId,
    title: `Block ${id}`,
    content: '<p></p>',
    plainText: '',
    order,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    tags: [],
    isTrash: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

describe('getDeleteFallbackTarget', () => {
  const projId = 'proj-1';
  const blockA = createMockBlock('block-A', projId, null, 0);
  const blockB = createMockBlock('block-B', projId, null, 1);
  const blockC = createMockBlock('block-C', projId, null, 2);
  const allBlocks = [blockA, blockB, blockC];

  it('selects previous sibling when middle or last block is deleted', () => {
    const res = getDeleteFallbackTarget(blockC, allBlocks, ['block-C']);
    expect(res.newPath).toEqual(['block-B']);
    expect(res.focusedId).toBe('block-B');
    expect(res.focusedLevel).toBe(1);
  });

  it('selects next sibling when first block is deleted', () => {
    const res = getDeleteFallbackTarget(blockA, allBlocks, ['block-A']);
    expect(res.newPath).toEqual(['block-B']);
    expect(res.focusedId).toBe('block-B');
    expect(res.focusedLevel).toBe(1);
  });

  it('falls back to parent project when last remaining root block is deleted', () => {
    const singleBlockList = [blockA];
    const res = getDeleteFallbackTarget(blockA, singleBlockList, ['block-A']);
    expect(res.newPath).toEqual([]);
    expect(res.focusedId).toBe(projId);
    expect(res.focusedLevel).toBe(0);
  });

  it('falls back to parent block when sub-block is deleted and no child siblings remain', () => {
    const parentBlock = createMockBlock('parent-1', projId, null, 0);
    const childBlock = createMockBlock('child-1', projId, 'parent-1', 0);
    const blocks = [parentBlock, childBlock];

    const res = getDeleteFallbackTarget(childBlock, blocks, ['parent-1', 'child-1']);
    expect(res.newPath).toEqual(['parent-1']);
    expect(res.focusedId).toBe('parent-1');
    expect(res.focusedLevel).toBe(1);
  });
});
