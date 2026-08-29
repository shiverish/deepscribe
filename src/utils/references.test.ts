import { describe, expect, it } from 'vitest';
import type { Block, BlockLink } from '../types';
import { extractWikiLinks, resolveBlockReferences } from './references';
import { syncWikiLinksForBlock } from '../../mcp/core/links.mjs';

const block = (id: string, title: string, plainText = '', projectId = 'p'): Block => ({
  id, title, plainText, projectId, parentId: null, content: `<p>${plainText}</p>`, order: 0,
  childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false,
  createdAt: 1, updatedAt: 1
});

const link = (source: string, target: string, type: BlockLink['type'] = 'relates-to'): BlockLink => ({
  id: `link-${source}-${target}-${type}`, sourceBlockId: source, targetBlockId: target, type,
  createdBy: 'user', createdAt: 1
});

describe('wiki references', () => {
  it('extracts unique trimmed links', () => {
    expect(extractWikiLinks('Zie [[ Idee ]] en [[Idee]].')).toEqual(['Idee']);
  });

  it('reads outgoing links and backlinks from the stored relations', () => {
    const idea = block('idea', 'Idee');
    const source = block('source', 'Bron', 'Werk [[Idee]] uit.');
    const links = [link('source', 'idea')];

    expect(resolveBlockReferences(idea, [idea, source], links).backlinks.map(item => item.block.id)).toEqual(['source']);
    expect(resolveBlockReferences(source, [idea, source], links).outgoing.map(item => item.block.id)).toEqual(['idea']);
  });

  it('marks a reference that lives in another project', () => {
    const here = block('here', 'Hier', '', 'project-a');
    const elsewhere = block('elsewhere', 'Elders', '', 'project-b');
    const [reference] = resolveBlockReferences(here, [here, elsewhere], [link('here', 'elsewhere')]).outgoing;

    expect(reference.block.id).toBe('elsewhere');
    expect(reference.crossProject).toBe(true);
    expect(reference.type).toBe('relates-to');
  });

  it('reports the relation type on each reference', () => {
    const claim = block('claim', 'Bewering');
    const evidence = block('evidence', 'Bewijs');
    const [reference] = resolveBlockReferences(claim, [claim, evidence], [link('claim', 'evidence', 'contradicts')]).outgoing;
    expect(reference.type).toBe('contradicts');
  });

  it('hides a reference to a block in the trash', () => {
    const kept = block('kept', 'Blijft');
    const trashed = { ...block('gone', 'Weg'), isTrash: true };
    const references = resolveBlockReferences(kept, [kept, trashed], [link('kept', 'gone')]);
    expect(references.outgoing).toEqual([]);
  });
});

describe('keeping relations in step with the text', () => {
  const idea = block('idea', 'Idee');
  const other = block('other', 'Ander idee');

  it('creates a relation for a new wiki link', () => {
    const source = block('source', 'Bron', 'Werk [[Idee]] uit.');
    const result = syncWikiLinksForBlock(source, [source, idea, other], []);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({ sourceBlockId: 'source', targetBlockId: 'idea', type: 'relates-to' });
    expect(result.removedIds).toEqual([]);
  });

  it('does not duplicate a relation that already exists', () => {
    const source = block('source', 'Bron', 'Werk [[Idee]] uit.');
    const result = syncWikiLinksForBlock(source, [source, idea], [link('source', 'idea')]);
    expect(result.added).toEqual([]);
    expect(result.removedIds).toEqual([]);
  });

  it('drops the relation once the link is removed from the text', () => {
    const source = block('source', 'Bron', 'Geen verwijzing meer.');
    const result = syncWikiLinksForBlock(source, [source, idea], [link('source', 'idea')]);
    expect(result.added).toEqual([]);
    expect(result.removedIds).toEqual(['link-source-idea-relates-to']);
  });

  it('leaves a deliberate typed relation alone when the prose changes', () => {
    const source = block('source', 'Bron', 'Geen verwijzing meer.');
    const result = syncWikiLinksForBlock(source, [source, idea], [link('source', 'idea', 'contradicts')]);
    expect(result.removedIds).toEqual([]);
  });

  it('links across projects', () => {
    const source = block('source', 'Bron', 'Zie [[Elders]].', 'project-a');
    const target = block('target', 'Elders', '', 'project-b');
    const result = syncWikiLinksForBlock(source, [source, target], []);
    expect(result.added[0]).toMatchObject({ targetBlockId: 'target' });
  });

  it('survives a rename because relations point at ids', () => {
    const source = block('source', 'Bron', 'Werk [[Idee]] uit.');
    const renamed = { ...idea, title: 'Heel ander idee' };
    const existing = [link('source', 'idea')];

    // The stored relation still resolves after the rename.
    expect(resolveBlockReferences(source, [source, renamed], existing).outgoing.map(item => item.block.id)).toEqual(['idea']);
  });

  it('leaves an unresolvable title reported rather than silently dropped', () => {
    const source = block('source', 'Bron', 'Zie [[Bestaat niet]].');
    const result = syncWikiLinksForBlock(source, [source, idea], []);
    expect(result.added).toEqual([]);
    expect(result.unresolved).toEqual(['Bestaat niet']);
  });

  it('refuses to guess when two blocks share a title', () => {
    const twinA = block('twin-a', 'Dubbel');
    const twinB = block('twin-b', 'Dubbel');
    const source = block('source', 'Bron', 'Zie [[Dubbel]].');
    const result = syncWikiLinksForBlock(source, [source, twinA, twinB], []);
    expect(result.added).toEqual([]);
    expect(result.ambiguous).toEqual(['Dubbel']);
  });
});
