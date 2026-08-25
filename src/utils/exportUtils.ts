import type { Block, Project } from '../types';
import { buildBlockPrintDocument, normalizeBlockPrintSettings, type BlockPrintSettings } from './printDocument';

export type ExportFormat = 'pdf' | 'markdown' | 'html' | 'text';

export interface ExportBlockOptions {
  project: Project;
  rootBlock: Block;
  blocks: Block[];
  includeChildren?: boolean;
  settings?: Partial<BlockPrintSettings>;
}

export function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  return unescapeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return '';

  let text = html.replace(/\r\n?/g, '\n');

  // Handle preformatted code blocks
  text = text.replace(/<pre><code(?:\s+class="language-([a-z0-9_-]+)")?>([\s\S]*?)<\/code><\/pre>/gi, (_match, lang, code) => {
    const unescapedCode = unescapeHtml(code);
    return `\n\`\`\`${lang || ''}\n${unescapedCode}\n\`\`\`\n`;
  });

  // Handle inline code
  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, (_match, code) => `\`${unescapeHtml(code)}\``);

  // Handle headings
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => {
    const depth = Number(level);
    const hashes = '#'.repeat(depth);
    return `\n\n${hashes} ${content.trim()}\n\n`;
  });

  // Handle blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, content) => {
    const lines = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n').split('\n');
    const quoted = lines.map((line: string) => `> ${line.trim()}`).filter((l: string) => l.length > 2).join('\n');
    return `\n\n${quoted}\n\n`;
  });

  // Handle horizontal rules
  text = text.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // Handle bold, italics, strikethrough, underline
  text = text.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  text = text.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');
  text = text.replace(/<(?:s|strike|del)[^>]*>([\s\S]*?)<\/(?:s|strike|del)>/gi, '~~$1~~');
  text = text.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1');

  // Handle links
  text = text.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Handle Task Lists
  text = text.replace(/<li\s+[^>]*data-type="taskItem"[^>]*data-checked="(true|false)"[^>]*>([\s\S]*?)<\/li>/gi, (_match, checked, content) => {
    const isChecked = checked === 'true';
    const cleanContent = content
      .replace(/<label>[\s\S]*?<\/label>/gi, '')
      .replace(/<div[^>]*>/gi, '')
      .replace(/<\/div>/gi, '')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '')
      .trim();
    return `\n- [${isChecked ? 'x' : ' '}] ${cleanContent}`;
  });

  // Handle regular list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content) => {
    const clean = content.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '').trim();
    return `\n- ${clean}`;
  });

  // Remove wrapping list containers
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  // Handle tables
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableContent) => {
    const rows: string[][] = [];
    const rowMatches = tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi);
      for (const cellMatch of cellMatches) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map(r => r.length));
    const normalizedRows = rows.map(r => {
      while (r.length < colCount) r.push('');
      return r;
    });
    const header = `| ${normalizedRows[0].join(' | ')} |`;
    const separator = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
    const body = normalizedRows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
    return `\n\n${header}\n${separator}${body ? `\n${body}` : ''}\n\n`;
  });

  // Handle paragraphs and breaks
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Unescape HTML entities
  text = unescapeHtml(text);

  // Normalize consecutive newlines and whitespace
  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const compareBlocks = (left: Block, right: Block) => (
  left.order - right.order
  || left.createdAt - right.createdAt
  || left.title.localeCompare(right.title, 'en')
  || left.id.localeCompare(right.id)
);

export function collectExportSubtree(root: Block, allBlocks: Block[]): Block[] {
  const projectBlocks = allBlocks.filter(b => b.projectId === root.projectId && !b.isTrash);
  const childrenByParent = new Map<string, Block[]>();
  for (const block of projectBlocks) {
    if (!block.parentId) continue;
    const siblings = childrenByParent.get(block.parentId) ?? [];
    siblings.push(block);
    childrenByParent.set(block.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(compareBlocks);

  const result: Block[] = [];
  const visited = new Set<string>();
  const visit = (block: Block) => {
    if (visited.has(block.id)) return;
    visited.add(block.id);
    result.push(block);
    for (const child of childrenByParent.get(block.id) ?? []) visit(child);
  };
  visit(root);
  return result;
}

export function exportBlockAsMarkdown({ project, rootBlock, blocks, includeChildren = true }: ExportBlockOptions): string {
  const exportBlocks = includeChildren ? collectExportSubtree(rootBlock, blocks) : [rootBlock];
  const depthMap = new Map<string, number>();

  const calculateDepth = (block: Block, depth: number) => {
    depthMap.set(block.id, depth);
  };

  const traverseDepth = (current: Block, depth: number) => {
    calculateDepth(current, depth);
    const children = exportBlocks.filter(b => b.parentId === current.id);
    for (const child of children) traverseDepth(child, depth + 1);
  };
  traverseDepth(rootBlock, 1);

  const sections: string[] = [];

  for (const block of exportBlocks) {
    const depth = Math.min(6, depthMap.get(block.id) ?? 1);
    const hashes = '#'.repeat(depth);
    const title = block.title || 'Untitled';
    const contentMd = htmlToMarkdown(block.content || '');

    let section = `${hashes} ${title}`;
    if (contentMd) {
      section += `\n\n${contentMd}`;
    }
    sections.push(section);
  }

  const header = `<!-- DeepScribe Export: ${project.title || 'Project'} / ${rootBlock.title || 'Block'} -->\n\n`;
  return header + sections.join('\n\n---\n\n');
}

export function exportBlockAsText({ project, rootBlock, blocks, includeChildren = true }: ExportBlockOptions): string {
  const exportBlocks = includeChildren ? collectExportSubtree(rootBlock, blocks) : [rootBlock];
  const sections: string[] = [];

  for (const block of exportBlocks) {
    const title = block.title || 'Untitled';
    const plainText = htmlToPlainText(block.content || '');
    let section = `${title}\n${'='.repeat(title.length)}`;
    if (plainText) {
      section += `\n\n${plainText}`;
    }
    sections.push(section);
  }

  const header = `=== DeepScribe Export: ${project.title || 'Project'} ===\n\n`;
  return header + sections.join('\n\n\n');
}

export function exportBlockAsHtml({ project, rootBlock, blocks, includeChildren = true, settings }: ExportBlockOptions): string {
  const effectiveBlocks = includeChildren ? blocks : [rootBlock];
  const document = buildBlockPrintDocument({
    project,
    rootBlockId: rootBlock.id,
    blocks: effectiveBlocks,
    settings: normalizeBlockPrintSettings(settings)
  });
  return document.html;
}
