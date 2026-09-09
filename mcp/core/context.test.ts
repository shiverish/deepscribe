import { describe, expect, it } from 'vitest';

import { resolveAgentContext } from './context.mjs';

const now = 1_789_000_000_000;

function project(id: string, title: string) {
  return {
    id,
    title,
    description: `${title} description`,
    scratchpad: `## Agent instructions\n\nKeep ${title} source-grounded.`,
    scratchpadUpdatedAt: now - 10,
    color: '#336699',
    order: 0,
    tags: [],
    isTrash: false,
    createdAt: now - 100,
    updatedAt: now
  };
}

function block(id: string, projectId: string, title: string, plainText: string, options: Record<string, unknown> = {}) {
  return {
    id,
    projectId,
    parentId: null,
    title,
    content: `<p>${plainText}</p>`,
    plainText,
    order: 0,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    tags: [],
    isTrash: false,
    createdAt: now - 100,
    updatedAt: now,
    ...options
  };
}

describe('agent context resolver', () => {
  it('combines lexical, hierarchy, typed-relation and backlink signals', () => {
    const projects = [project('proj-a', 'Alpha')];
    const anchor = block('block-anchor', 'proj-a', 'Anchor', 'Release planning', { order: 0 });
    const nearby = block('block-near', 'proj-a', 'Nearby', 'alpha decision', { parentId: anchor.id, order: 0 });
    const distant = block('block-far', 'proj-a', 'Distant', 'alpha decision', { order: 2 });
    const backlink = block('block-backlink', 'proj-a', 'Evidence', 'No lexical overlap', { order: 3 });
    const relationFar = block('block-relation-far', 'proj-a', 'Derived note', 'No lexical overlap', { order: 4 });
    const result = resolveAgentContext({ query: 'alpha', anchorBlockId: anchor.id }, {
      projects,
      blocks: [anchor, nearby, distant, backlink, relationFar],
      links: [
        {
          id: 'link-1',
          sourceBlockId: backlink.id,
          targetBlockId: anchor.id,
          type: 'supports',
          createdBy: 'user',
          createdAt: now
        },
        {
          id: 'link-2',
          sourceBlockId: relationFar.id,
          targetBlockId: backlink.id,
          type: 'derived-from',
          createdBy: 'user',
          createdAt: now
        }
      ]
    });

    expect(result.anchor.path.map((part: { blockId: string }) => part.blockId)).toEqual([anchor.id]);
    expect(result.passages.findIndex((entry: { blockId: string }) => entry.blockId === nearby.id))
      .toBeLessThan(result.passages.findIndex((entry: { blockId: string }) => entry.blockId === distant.id));
    expect(result.passages.find((entry: { blockId: string }) => entry.blockId === nearby.id)?.matchReasons)
      .toContain('hierarchy:1');
    expect(result.passages.find((entry: { blockId: string }) => entry.blockId === backlink.id)?.matchReasons)
      .toContain('relation:supports:incoming:1');
    expect(result.passages.findIndex((entry: { blockId: string }) => entry.blockId === backlink.id))
      .toBeLessThan(result.passages.findIndex((entry: { blockId: string }) => entry.blockId === relationFar.id));
    expect(result.passages.find((entry: { blockId: string }) => entry.blockId === relationFar.id)?.matchReasons)
      .toContain('relation:derived-from:incoming:2');
    expect(result.relations[0]).toMatchObject({
      fromBlockId: anchor.id,
      blockId: backlink.id,
      type: 'supports',
      direction: 'incoming',
      distance: 1,
      updatedAt: now
    });
  });

  it('uses projectId as a hard boundary and rejects a mismatched anchor', () => {
    const projects = [project('proj-a', 'A'), project('proj-b', 'B')];
    const a = block('block-a', 'proj-a', 'A', 'shared keyword');
    const b = block('block-b', 'proj-b', 'B', 'shared keyword');
    const scoped = resolveAgentContext({ query: 'shared', projectId: 'proj-a' }, { projects, blocks: [a, b], links: [] });

    expect(scoped.passages.map((entry: { blockId: string }) => entry.blockId)).toEqual([a.id]);
    expect(scoped.projects.map((entry: { projectId: string }) => entry.projectId)).toEqual(['proj-a']);
    expect(() => resolveAgentContext({ query: 'shared', projectId: 'proj-a', anchorBlockId: b.id }, { projects, blocks: [a, b], links: [] }))
      .toThrow(/does not belong/i);
  });

  it('includes relevant tasks and dependency source records without exposing claims', () => {
    const projects = [project('proj-a', 'Tasks')];
    const dependency = block('block-dependency', 'proj-a', 'Decision', 'context resolver contract');
    const task = block('block-task', 'proj-a', 'Implement resolver', 'context resolver task', {
      kind: 'task',
      dependsOn: [dependency.id],
      task: {
        status: 'ready',
        agentTarget: 'any',
        position: 1,
        taskNumber: 328,
        claim: { token: 'must-not-leak' }
      }
    });
    const result = resolveAgentContext({ query: 'context resolver' }, { projects, blocks: [dependency, task], links: [] });

    expect(result.tasks[0]).toMatchObject({
      blockId: task.id,
      humanId: '#TSK-328',
      status: 'ready',
      dependsOn: [{ blockId: dependency.id, title: dependency.title, status: null, missing: false }]
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('always fits the pretty-printed character budget and reports truncation', () => {
    const projects = [project('proj-a', 'Budget')];
    const blocks = Array.from({ length: 30 }, (_, index) => block(
      `block-${String(index).padStart(2, '0')}`,
      'proj-a',
      `Budget source ${index}`,
      `budget keyword ${'long context '.repeat(80)}`,
      { updatedAt: now - index }
    ));
    const result = resolveAgentContext({ query: 'budget keyword', projectId: 'proj-a', maxChars: 1_500 }, { projects, blocks, links: [] });

    expect(JSON.stringify(result, null, 2).length).toBeLessThanOrEqual(1_500);
    expect(result.budget.usedChars).toBe(JSON.stringify(result, null, 2).length);
    expect(result.budget.truncated).toBe(true);
    expect(result.passages.length).toBeGreaterThan(0);
  });

  it('returns stable empty results and never surfaces deleted records', () => {
    const projects = [project('proj-a', 'Empty')];
    const live = block('block-b', 'proj-a', 'Live', 'unrelated');
    const deleted = block('block-a', 'proj-a', 'Deleted', 'needle', { isTrash: true });
    const first = resolveAgentContext({ query: 'needle', projectId: 'proj-a' }, { projects, blocks: [live, deleted], links: [] });
    const second = resolveAgentContext({ query: 'needle', projectId: 'proj-a' }, { projects, blocks: [deleted, live], links: [] });

    expect(first.passages).toEqual([]);
    expect(first.relations).toEqual([]);
    expect(first.tasks).toEqual([]);
    expect(second).toEqual(first);
    expect(() => resolveAgentContext({ query: 'needle', anchorBlockId: deleted.id }, { projects, blocks: [live, deleted], links: [] }))
      .toThrow(/anchor block not found/i);
  });

  it('uses block ids as the final tie-breaker for deterministic ordering', () => {
    const projects = [project('proj-a', 'Stable')];
    const a = block('stable-a', 'proj-a', 'Same', 'stable keyword');
    const b = block('stable-b', 'proj-a', 'Same', 'stable keyword');
    const result = resolveAgentContext({ query: 'stable keyword' }, { projects, blocks: [b, a], links: [] });

    expect(result.passages.map((entry: { blockId: string }) => entry.blockId)).toEqual(['stable-a', 'stable-b']);
  });
});
