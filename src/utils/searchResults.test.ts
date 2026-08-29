import { beforeEach, describe, expect, it } from 'vitest';
import { buildSearchResults } from './searchResults';
import { invalidateChunks } from './semanticSearch';
import type { Block, Project } from '../types';

function block(overrides: Partial<Block> = {}): Block {
  const content = overrides.content ?? '<p>Leeg</p>';
  return {
    id: 'block-1', projectId: 'proj-1', parentId: null, title: 'Blok', plainText: 'Leeg',
    order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0,
    tags: [], isTrash: false, createdAt: 1, updatedAt: 1, ...overrides, content
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', title: 'Project', description: '', color: '#abc', order: 0,
    tags: [], isTrash: false, createdAt: 1, updatedAt: 1, ...overrides
  };
}

beforeEach(() => invalidateChunks());

describe('search results for the app window', () => {
  it('builds a block row with its breadcrumb and the heading of the matching passage', () => {
    const parent = block({ id: 'parent', title: 'Hoofdstukken' });
    const hit = block({
      id: 'hit', parentId: 'parent', title: 'Hoofdstuk 1',
      content: '<h2>Uitvoering</h2><p>De kalibratiewaarde bepaalt hier de uitkomst.</p>'
    });

    const [result] = buildSearchResults({
      blocks: [parent, hit], projects: [project({ title: 'From Inside' })],
      navigationBlocks: [parent, hit], text: 'kalibratiewaarde', tags: []
    });

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') throw new Error('expected a block result');
    expect(result.block.id).toBe('hit');
    expect(result.projectTitle).toBe('From Inside');
    expect(result.pathSegments.map(segment => segment.title)).toEqual(['From Inside', 'Hoofdstukken']);
    expect(result.heading).toBe('Uitvoering');
    expect(result.snippet).toContain('kalibratiewaarde');
  });

  it('returns a project row for a hit in a scratchpad', () => {
    const fromInside = project({
      id: 'proj-book', title: 'From Inside',
      scratchpad: '## Aanbevolen boekuitvoering\n\nCremekleurig papier en een serif zoals Garamond.',
      scratchpadUpdatedAt: 2
    });

    const results = buildSearchResults({
      blocks: [], projects: [fromInside], navigationBlocks: [], text: 'garamond', tags: []
    });

    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result.kind).toBe('project');
    if (result.kind !== 'project') throw new Error('expected a project result');
    expect(result.project.id).toBe('proj-book');
    expect(result.heading).toBe('Aanbevolen boekuitvoering');
    expect(result.snippet.toLowerCase()).toContain('garamond');
  });

  it('orders block and project rows together by score', () => {
    const results = buildSearchResults({
      blocks: [block({ id: 'weak', title: 'Iets', content: '<p>energie ergens</p>' })],
      projects: [project({ id: 'proj-strong', title: 'Energy', tags: ['energy'], description: '<p>Energy en recharge</p>' })],
      navigationBlocks: [], text: 'energy', tags: []
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe('project');
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index - 1].score).toBeGreaterThanOrEqual(results[index].score);
    }
  });

  it('leaves the workspace inbox and trashed projects out of the results', () => {
    const results = buildSearchResults({
      blocks: [],
      projects: [
        project({ id: 'proj-inbox', title: 'Workspace Inbox', systemKind: 'task-inbox', description: '<p>zoekterm</p>' }),
        project({ id: 'proj-trash', title: 'Weg', isTrash: true, description: '<p>zoekterm</p>' })
      ],
      navigationBlocks: [], text: 'zoekterm', tags: []
    });
    expect(results).toEqual([]);
  });

  it('applies the tag filter to project rows', () => {
    const projects = [
      project({ id: 'proj-tagged', title: 'Met tag', tags: ['app'], description: '<p>zoekterm</p>' }),
      project({ id: 'proj-untagged', title: 'Zonder tag', description: '<p>zoekterm</p>' })
    ];
    const results = buildSearchResults({ blocks: [], projects, navigationBlocks: [], text: 'zoekterm', tags: ['app'] });
    expect(results).toHaveLength(1);
    expect(results[0].kind === 'project' && results[0].project.id).toBe('proj-tagged');
  });

  it('lists the filtered blocks when the query carries only tags', () => {
    const tagged = block({ id: 'tagged', tags: ['app'], plainText: 'Inhoud van dit blok' });
    const results = buildSearchResults({
      blocks: [tagged], projects: [project()], navigationBlocks: [tagged], text: '', tags: ['app']
    });
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('block');
    expect(results[0].snippet).toBe('Inhoud van dit blok');
  });

  it('honours the result limit', () => {
    const blocks = Array.from({ length: 30 }, (_, index) => block({
      id: `block-${index}`, title: `Zoekterm ${index}`, content: '<p>zoekterm</p>'
    }));
    const results = buildSearchResults({
      blocks, projects: [project()], navigationBlocks: blocks, text: 'zoekterm', tags: [], limit: 5
    });
    expect(results).toHaveLength(5);
  });

  it('survives a block whose parent chain loops', () => {
    const a = block({ id: 'a', parentId: 'b', title: 'A', content: '<p>zoekterm</p>' });
    const b = block({ id: 'b', parentId: 'a', title: 'B' });
    const results = buildSearchResults({
      blocks: [a, b], projects: [project()], navigationBlocks: [a, b], text: 'zoekterm', tags: []
    });
    expect(results.length).toBeGreaterThan(0);
  });
});
