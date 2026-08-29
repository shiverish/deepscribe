import type { Block, BlockLink, BlockLinkType } from '../types';
import { splitBlockRelations } from '../../mcp/core/links.mjs';

export { extractWikiLinks } from '../../mcp/core/wikiLinks.mjs';

export interface BlockReference {
  block: Block;
  type: BlockLinkType;
  /** True when the other block lives in a different project. */
  crossProject: boolean;
}

export interface BlockReferences {
  outgoing: BlockReference[];
  backlinks: BlockReference[];
}

/**
 * Reads a block's relations from the stored graph.
 *
 * References used to be resolved by matching titles within one project, which
 * broke on rename and could not see across projects. They are now stored edges,
 * so both of those work — and the panel can say what kind of relation it is.
 */
export function resolveBlockReferences(activeBlock: Block, allBlocks: Block[], links: BlockLink[]): BlockReferences {
  const byId = new Map(allBlocks.map(block => [block.id, block]));
  const { outgoing, backlinks } = splitBlockRelations(activeBlock.id, links, byId);
  const decorate = (entry: { block: Block; type: BlockLinkType }): BlockReference => ({
    block: entry.block,
    type: entry.type,
    crossProject: entry.block.projectId !== activeBlock.projectId
  });
  return { outgoing: outgoing.map(decorate), backlinks: backlinks.map(decorate) };
}
