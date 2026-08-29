import type { Block, PathSegment, Project, SearchResultItem } from '../types';
import { rankChunksLocally, rankProjectsLocally } from './semanticSearch';

export interface SearchResultInput {
  /** Blocks the tag filter selected, or every active block when there is none. */
  blocks: Block[];
  projects: Project[];
  /** Every active block, used to walk a hit's ancestors for the breadcrumb. */
  navigationBlocks: Block[];
  /** Free-text part of the query; empty means browsing by tag only. */
  text: string;
  tags: string[];
  limit?: number;
}

/**
 * Builds the rows the search modal shows.
 *
 * Kept out of the component so the ordering and shape can be tested directly,
 * and so the modal scores through exactly the same ranking the MCP `search`
 * tool uses rather than a second implementation.
 */
export function buildSearchResults(input: SearchResultInput): SearchResultItem[] {
  const { blocks, projects, navigationBlocks, text, tags, limit = 20 } = input;
  const projectMap = new Map(projects.map(project => [project.id, project]));
  const blockMap = new Map(navigationBlocks.map(block => [block.id, block]));

  const buildPathSegments = (block: Block): PathSegment[] => {
    const project = projectMap.get(block.projectId);
    const segments: PathSegment[] = project
      ? [{ id: project.id, title: project.title, type: 'project' }]
      : [];

    const ancestors: Block[] = [];
    const seen = new Set<string>([block.id]);
    let parentId = block.parentId;
    while (parentId && !seen.has(parentId)) {
      const parent = blockMap.get(parentId);
      if (!parent) break;
      seen.add(parent.id);
      ancestors.unshift(parent);
      parentId = parent.parentId;
    }
    for (const ancestor of ancestors) {
      segments.push({ id: ancestor.id, title: ancestor.title, type: 'block' });
    }
    return segments;
  };

  const toBlockResult = (block: Block, snippet: string, score: number, heading?: string): SearchResultItem => ({
    kind: 'block',
    block,
    projectTitle: projectMap.get(block.projectId)?.title || 'Unknown Project',
    pathSegments: buildPathSegments(block),
    snippet,
    score,
    heading: heading || undefined
  });

  // Without search text there is nothing to rank, so browsing by tag keeps
  // listing the blocks the filter selected.
  if (!text) {
    return blocks.slice(0, limit).map(block => toBlockResult(block, block.plainText.slice(0, 100), 0));
  }

  const searchableProjects = projects.filter(project => !project.systemKind
    && !project.isTrash
    && tags.every(tag => (project.tags ?? []).includes(tag)));

  return [
    ...rankChunksLocally(blocks, text).map(hit => toBlockResult(hit.block, hit.snippet, hit.score, hit.heading)),
    ...rankProjectsLocally(searchableProjects, text).map((hit): SearchResultItem => ({
      kind: 'project',
      project: hit.project,
      snippet: hit.snippet,
      score: hit.score,
      heading: hit.heading || undefined
    }))
  ].sort((left, right) => right.score - left.score).slice(0, limit);
}
