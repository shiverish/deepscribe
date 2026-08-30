import type { Block, BlockLink, Project } from '../types';
import { resolveWikiLinkTargets } from '../../mcp/core/links.mjs';
import type { GraphEdgeType } from './graphNeighbourhood';

/**
 * The two levels that sit above `buildGraphNeighbourhood`.
 *
 * A graph of every block is a cloud nobody reads, so the way in is not more
 * nodes but a coarser one: projects first, then the best-connected blocks
 * inside one project, and only then the neighbourhood of a single block.
 */

export interface ProjectNode {
  project: Project;
  /** Blocks that are not in the trash. */
  blockCount: number;
  /** Relations with at least one end inside this project. */
  linkCount: number;
  /** Relations reaching a different project. */
  crossProjectCount: number;
  x: number;
  y: number;
}

export interface ProjectEdge {
  /** Ordered by id so a pair yields one edge, not two. */
  sourceId: string;
  targetId: string;
  /** Relations running between these two projects, in either direction. */
  weight: number;
}

export interface ProjectOverview {
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  hiddenCount: number;
}

export interface HubNode {
  block: Block;
  /** Relations touching this block, in either direction. */
  degree: number;
  x: number;
  y: number;
}

export interface ProjectHubs {
  project: Project | null;
  nodes: HubNode[];
  edges: Array<{ sourceId: string; targetId: string; type: GraphEdgeType }>;
  /** Connected blocks left out by the cap. */
  hiddenCount: number;
  /** Blocks in this project that no relation touches. */
  orphanCount: number;
}

export interface LooseEnd {
  block: Block;
  projectTitle: string | null;
  /** Wiki links pointing at a title no block carries. */
  unresolved: string[];
  /** Wiki links pointing at a title more than one block carries. */
  ambiguous: string[];
}

export interface LooseEnds {
  /** Blocks no relation and no dependency touches. */
  orphans: Array<{ block: Block; projectTitle: string | null }>;
  /** Blocks whose text references something the graph cannot resolve. */
  danglingReferences: LooseEnd[];
}

interface FlatEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
}

const OVERVIEW_DEFAULTS = {
  maxProjects: 24,
  maxHubs: 18,
  ringRadius: 150,
  perRing: 8
};

/** Widest node plus breathing room, used to keep a ring from packing too tight. */
const NODE_SPACING = 200;

/** Both stored relations and derived `dependsOn` edges, as one flat list. */
function allEdges(blocks: Block[], links: BlockLink[]): FlatEdge[] {
  const dependencies: FlatEdge[] = blocks.flatMap(block =>
    (block.dependsOn ?? []).map(target => ({
      source: block.id,
      target,
      type: 'depends-on' as GraphEdgeType
    })));
  const relations: FlatEdge[] = links.map(link => ({
    source: link.sourceBlockId,
    target: link.targetBlockId,
    type: link.type as GraphEdgeType
  }));
  return [...relations, ...dependencies];
}

/**
 * Places nodes on concentric rings in the order the caller gives them.
 *
 * A ring only grows past its base radius when its nodes would otherwise touch,
 * so a handful of projects sits tight enough to stay readable instead of being
 * flung to the edges of a mostly empty canvas.
 *
 * Deterministic: the same input always draws the same picture, because a layout
 * that jumps on every render is unreadable.
 */
function placeOnRings<T extends { x: number; y: number }>(
  nodes: T[],
  ringRadius: number,
  perRing: number
): void {
  let index = 0;
  let ring = 1;
  while (index < nodes.length) {
    const capacity = ring === 1 ? Math.min(perRing, nodes.length) : perRing * ring;
    const slice = nodes.slice(index, index + capacity);

    // Chord between neighbours on a circle: 2 * r * sin(pi / n).
    const minimumRadius = slice.length > 1
      ? NODE_SPACING / (2 * Math.sin(Math.PI / slice.length))
      : 0;
    const radius = Math.max(ring * ringRadius, minimumRadius);
    // Even rings start offset so nodes do not line up straight behind each other.
    const offset = ring % 2 === 0 ? Math.PI / slice.length : 0;

    slice.forEach((node, position) => {
      const angle = offset + (position * 2 * Math.PI) / slice.length;
      node.x = Math.round(Math.cos(angle) * radius);
      node.y = Math.round(Math.sin(angle) * radius);
    });
    index += capacity;
    ring += 1;
  }
}

/**
 * The workspace at project level: how big each project is, and how strongly it
 * is tied to the others. Cross-project relations are the whole point here, so
 * they set the edge weight.
 */
export function buildProjectOverview(
  blocks: Block[],
  links: BlockLink[],
  projects: Project[],
  options: { maxProjects?: number; ringRadius?: number; perRing?: number } = {}
): ProjectOverview {
  const settings = { ...OVERVIEW_DEFAULTS, ...options };
  const visible = projects.filter(project => !project.isTrash && !project.systemKind);
  const byId = new Map(visible.map(project => [project.id, project]));

  const blockCounts = new Map<string, number>();
  const projectOfBlock = new Map<string, string>();
  for (const block of blocks) {
    if (block.isTrash || !byId.has(block.projectId)) continue;
    projectOfBlock.set(block.id, block.projectId);
    blockCounts.set(block.projectId, (blockCounts.get(block.projectId) ?? 0) + 1);
  }

  const linkCounts = new Map<string, number>();
  const crossCounts = new Map<string, number>();
  const pairWeights = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const edge of allEdges(blocks, links)) {
    const source = projectOfBlock.get(edge.source);
    const target = projectOfBlock.get(edge.target);
    if (!source || !target) continue;
    bump(linkCounts, source);
    if (source === target) continue;
    bump(linkCounts, target);
    bump(crossCounts, source);
    bump(crossCounts, target);
    const [left, right] = source < target ? [source, target] : [target, source];
    bump(pairWeights, `${left} ${right}`);
  }

  // Busiest first, so the cap drops the projects with the least to show.
  const ordered: ProjectNode[] = visible
    .map(project => ({
      project,
      blockCount: blockCounts.get(project.id) ?? 0,
      linkCount: linkCounts.get(project.id) ?? 0,
      crossProjectCount: crossCounts.get(project.id) ?? 0,
      x: 0,
      y: 0
    }))
    .sort((left, right) =>
      right.blockCount - left.blockCount
      || right.linkCount - left.linkCount
      || left.project.title.localeCompare(right.project.title));

  const nodes = ordered.slice(0, Math.max(0, settings.maxProjects));
  const hiddenCount = ordered.length - nodes.length;
  placeOnRings(nodes, settings.ringRadius, settings.perRing);

  const kept = new Set(nodes.map(node => node.project.id));
  const edges: ProjectEdge[] = [...pairWeights.entries()]
    .map(([key, weight]) => {
      const [sourceId, targetId] = key.split(' ');
      return { sourceId, targetId, weight };
    })
    .filter(edge => kept.has(edge.sourceId) && kept.has(edge.targetId))
    .sort((left, right) =>
      right.weight - left.weight
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId));

  return { nodes, edges, hiddenCount };
}

/**
 * The way in to a project: its best-connected blocks, plus the relations among
 * them. Entering on a hub beats entering on whichever block happened to be open.
 */
export function buildProjectHubs(
  projectId: string,
  blocks: Block[],
  links: BlockLink[],
  projects: Project[],
  options: { maxHubs?: number; ringRadius?: number; perRing?: number } = {}
): ProjectHubs {
  const settings = { ...OVERVIEW_DEFAULTS, ...options };
  const project = projects.find(candidate => candidate.id === projectId) ?? null;
  const inProject = blocks.filter(block => !block.isTrash && block.projectId === projectId);
  const memberIds = new Set(inProject.map(block => block.id));

  const degrees = new Map<string, number>();
  const bump = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);
  const inside: FlatEdge[] = [];

  for (const edge of allEdges(blocks, links)) {
    const sourceInside = memberIds.has(edge.source);
    const targetInside = memberIds.has(edge.target);
    if (!sourceInside && !targetInside) continue;
    // A relation reaching out of the project still makes this block a hub.
    if (sourceInside) bump(edge.source);
    if (targetInside) bump(edge.target);
    if (sourceInside && targetInside) inside.push(edge);
  }

  const connected = inProject.filter(block => (degrees.get(block.id) ?? 0) > 0);
  const ordered: HubNode[] = connected
    .map(block => ({ block, degree: degrees.get(block.id) ?? 0, x: 0, y: 0 }))
    .sort((left, right) =>
      right.degree - left.degree
      || left.block.title.localeCompare(right.block.title)
      || left.block.id.localeCompare(right.block.id));

  const nodes = ordered.slice(0, Math.max(0, settings.maxHubs));
  const hiddenCount = ordered.length - nodes.length;
  placeOnRings(nodes, settings.ringRadius, settings.perRing);

  const kept = new Set(nodes.map(node => node.block.id));
  const seen = new Set<string>();
  const edges: ProjectHubs['edges'] = [];
  for (const edge of inside) {
    if (!kept.has(edge.source) || !kept.has(edge.target)) continue;
    const key = `${edge.source} ${edge.target} ${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ sourceId: edge.source, targetId: edge.target, type: edge.type });
  }

  return {
    project,
    nodes,
    edges,
    hiddenCount,
    orphanCount: inProject.length - connected.length
  };
}

/**
 * What the graph cannot reach: blocks nothing links to, and references pointing
 * at a title that does not exist or that more than one block carries. Both are
 * work someone can act on, which is why they get their own list rather than a
 * footnote in an empty state.
 */
export function findLooseEnds(
  blocks: Block[],
  links: BlockLink[],
  projects: Project[],
  options: { projectId?: string | null; maxItems?: number } = {}
): LooseEnds {
  const maxItems = options.maxItems ?? 50;
  const titleById = new Map(projects.map(project => [project.id, project.title]));
  const projectTitle = (id: string) => titleById.get(id) ?? null;
  const live = blocks.filter(block => !block.isTrash);
  const scope = options.projectId
    ? live.filter(block => block.projectId === options.projectId)
    : live;

  const touched = new Set<string>();
  for (const edge of allEdges(blocks, links)) {
    touched.add(edge.source);
    touched.add(edge.target);
  }

  const orphans = scope
    .filter(block => !touched.has(block.id))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, maxItems)
    .map(block => ({ block, projectTitle: projectTitle(block.projectId) }));

  const danglingReferences: LooseEnd[] = [];
  for (const block of scope) {
    if (!block.plainText.includes('[[')) continue;
    const { unresolved, ambiguous } = resolveWikiLinkTargets(block, live);
    if (unresolved.length === 0 && ambiguous.length === 0) continue;
    danglingReferences.push({
      block,
      projectTitle: projectTitle(block.projectId),
      unresolved,
      ambiguous
    });
    if (danglingReferences.length >= maxItems) break;
  }

  return { orphans, danglingReferences };
}
