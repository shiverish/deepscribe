import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { extractWikiLinks, resolveBlockReferences } from './references';

const block = (id: string, title: string, plainText = ''): Block => ({
  id, title, plainText, projectId: 'p', parentId: null, content: `<p>${plainText}</p>`, order: 0,
  childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false,
  createdAt: 1, updatedAt: 1
});

describe('wiki references', () => {
  it('extracts unique trimmed links', () => {
    expect(extractWikiLinks('Zie [[ Idee ]] en [[Idee]].')).toEqual(['Idee']);
  });

  it('resolves outgoing links and backlinks inside a project', () => {
    const idea = block('idea', 'Idee');
    const source = block('source', 'Bron', 'Werk [[Idee]] uit.');
    const result = resolveBlockReferences(idea, [idea, source]);
    expect(result.backlinks.map(item => item.id)).toEqual(['source']);
    expect(resolveBlockReferences(source, [idea, source]).outgoing.map(item => item.id)).toEqual(['idea']);
  });
});
