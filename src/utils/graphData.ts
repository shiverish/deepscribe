import type { Block, Project } from '../types';
import { extractWikiLinks } from './references';

export type GraphNodeType = 'block' | 'project' | 'tag';
export type GraphEdgeType = 'wiki-link' | 'hierarchy' | 'tag' | 'project';
export type GraphScope = 'project' | 'workspace';

export interface GraphNode {
  id: string;
  title: string;
  type: GraphNodeType;
  projectId?: string;
  parentId?: string | null;
  color?: string;
  tags?: string[];
  wordCount: number;
  connectionCount: number;
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
}

export interface GraphFilterOptions {
  scope: GraphScope;
  activeProjectId: string | null;
  showWikiLinks: boolean;
  showHierarchy: boolean;
  showTags: boolean;
  showOrphans: boolean;
  searchQuery?: string;
}

export function countWords(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function buildGraphData(
  projects: Project[],
  blocks: Block[],
  options: GraphFilterOptions
): GraphData {
  const {
    scope,
    activeProjectId,
    showWikiLinks,
    showHierarchy,
    showTags,
    showOrphans
  } = options;

  const nonTrashProjects = projects.filter(p => !p.isTrash);
  const nonTrashBlocks = blocks.filter(b => !b.isTrash);

  // Determine which blocks to include based on scope
  const targetBlocks = scope === 'project' && activeProjectId
    ? nonTrashBlocks.filter(b => b.projectId === activeProjectId)
    : nonTrashBlocks;

  const targetProjects = scope === 'project' && activeProjectId
    ? nonTrashProjects.filter(p => p.id === activeProjectId)
    : nonTrashProjects;

  const projectMap = new Map<string, Project>(nonTrashProjects.map(p => [p.id, p]));
  const blockTitleMap = new Map<string, Block>();
  for (const block of targetBlocks) {
    blockTitleMap.set(block.title.trim().toLowerCase(), block);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();

  const addEdge = (source: string, target: string, type: GraphEdgeType, label?: string) => {
    if (source === target) return;
    const key = `${source}->${target}:${type}`;
    const reverseKey = `${target}->${source}:${type}`;
    if (edgeKeys.has(key) || (type !== 'hierarchy' && edgeKeys.has(reverseKey))) return;
    edgeKeys.add(key);
    edges.push({
      id: `edge-${edges.length + 1}`,
      source,
      target,
      type,
      label
    });
  };

  // 1. Add Project Nodes in workspace scope or if needed
  if (scope === 'workspace') {
    for (const proj of targetProjects) {
      if (!nodeIds.has(proj.id)) {
        nodeIds.add(proj.id);
        nodes.push({
          id: proj.id,
          title: proj.title,
          type: 'project',
          color: proj.color || '#3b82f6',
          wordCount: 0,
          connectionCount: 0,
          radius: 16
        });
      }
    }
  }

  // 2. Add Block Nodes
  for (const block of targetBlocks) {
    if (!nodeIds.has(block.id)) {
      nodeIds.add(block.id);
      const proj = projectMap.get(block.projectId);
      const words = countWords(block.plainText || '');
      nodes.push({
        id: block.id,
        title: block.title || 'Untitled Block',
        type: 'block',
        projectId: block.projectId,
        parentId: block.parentId,
        color: proj?.color,
        tags: block.tags || [],
        wordCount: words,
        connectionCount: 0,
        radius: Math.min(22, Math.max(8, 7 + Math.log2(words + 1) * 1.5))
      });
    }
  }

  // 3. Connect Project to Root Blocks in workspace scope
  if (scope === 'workspace') {
    for (const block of targetBlocks) {
      if (block.parentId === null && nodeIds.has(block.projectId)) {
        addEdge(block.projectId, block.id, 'project', 'project-root');
      }
    }
  }

  // 4. Hierarchy Edges (Parent -> Child)
  if (showHierarchy) {
    for (const block of targetBlocks) {
      if (block.parentId && nodeIds.has(block.parentId)) {
        addEdge(block.parentId, block.id, 'hierarchy', 'parent');
      }
    }
  }

  // 5. Wiki-link Edges ([[Reference]])
  if (showWikiLinks) {
    for (const block of targetBlocks) {
      const links = extractWikiLinks(block.plainText || '');
      for (const linkTitle of links) {
        const targetBlock = blockTitleMap.get(linkTitle.toLowerCase());
        if (targetBlock && targetBlock.id !== block.id && nodeIds.has(targetBlock.id)) {
          addEdge(block.id, targetBlock.id, 'wiki-link', 'links to');
        }
      }
    }
  }

  // 6. Tag Nodes & Tag Edges
  if (showTags) {
    const tagMap = new Map<string, string[]>(); // tag -> blockIds
    for (const block of targetBlocks) {
      for (const tag of block.tags || []) {
        const cleanTag = tag.trim().toLowerCase();
        if (!cleanTag) continue;
        if (!tagMap.has(cleanTag)) tagMap.set(cleanTag, []);
        tagMap.get(cleanTag)!.push(block.id);
      }
    }

    for (const [tag, linkedBlockIds] of tagMap.entries()) {
      if (linkedBlockIds.length > 0) {
        const tagNodeId = `tag:${tag}`;
        if (!nodeIds.has(tagNodeId)) {
          nodeIds.add(tagNodeId);
          nodes.push({
            id: tagNodeId,
            title: `#${tag}`,
            type: 'tag',
            color: '#eab308',
            tags: [tag],
            wordCount: 0,
            connectionCount: 0,
            radius: Math.min(18, Math.max(7, 6 + linkedBlockIds.length * 1.5))
          });
        }
        for (const blockId of linkedBlockIds) {
          addEdge(blockId, tagNodeId, 'tag', 'tagged');
        }
      }
    }
  }

  // Calculate connection counts
  const connectionCounts = new Map<string, number>();
  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
  }

  for (const node of nodes) {
    node.connectionCount = connectionCounts.get(node.id) || 0;
    // Adjust radius slightly based on number of connections
    if (node.type === 'block') {
      node.radius = Math.min(24, Math.max(7, node.radius + Math.min(8, node.connectionCount * 1.2)));
    }
  }

  // Filter orphans if requested
  let filteredNodes = nodes;
  let filteredEdges = edges;

  if (!showOrphans) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
    filteredNodes = nodes.filter(node => connectedNodeIds.has(node.id));
    const activeNodeIdSet = new Set(filteredNodes.map(n => n.id));
    filteredEdges = edges.filter(
      edge => activeNodeIdSet.has(edge.source) && activeNodeIdSet.has(edge.target)
    );
  }

  // Filter orphans if requested

  const nodeMap = new Map<string, GraphNode>(filteredNodes.map(n => [n.id, n]));

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    nodeMap
  };
}
