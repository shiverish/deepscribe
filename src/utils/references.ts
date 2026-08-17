import type { Block } from '../types';

const WIKI_LINK_PATTERN = /\[\[([^\r\n]{1,120}?)\]\]/g;

export function extractWikiLinks(text: string): string[] {
  const links = new Set<string>();
  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1].trim();
    if (title) links.add(title);
  }
  return [...links];
}

export function resolveBlockReferences(activeBlock: Block, projectBlocks: Block[]) {
  const byTitle = new Map<string, Block>();
  for (const block of projectBlocks) byTitle.set(block.title.trim().toLocaleLowerCase(), block);

  const outgoing = extractWikiLinks(activeBlock.plainText)
    .map(title => byTitle.get(title.toLocaleLowerCase()))
    .filter((block): block is Block => Boolean(block && block.id !== activeBlock.id));
  const activeTitle = activeBlock.title.trim().toLocaleLowerCase();
  const backlinks = projectBlocks.filter(block => block.id !== activeBlock.id
    && extractWikiLinks(block.plainText).some(title => title.toLocaleLowerCase() === activeTitle));
  return { outgoing, backlinks };
}
