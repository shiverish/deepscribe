import { describe, expect, it } from 'vitest';
import { buildProjectHubs, buildProjectOverview, findLooseEnds } from './graphOverview';
import type { Block, BlockLink, Project } from '../types';

function block(id: string, projectId = 'proj-a', overrides: Partial<Block> = {}): Block {
  return {
    id, projectId, parentId: null, title: id, content: '<p></p>', plainText: '',
    order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0,
    tags: [], isTrash: false, createdAt: 1, updatedAt: 1, ...overrides
  };
}

function link(source: string, target: string, type: BlockLink['type'] = 'relates-to'): BlockLink {
  return { id: `link-${source}-${target}`, sourceBlockId: source, targetBlockId: target, type, createdBy: 'user', createdAt: 1 };
}

function project(id: string, title: string, overrides: Partial<Project> = {}): Project {
  return {
    id, title, description: '', color: '#111', order: 0, tags: [],
    isTrash: false, createdAt: 1, updatedAt: 1, ...overrides
  };
}

const projects = [project('proj-a', 'Onderzoek'), project('proj-b', 'Product')];

describe('the workspace at project level', () => {
  it('counts the blocks a project actually holds', () => {
    const blocks = [block('a1'), block('a2'), block('b1', 'proj-b')];
    const overview = buildProjectOverview(blocks, [], projects);

    expect(overview.nodes.map(node => [node.project.id, node.blockCount]))
      .toEqual([['proj-a', 2], ['proj-b', 1]]);
  });

  it('leaves out the trash and the system inbox', () => {
    const withInbox = [
      ...projects,
      project('proj-trash', 'Weg', { isTrash: true }),
      project('proj-system-task-inbox', 'Workspace Inbox', { systemKind: 'task-inbox' })
    ];
    const overview = buildProjectOverview([block('a1')], [], withInbox);

    expect(overview.nodes.map(node => node.project.id)).toEqual(['proj-a', 'proj-b']);
  });

  it('does not count a trashed block towards its project', () => {
    const blocks = [block('a1'), block('a2', 'proj-a', { isTrash: true })];
    const overview = buildProjectOverview(blocks, [], projects);

    expect(overview.nodes.find(node => node.project.id === 'proj-a')?.blockCount).toBe(1);
  });

  it('weighs an edge by how many relations run between the two projects', () => {
    const blocks = [block('a1'), block('a2'), block('b1', 'proj-b'), block('b2', 'proj-b')];
    const links = [link('a1', 'b1'), link('a2', 'b1'), link('b2', 'a1')];
    const overview = buildProjectOverview(blocks, links, projects);

    expect(overview.edges).toEqual([{ sourceId: 'proj-a', targetId: 'proj-b', weight: 3 }]);
  });

  it('yields one edge per pair, whichever way the relations point', () => {
    const blocks = [block('a1'), block('b1', 'proj-b')];
    const overview = buildProjectOverview(blocks, [link('a1', 'b1'), link('b1', 'a1')], projects);

    expect(overview.edges).toHaveLength(1);
    expect(overview.edges[0].weight).toBe(2);
  });

  it('keeps a relation inside one project out of the cross-project count', () => {
    const blocks = [block('a1'), block('a2'), block('b1', 'proj-b')];
    const overview = buildProjectOverview(blocks, [link('a1', 'a2'), link('a1', 'b1')], projects);
    const onderzoek = overview.nodes.find(node => node.project.id === 'proj-a');

    expect(onderzoek).toMatchObject({ linkCount: 2, crossProjectCount: 1 });
    expect(overview.edges).toHaveLength(1);
  });

  it('counts a dependency as a relation like any other', () => {
    const blocks = [block('a1', 'proj-a', { dependsOn: ['b1'] }), block('b1', 'proj-b')];
    const overview = buildProjectOverview(blocks, [], projects);

    expect(overview.edges).toEqual([{ sourceId: 'proj-a', targetId: 'proj-b', weight: 1 }]);
  });

  it('drops the quietest projects when there are too many to draw', () => {
    const many = Array.from({ length: 5 }, (_, index) => project(`p${index}`, `P${index}`));
    const blocks = many.flatMap((item, index) =>
      Array.from({ length: index + 1 }, (_, n) => block(`${item.id}-${n}`, item.id)));
    const overview = buildProjectOverview(blocks, [], many, { maxProjects: 2 });

    expect(overview.nodes.map(node => node.project.id)).toEqual(['p4', 'p3']);
    expect(overview.hiddenCount).toBe(3);
  });

  it('places every project somewhere, and always in the same spot', () => {
    const blocks = [block('a1'), block('b1', 'proj-b')];
    const first = buildProjectOverview(blocks, [], projects);
    const second = buildProjectOverview(blocks, [], projects);

    expect(first.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(first.nodes.map(node => [node.x, node.y])).toEqual(second.nodes.map(node => [node.x, node.y]));
  });
});

describe('the way in to a project', () => {
  it('ranks blocks by how many relations touch them', () => {
    const blocks = [block('hub'), block('a'), block('b'), block('c')];
    const links = [link('hub', 'a'), link('hub', 'b'), link('c', 'hub')];
    const hubs = buildProjectHubs('proj-a', blocks, links, projects);

    expect(hubs.nodes[0]).toMatchObject({ degree: 3 });
    expect(hubs.nodes[0].block.id).toBe('hub');
  });

  it('counts a relation reaching out of the project towards the hub', () => {
    const blocks = [block('a1'), block('b1', 'proj-b')];
    const hubs = buildProjectHubs('proj-a', blocks, [link('a1', 'b1')], projects);

    expect(hubs.nodes.map(node => node.block.id)).toEqual(['a1']);
    expect(hubs.nodes[0].degree).toBe(1);
  });

  it('draws only the relations between the hubs it shows', () => {
    const blocks = [block('a1'), block('b1', 'proj-b')];
    const hubs = buildProjectHubs('proj-a', blocks, [link('a1', 'b1')], projects);

    expect(hubs.edges).toEqual([]);
  });

  it('reports the blocks nothing links to rather than drawing them', () => {
    const blocks = [block('hub'), block('a'), block('lonely'), block('lonelier')];
    const hubs = buildProjectHubs('proj-a', blocks, [link('hub', 'a')], projects);

    expect(hubs.nodes.map(node => node.block.id).sort()).toEqual(['a', 'hub']);
    expect(hubs.orphanCount).toBe(2);
  });

  it('says how many connected blocks the cap left out', () => {
    const blocks = [block('hub'), block('a'), block('b'), block('c')];
    const links = [link('hub', 'a'), link('hub', 'b'), link('hub', 'c')];
    const hubs = buildProjectHubs('proj-a', blocks, links, projects, { maxHubs: 2 });

    expect(hubs.nodes).toHaveLength(2);
    expect(hubs.hiddenCount).toBe(2);
  });

  it('has nothing to show for a project that does not exist', () => {
    const hubs = buildProjectHubs('proj-nope', [block('a1')], [], projects);

    expect(hubs).toMatchObject({ project: null, nodes: [], edges: [], orphanCount: 0 });
  });
});

describe('loose ends', () => {
  it('lists a block no relation and no dependency touches', () => {
    const blocks = [block('linked'), block('target'), block('lonely')];
    const { orphans } = findLooseEnds(blocks, [link('linked', 'target')], projects);

    expect(orphans.map(entry => entry.block.id)).toEqual(['lonely']);
    expect(orphans[0].projectTitle).toBe('Onderzoek');
  });

  it('does not call a block an orphan just because it only has a dependency', () => {
    const blocks = [block('a', 'proj-a', { dependsOn: ['b'] }), block('b')];
    const { orphans } = findLooseEnds(blocks, [], projects);

    expect(orphans).toEqual([]);
  });

  it('reports a reference pointing at a title no block carries', () => {
    const blocks = [block('a', 'proj-a', { plainText: 'zie [[Bestaat Niet]]' })];
    const { danglingReferences } = findLooseEnds(blocks, [], projects);

    expect(danglingReferences).toHaveLength(1);
    expect(danglingReferences[0].unresolved).toEqual(['Bestaat Niet']);
  });

  it('reports a reference more than one block answers to', () => {
    const blocks = [
      block('a', 'proj-a', { plainText: 'zie [[Notitie]]' }),
      block('b', 'proj-a', { title: 'Notitie' }),
      block('c', 'proj-b', { title: 'Notitie' })
    ];
    const { danglingReferences } = findLooseEnds(blocks, [], projects);

    expect(danglingReferences[0].ambiguous).toEqual(['Notitie']);
  });

  it('stays quiet about a reference that resolves', () => {
    const blocks = [
      block('a', 'proj-a', { plainText: 'zie [[Notitie]]' }),
      block('b', 'proj-a', { title: 'Notitie' })
    ];

    expect(findLooseEnds(blocks, [], projects).danglingReferences).toEqual([]);
  });

  it('narrows to one project when asked', () => {
    const blocks = [block('lonely-a'), block('lonely-b', 'proj-b')];
    const { orphans } = findLooseEnds(blocks, [], projects, { projectId: 'proj-b' });

    expect(orphans.map(entry => entry.block.id)).toEqual(['lonely-b']);
  });

  it('leaves the trash out of both lists', () => {
    const blocks = [
      block('gone', 'proj-a', { isTrash: true, plainText: 'zie [[Bestaat Niet]]' }),
      block('here')
    ];
    const { orphans, danglingReferences } = findLooseEnds(blocks, [], projects);

    expect(orphans.map(entry => entry.block.id)).toEqual(['here']);
    expect(danglingReferences).toEqual([]);
  });

  it('shows the most recently touched orphans first', () => {
    const blocks = [
      block('old', 'proj-a', { updatedAt: 10 }),
      block('new', 'proj-a', { updatedAt: 99 })
    ];
    const { orphans } = findLooseEnds(blocks, [], projects);

    expect(orphans.map(entry => entry.block.id)).toEqual(['new', 'old']);
  });
});
