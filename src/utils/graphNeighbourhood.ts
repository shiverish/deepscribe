import type { Block, BlockLink, BlockLinkType } from '../types';
import { collectRelatedBlocks } from '../../mcp/core/links.mjs';

/** `depends-on` is not a stored relation type; it is derived from `dependsOn`. */
export type GraphEdgeType = BlockLinkType | 'depends-on';

export interface GraphNode {
  block: Block;
  /** Steps from the centre. The centre itself is 0. */
  distance: number;
  direction: 'outgoing' | 'incoming' | 'center';
  type: GraphEdgeType | null;
  crossProject: boolean;
  projectTitle: string | null;
  projectColor: string | null;
  /** Position on the canvas, centre at (0, 0). */
  x: number;
  y: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: GraphEdgeType;
  crossProject: boolean;
}

export interface GraphNeighbourhood {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Neighbours that exist but were left out to keep the picture readable. */
  hiddenCount: number;
}

export interface GraphOptions {
  depth?: number;
  types?: GraphEdgeType[];
  includeDependencies?: boolean;
  crossProjectOnly?: boolean;
  maxNodes?: number;
  /** Distance between rings, in canvas units. */
  ringRadius?: number;
  /** Half the width of a node, used to keep nodes on a ring from touching. */
  nodeRadius?: number;
}

export const GRAPH_EDGE_TYPES: GraphEdgeType[] = [
  'relates-to', 'supports', 'contradicts', 'derived-from', 'source-of', 'depends-on'
];

const DEFAULTS = {
  depth: 1,
  includeDependencies: true,
  crossProjectOnly: false,
  maxNodes: 40,
  ringRadius: 170,
  nodeRadius: 62
};

/**
 * Turns `dependsOn` into edges of the same shape as stored relations, so both
 * kinds travel through one traversal instead of two.
 */
function dependencyEdges(blocks: Block[]): BlockLink[] {
  return blocks.flatMap(block => (block.dependsOn ?? []).map(targetId => ({
    id: `depends-${block.id}-${targetId}`,
    sourceBlockId: block.id,
    targetBlockId: targetId,
    type: 'depends-on' as BlockLinkType,
    createdBy: 'user' as const,
    createdAt: 0
  })));
}

/**
 * Places nodes on rings around the centre.
 *
 * A ring grows when it would otherwise have to pack nodes closer together than
 * their own width, so a busy neighbourhood spreads outward instead of
 * overlapping. Ordering is by id, so the same input always draws the same
 * picture — a layout that jumps on every render is unreadable.
 */
function placeOnRings(
  byDistance: Map<number, GraphNode[]>,
  ringRadius: number,
  nodeRadius: number
): void {
  for (const [distance, ring] of byDistance) {
    if (distance === 0) continue;
    ring.sort((left, right) => left.block.id.localeCompare(right.block.id));

    // Chord between neighbours on a circle: 2 * r * sin(pi / n).
    const minimumRadius = ring.length > 1
      ? (nodeRadius * 1.1) / Math.sin(Math.PI / ring.length)
      : 0;
    const radius = Math.max(distance * ringRadius, minimumRadius);
    // Odd rings start offset so nodes do not line up straight behind each other.
    const offset = distance % 2 === 0 ? 0 : Math.PI / ring.length;

    ring.forEach((node, index) => {
      const angle = offset + (index * 2 * Math.PI) / ring.length;
      node.x = Math.round(Math.cos(angle) * radius);
      node.y = Math.round(Math.sin(angle) * radius);
    });
  }
}

/**
 * Builds the neighbourhood around one block: which blocks are connected to it,
 * how, and where to draw them.
 *
 * Deliberately local. A whole-workspace graph of several hundred blocks is a
 * cloud nobody reads; a depth-limited neighbourhood answers the question you
 * actually have, which is what this block hangs together with.
 */
export function buildGraphNeighbourhood(
  centerId: string,
  blocks: Block[],
  links: BlockLink[],
  projects: Array<{ id: string; title: string; color: string }>,
  options: GraphOptions = {}
): GraphNeighbourhood {
  const settings = { ...DEFAULTS, ...options };
  const byId = new Map(blocks.map(block => [block.id, block]));
  const center = byId.get(centerId);
  if (!center || center.isTrash) return { nodes: [], edges: [], hiddenCount: 0 };

  const projectById = new Map(projects.map(project => [project.id, project]));
  const allowed = settings.types && settings.types.length > 0 ? new Set(settings.types) : null;

  const usableLinks = [
    ...links,
    ...(settings.includeDependencies ? dependencyEdges(blocks) : [])
  ].filter(link => !allowed || allowed.has(link.type as GraphEdgeType));

  const related = collectRelatedBlocks(centerId, usableLinks, byId, { depth: settings.depth })
    .filter(entry => !settings.crossProjectOnly || entry.block.projectId !== center.projectId);

  const toNode = (
    block: Block,
    distance: number,
    direction: GraphNode['direction'],
    type: GraphEdgeType | null
  ): GraphNode => {
    const project = projectById.get(block.projectId);
    return {
      block,
      distance,
      direction,
      type,
      crossProject: block.projectId !== center.projectId,
      projectTitle: project?.title ?? null,
      projectColor: project?.color ?? null,
      x: 0,
      y: 0
    };
  };

  // Nearest first, so the cap drops the least relevant rather than an arbitrary slice.
  const ordered = [...related].sort((left, right) =>
    left.distance - right.distance || left.block.id.localeCompare(right.block.id));
  const kept = ordered.slice(0, Math.max(0, settings.maxNodes - 1));
  const hiddenCount = ordered.length - kept.length;

  const nodes: GraphNode[] = [
    toNode(center, 0, 'center', null),
    ...kept.map(entry => toNode(entry.block, entry.distance, entry.direction, entry.type as GraphEdgeType))
  ];

  const visible = new Set(nodes.map(node => node.block.id));
  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const link of usableLinks) {
    if (!visible.has(link.sourceBlockId) || !visible.has(link.targetBlockId)) continue;
    const key = `${link.sourceBlockId} ${link.targetBlockId} ${link.type}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    const source = byId.get(link.sourceBlockId);
    const target = byId.get(link.targetBlockId);
    edges.push({
      sourceId: link.sourceBlockId,
      targetId: link.targetBlockId,
      type: link.type as GraphEdgeType,
      crossProject: Boolean(source && target && source.projectId !== target.projectId)
    });
  }

  const byDistance = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const ring = byDistance.get(node.distance);
    if (ring) ring.push(node);
    else byDistance.set(node.distance, [node]);
  }
  placeOnRings(byDistance, settings.ringRadius, settings.nodeRadius);

  return { nodes, edges, hiddenCount };
}
