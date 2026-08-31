import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { calculateAgentEditCounts, countUnseenAgentEdits, describeProjectAgentBadges, formatAgentEditBadgeLabel, hasUnseenAgentEdits } from './agentEdits';

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
      byProject: { 'project-1': 1 },
      unseenBlockEditsByProject: { 'project-1': 1 },
      unseenTaskEditsByProject: {}
    });
  });

  /**
   * A project card shows the two apart because they lead to different places:
   * a document edit is read in the columns, a task update in the task list.
   */
  it('splits project totals into document edits and task updates', () => {
    const task = (id: string, overrides: Partial<Block> = {}) => block({
      id, kind: 'task', task: { status: 'ready', agentTarget: 'any', position: 0 }, ...overrides
    });
    const counts = calculateAgentEditCounts([
      block({ id: 'doc-1', lastAgentEditAt: 20 }),
      block({ id: 'doc-2', lastAgentEditAt: 20 }),
      block({ id: 'doc-seen', lastAgentEditAt: 20, lastSeenAgentEditAt: 20 }),
      task('task-1', { lastAgentEditAt: 20 }),
      task('task-seen', { lastAgentEditAt: 20, lastSeenAgentEditAt: 20 }),
      task('task-other-project', { projectId: 'project-2', lastAgentEditAt: 20 }),
      task('task-trashed', { isTrash: true, lastAgentEditAt: 20 })
    ]);

    expect(counts.unseenBlockEditsByProject['project-1']).toBe(2);
    expect(counts.unseenTaskEditsByProject['project-1']).toBe(1);
    expect(counts.unseenTaskEditsByProject['project-2']).toBe(1);
    expect(counts.unseenBlockEditsByProject['project-2']).toBeUndefined();
    // The combined total the block cards use is unchanged.
    expect(counts.byProject['project-1']).toBe(3);
  });

  it('leaves a project with only task updates without a document count', () => {
    const counts = calculateAgentEditCounts([
      block({
        id: 'task-only', kind: 'task', task: { status: 'ready', agentTarget: 'any', position: 0 },
        lastAgentEditAt: 20
      })
    ]);
    expect(counts.unseenBlockEditsByProject['project-1'] ?? 0).toBe(0);
    expect(counts.unseenTaskEditsByProject['project-1']).toBe(1);
  });

  it('still rolls task edits up into the block counts for cards below the project', () => {
    const counts = calculateAgentEditCounts([
      block({ id: 'root' }),
      block({
        id: 'task', parentId: 'root', kind: 'task',
        task: { status: 'ready', agentTarget: 'any', position: 0 },
        lastAgentEditAt: 20
      })
    ]);
    expect(counts.byBlock).toEqual({ task: 1, root: 1 });
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

  it('describes the two project badges and keeps the card lit for either kind', () => {
    const both = describeProjectAgentBadges(2, 3);
    expect(both.hasAgentUpdates).toBe(true);
    expect(both.blockBadgeTitle).toBe('2 blocks with unread agent edits.');
    expect(both.taskBadgeTitle).toBe('3 tasks with unread agent updates. Open the task list for this project.');

    expect(describeProjectAgentBadges(1, 0).blockBadgeTitle).toBe('1 block with unread agent edits.');
    expect(describeProjectAgentBadges(0, 1).taskBadgeTitle).toContain('1 task with unread agent updates.');

    // The glow follows either kind on its own, and goes out only when both are clear.
    expect(describeProjectAgentBadges(1, 0).hasAgentUpdates).toBe(true);
    expect(describeProjectAgentBadges(0, 1).hasAgentUpdates).toBe(true);
    expect(describeProjectAgentBadges(0, 0).hasAgentUpdates).toBe(false);
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
