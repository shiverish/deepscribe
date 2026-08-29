import { describe, expect, it } from 'vitest';
import { buildGraphNeighbourhood } from './graphNeighbourhood';
import type { Block, BlockLink } from '../types';

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

const projects = [
  { id: 'proj-a', title: 'Onderzoek', color: '#111' },
  { id: 'proj-b', title: 'Product', color: '#222' }
];

describe('graph neighbourhood', () => {
  it('shows the direct neighbours of a block', () => {
    const center = block('center');
    const out = block('out');
    const unrelated = block('unrelated');
    const result = buildGraphNeighbourhood('center', [center, out, unrelated], [link('center', 'out')], projects);

    expect(result.nodes.map(node => node.block.id).sort()).toEqual(['center', 'out']);
    expect(result.nodes.find(node => node.block.id === 'center')).toMatchObject({ distance: 0, direction: 'center' });
    expect(result.nodes.find(node => node.block.id === 'out')).toMatchObject({ distance: 1, direction: 'outgoing' });
  });

  it('includes a block that is only connected through a backlink', () => {
    const center = block('center');
    const incoming = block('incoming');
    const result = buildGraphNeighbourhood('center', [center, incoming], [link('incoming', 'center')], projects);

    expect(result.nodes.map(node => node.block.id)).toContain('incoming');
    expect(result.nodes.find(node => node.block.id === 'incoming')).toMatchObject({ direction: 'incoming' });
  });

  it('marks a neighbour in another project and names it', () => {
    const center = block('center', 'proj-a');
    const elsewhere = block('elsewhere', 'proj-b');
    const result = buildGraphNeighbourhood('center', [center, elsewhere], [link('center', 'elsewhere')], projects);

    const node = result.nodes.find(item => item.block.id === 'elsewhere');
    expect(node).toMatchObject({ crossProject: true, projectTitle: 'Product', projectColor: '#222' });
    expect(result.edges.find(edge => edge.targetId === 'elsewhere')?.crossProject).toBe(true);
  });

  it('expands predictably as the depth grows', () => {
    const blocks = [block('center'), block('one'), block('two'), block('three')];
    const links = [link('center', 'one'), link('one', 'two'), link('two', 'three')];

    const depth = (value: number) => buildGraphNeighbourhood('center', blocks, links, projects, { depth: value })
      .nodes.map(node => node.block.id).sort();

    expect(depth(1)).toEqual(['center', 'one']);
    expect(depth(2)).toEqual(['center', 'one', 'two']);
    expect(depth(3)).toEqual(['center', 'one', 'three', 'two']);
  });

  it('treats dependsOn as its own edge type and can leave it out', () => {
    const center = block('center', 'proj-a', { dependsOn: ['dependency'] });
    const dependency = block('dependency');
    const blocks = [center, dependency];

    const withDependencies = buildGraphNeighbourhood('center', blocks, [], projects);
    expect(withDependencies.nodes.map(node => node.block.id)).toContain('dependency');
    expect(withDependencies.edges[0]).toMatchObject({ sourceId: 'center', targetId: 'dependency', type: 'depends-on' });

    const without = buildGraphNeighbourhood('center', blocks, [], projects, { includeDependencies: false });
    expect(without.nodes.map(node => node.block.id)).toEqual(['center']);
  });

  it('filters on relation type', () => {
    const blocks = [block('center'), block('supporting'), block('opposing')];
    const links = [link('center', 'supporting', 'supports'), link('center', 'opposing', 'contradicts')];

    const result = buildGraphNeighbourhood('center', blocks, links, projects, { types: ['supports'] });
    expect(result.nodes.map(node => node.block.id).sort()).toEqual(['center', 'supporting']);
  });

  it('can show only the neighbours that cross a project boundary', () => {
    const blocks = [block('center', 'proj-a'), block('near', 'proj-a'), block('far', 'proj-b')];
    const links = [link('center', 'near'), link('center', 'far')];

    const result = buildGraphNeighbourhood('center', blocks, links, projects, { crossProjectOnly: true });
    expect(result.nodes.map(node => node.block.id).sort()).toEqual(['center', 'far']);
  });

  it('caps the drawn nodes and counts the rest', () => {
    const neighbours = Array.from({ length: 20 }, (_, index) => block(`n${index.toString().padStart(2, '0')}`));
    const blocks = [block('center'), ...neighbours];
    const links = neighbours.map(neighbour => link('center', neighbour.id));

    const result = buildGraphNeighbourhood('center', blocks, links, projects, { maxNodes: 6 });
    expect(result.nodes).toHaveLength(6);
    expect(result.hiddenCount).toBe(15);
  });

  it('keeps the nearest neighbours when it has to cap', () => {
    const blocks = [block('center'), block('near'), block('mid'), block('far')];
    const links = [link('center', 'near'), link('near', 'mid'), link('mid', 'far')];

    const result = buildGraphNeighbourhood('center', blocks, links, projects, { depth: 3, maxNodes: 3 });
    expect(result.nodes.map(node => node.block.id).sort()).toEqual(['center', 'mid', 'near']);
  });

  it('places the centre at the origin and lays out the same input identically', () => {
    const neighbours = Array.from({ length: 5 }, (_, index) => block(`n${index}`));
    const blocks = [block('center'), ...neighbours];
    const links = neighbours.map(neighbour => link('center', neighbour.id));

    const first = buildGraphNeighbourhood('center', blocks, links, projects);
    const second = buildGraphNeighbourhood('center', blocks, links, projects);

    expect(first.nodes.find(node => node.block.id === 'center')).toMatchObject({ x: 0, y: 0 });
    expect(first.nodes.map(node => [node.block.id, node.x, node.y]))
      .toEqual(second.nodes.map(node => [node.block.id, node.x, node.y]));
  });

  it('spreads a busy ring so nodes never overlap', () => {
    const neighbours = Array.from({ length: 18 }, (_, index) => block(`n${index.toString().padStart(2, '0')}`));
    const blocks = [block('center'), ...neighbours];
    const links = neighbours.map(neighbour => link('center', neighbour.id));

    const { nodes } = buildGraphNeighbourhood('center', blocks, links, projects, { maxNodes: 40, nodeRadius: 62 });
    const ring = nodes.filter(node => node.distance === 1);
    expect(ring).toHaveLength(18);

    for (let i = 0; i < ring.length; i += 1) {
      for (let j = i + 1; j < ring.length; j += 1) {
        const distance = Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y);
        expect(distance).toBeGreaterThanOrEqual(62);
      }
    }
  });

  it('returns nothing for a centre that is missing or trashed', () => {
    expect(buildGraphNeighbourhood('nope', [block('center')], [], projects).nodes).toEqual([]);
    const trashed = { ...block('center'), isTrash: true };
    expect(buildGraphNeighbourhood('center', [trashed], [], projects).nodes).toEqual([]);
  });

  it('gives a lone block just itself, so the view can explain the empty state', () => {
    const result = buildGraphNeighbourhood('center', [block('center')], [], projects);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });
});
