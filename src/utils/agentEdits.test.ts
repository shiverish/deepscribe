import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { calculateAgentEditCounts, countUnseenAgentEdits, formatAgentEditBadgeLabel, hasUnseenAgentEdits } from './agentEdits';

const block = (overrides: Partial<Block> = {}): Block => ({
  id: 'block-1', projectId: 'project-1', parentId: null, title: 'Blok', content: '<p></p>', plainText: '',
  order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false,
  createdAt: 1, updatedAt: 1, ...overrides
});

describe('unseen agent edits', () => {
  it('stays visible until the latest agent edit was seen', () => {
    expect(hasUnseenAgentEdits(block())).toBe(false);
    expect(hasUnseenAgentEdits(block({ lastAgentEditAt: 20 }))).toBe(true);
    expect(hasUnseenAgentEdits(block({ lastAgentEditAt: 20, lastSeenAgentEditAt: 20 }))).toBe(false);
  });

  it('counts only active unseen blocks in the requested project', () => {
    expect(countUnseenAgentEdits([
      block({ id: 'a', lastAgentEditAt: 20 }),
      block({ id: 'b', lastAgentEditAt: 20, lastSeenAgentEditAt: 20 }),
      block({ id: 'c', projectId: 'project-2', lastAgentEditAt: 20 }),
      block({ id: 'd', isTrash: true, lastAgentEditAt: 20 })
    ], 'project-1')).toBe(1);
  });

  it('surfaces an agent edit on a task and rolls it up like any other block', () => {
    const task = block({
      id: 'task', parentId: 'parent', kind: 'task',
      task: { status: 'ready', agentTarget: 'any', position: 0 },
      lastAgentEditAt: 20
    });
    const blocks = [block({ id: 'root' }), block({ id: 'parent', parentId: 'root' }), task];
    expect(hasUnseenAgentEdits(task)).toBe(true);
    const counts = calculateAgentEditCounts(blocks);
    expect(counts.byBlock).toMatchObject({ task: 1, parent: 1, root: 1 });
    expect(counts.byProject['project-1']).toBe(1);
  });

  it('propagates a deep edit through every ancestor and the project', () => {
    const blocks = [
      block({ id: 'root' }),
      block({ id: 'parent', parentId: 'root' }),
      block({ id: 'child', parentId: 'parent', lastAgentEditAt: 20 })
    ];
    expect(calculateAgentEditCounts(blocks)).toEqual({
      byBlock: { child: 1, parent: 1, root: 1 },
      byProject: { 'project-1': 1 }
    });
  });

  it('counts multiple unique changed descendants and own changes', () => {
    const counts = calculateAgentEditCounts([
      block({ id: 'root', lastAgentEditAt: 30 }),
      block({ id: 'left', parentId: 'root', lastAgentEditAt: 20 }),
      block({ id: 'right', parentId: 'root', lastAgentEditAt: 25 })
    ]);
    expect(counts.byBlock).toEqual({ root: 3, left: 1, right: 1 });
    expect(counts.byProject['project-1']).toBe(3);
  });

  it('formats own, descendant and combined badge labels', () => {
    expect(formatAgentEditBadgeLabel(true, 1)).toBe('New from agent');
    expect(formatAgentEditBadgeLabel(false, 2)).toBe('2 below');
    expect(formatAgentEditBadgeLabel(true, 3)).toBe('New · 2 below');
  });

  it('keeps descendant alerts after only the parent itself was seen', () => {
    const counts = calculateAgentEditCounts([
      block({ id: 'parent', lastAgentEditAt: 20, lastSeenAgentEditAt: 20 }),
      block({ id: 'child', parentId: 'parent', lastAgentEditAt: 30 })
    ]);
    expect(counts.byBlock).toEqual({ child: 1, parent: 1 });
    expect(formatAgentEditBadgeLabel(false, counts.byBlock.parent)).toBe('1 below');
  });

  it('updates ancestor counts when a child is seen, moved, trashed or restored', () => {
    const root = block({ id: 'root' });
    const otherRoot = block({ id: 'other-root' });
    const child = block({ id: 'child', parentId: 'root', lastAgentEditAt: 20 });
    expect(calculateAgentEditCounts([root, otherRoot, child]).byBlock.root).toBe(1);
    expect(calculateAgentEditCounts([root, otherRoot, { ...child, lastSeenAgentEditAt: 20 }]).byBlock.root).toBeUndefined();
    expect(calculateAgentEditCounts([root, otherRoot, { ...child, parentId: 'other-root' }]).byBlock).toEqual({ child: 1, 'other-root': 1 });
    expect(calculateAgentEditCounts([root, otherRoot, { ...child, isTrash: true }]).byBlock).toEqual({});
    expect(calculateAgentEditCounts([root, otherRoot, { ...child, isTrash: false }]).byBlock.root).toBe(1);
  });

  it('stops safely at missing parents and cycles', () => {
    const orphan = block({ id: 'orphan', parentId: 'missing', lastAgentEditAt: 20 });
    const first = block({ id: 'first', parentId: 'second', lastAgentEditAt: 30 });
    const second = block({ id: 'second', parentId: 'first' });
    expect(calculateAgentEditCounts([orphan]).byBlock).toEqual({ orphan: 1 });
    expect(calculateAgentEditCounts([first, second]).byBlock).toEqual({ first: 1, second: 1 });
  });

  it('correctly identifies unseen agent edits on task blocks', () => {
    const task = block({
      id: 'task-1',
      kind: 'task',
      task: { status: 'inbox', agentTarget: 'none', position: 0 },
      lastAgentEditAt: 50
    });
    expect(hasUnseenAgentEdits(task)).toBe(true);

    const seenTask = { ...task, lastSeenAgentEditAt: 50 };
    expect(hasUnseenAgentEdits(seenTask)).toBe(false);

    const updatedTask = { ...seenTask, lastAgentEditAt: 60 };
    expect(hasUnseenAgentEdits(updatedTask)).toBe(true);
  });
});
