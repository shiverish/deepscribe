import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { rankBlocksLocally } from './semanticSearch';

const item = (id: string, title: string, plainText: string): Block => ({
  id, title, plainText, content: `<p>${plainText}</p>`, projectId: 'p', parentId: null, order: 0,
  childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false,
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
});
