import { describe, it, expect } from 'vitest';
import { buildGraphData, countWords } from './graphData';
import type { Project, Block } from '../types';

describe('graphData utils', () => {
  it('counts words correctly', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('Hello world deepscribe')).toBe(3);
    expect(countWords('One\ntwo\tthree   four')).toBe(4);
  });

  it('builds nodes and edges from projects and blocks with wiki-links and hierarchy', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj-1',
        title: 'Project Alpha',
        description: '',
        color: '#3b82f6',
        order: 0,
        tags: ['research'],
        isTrash: false,
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const mockBlocks: Block[] = [
      {
        id: 'b-1',
        projectId: 'proj-1',
        parentId: null,
        title: 'Root Block',
        content: '<p>Link to [[Sub Block]]</p>',
        plainText: 'Link to [[Sub Block]]',
        order: 0,
        childCount: 1,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: ['core'],
        createdAt: 1000,
        updatedAt: 1000
      },
      {
        id: 'b-2',
        projectId: 'proj-1',
        parentId: 'b-1',
        title: 'Sub Block',
        content: '<p>Content here</p>',
        plainText: 'Content here',
        order: 0,
        childCount: 0,
        taskCount: 1,
        completedTaskCount: 1,
        attachmentCount: 0,
        isTrash: false,
        tags: ['core', 'notes'],
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const graph = buildGraphData(mockProjects, mockBlocks, {
      scope: 'project',
      activeProjectId: 'proj-1',
      showWikiLinks: true,
      showHierarchy: true,
      showTags: true,
      showOrphans: true
    });

    // We should have block nodes + tag nodes
    expect(graph.nodes.some(n => n.id === 'b-1')).toBe(true);
    expect(graph.nodes.some(n => n.id === 'b-2')).toBe(true);
    expect(graph.nodes.some(n => n.id === 'tag:core')).toBe(true);

    // Edges: wiki-link between b-1 and b-2, hierarchy between b-1 and b-2, tags
    expect(graph.edges.some(e => e.type === 'wiki-link')).toBe(true);
    expect(graph.edges.some(e => e.type === 'hierarchy')).toBe(true);
    expect(graph.edges.some(e => e.type === 'tag')).toBe(true);
  });
});
