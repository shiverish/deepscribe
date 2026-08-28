import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { rankBlocksLocally } from './semanticSearch';

const item = (id: string, title: string, plainText: string): Block => ({
  id, title, plainText, content: `<p>${plainText}</p>`, projectId: 'p', parentId: null, order: 0,
  childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false,
  createdAt: 1, updatedAt: 1
});

const taskItem = (id: string, title: string, plainText: string, taskNumber: number): Block => ({
  id, title, plainText, content: `<p>${plainText}</p>`, projectId: 'p', parentId: null, order: 0,
  childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false,
  kind: 'task',
  task: { status: 'inbox', agentTarget: 'any', position: 1, taskNumber },
  createdAt: 1, updatedAt: 1
});

describe('local semantic ranking', () => {
  it('finds conceptually related Dutch terms without an exact match', () => {
    const results = rankBlocksLocally([
      item('tasks', 'Actielijst', 'Werk dat nog uitgevoerd moet worden.'),
      item('story', 'Roman', 'Een spannend verhaal.')
    ], 'todo');
    expect(results[0]?.block.id).toBe('tasks');
  });

  it('ranks tasks by task ID (TSK-187, #187, #TSK-187, 187) at the top', () => {
    const blocks = [
      item('doc-1', 'Release notes', 'Version 187 details and notes.'),
      taskItem('task-187', 'Fix authentication bug', 'Bug in auth flow.', 187),
      taskItem('task-42', 'Update dashboard layout', 'Redesign charts.', 42)
    ];

    expect(rankBlocksLocally(blocks, 'TSK-187')[0]?.block.id).toBe('task-187');
    expect(rankBlocksLocally(blocks, 'tsk-187')[0]?.block.id).toBe('task-187');
    expect(rankBlocksLocally(blocks, '#187')[0]?.block.id).toBe('task-187');
    expect(rankBlocksLocally(blocks, '#TSK-187')[0]?.block.id).toBe('task-187');
    expect(rankBlocksLocally(blocks, '187')[0]?.block.id).toBe('task-187');
  });

  it('boosts task match when querying with additional keywords', () => {
    const blocks = [
      item('doc-1', 'Auth Documentation', 'How authentication works.'),
      taskItem('task-187', 'Fix authentication bug', 'Bug in auth flow.', 187)
    ];

    const results = rankBlocksLocally(blocks, 'Fix auth TSK-187');
    expect(results[0]?.block.id).toBe('task-187');
  });
});
