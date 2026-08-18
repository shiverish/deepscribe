import type { Block, Project } from '../types';

export interface BlockPrintDraft {
  title: string;
  content: string;
}

export type PrintPageSize = 'A4' | 'A5';
export type PrintFont = 'serif' | 'sans';
export type PrintMargin = 'compact' | 'normal' | 'wide';
export type PrintFontSize = 10 | 11 | 12 | 13 | 14;
export type PrintHeaderStyle = 'full' | 'compact' | 'title' | 'none';
export type PrintHeaderAlignment = 'left' | 'center';

export interface BlockPrintSettings {
  pageSize: PrintPageSize;
  font: PrintFont;
  fontSize: PrintFontSize;
  margin: PrintMargin;
  pageBreakPerBlock: boolean;
  headerStyle: PrintHeaderStyle;
  headerAlignment: PrintHeaderAlignment;
  headerDivider: boolean;
}

export const DEFAULT_BLOCK_PRINT_SETTINGS: BlockPrintSettings = {
  pageSize: 'A4',
  font: 'serif',
  fontSize: 11,
  margin: 'normal',
  pageBreakPerBlock: true,
  headerStyle: 'full',
  headerAlignment: 'left',
  headerDivider: false
};

export const BLOCK_PRINT_PRESETS = {
  a4Document: DEFAULT_BLOCK_PRINT_SETTINGS,
  a5Book: { ...DEFAULT_BLOCK_PRINT_SETTINGS, pageSize: 'A5', margin: 'compact' },
  largeText: { ...DEFAULT_BLOCK_PRINT_SETTINGS, fontSize: 13, margin: 'compact' }
} as const satisfies Record<string, BlockPrintSettings>;

export function normalizeBlockPrintSettings(value: unknown): BlockPrintSettings {
  if (!value || typeof value !== 'object') return DEFAULT_BLOCK_PRINT_SETTINGS;
  const candidate = value as Partial<BlockPrintSettings>;
  return {
    pageSize: candidate.pageSize === 'A5' ? 'A5' : 'A4',
    font: candidate.font === 'sans' ? 'sans' : 'serif',
    fontSize: [10, 11, 12, 13, 14].includes(Number(candidate.fontSize))
      ? Number(candidate.fontSize) as PrintFontSize
      : DEFAULT_BLOCK_PRINT_SETTINGS.fontSize,
    margin: candidate.margin === 'compact' || candidate.margin === 'wide' ? candidate.margin : 'normal',
    pageBreakPerBlock: candidate.pageBreakPerBlock !== false,
    headerStyle: candidate.headerStyle === 'compact' || candidate.headerStyle === 'title' || candidate.headerStyle === 'none'
      ? candidate.headerStyle
      : 'full',
    headerAlignment: candidate.headerAlignment === 'center' ? 'center' : 'left',
    headerDivider: candidate.headerDivider === true
  };
}

export interface BlockPrintDocument {
  html: string;
  jobName: string;
  blockIds: string[];
}

interface BuildBlockPrintDocumentInput {
  project: Project;
  rootBlockId: string;
  blocks: Block[];
  draft?: BlockPrintDraft;
  settings?: BlockPrintSettings;
}

const MARGIN_MM: Record<PrintMargin, number> = { compact: 10, normal: 16, wide: 22 };
const FONT_STACKS: Record<PrintFont, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Segoe UI", Arial, sans-serif'
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const compareBlocks = (left: Block, right: Block) => (
  left.order - right.order
  || left.createdAt - right.createdAt
  || left.title.localeCompare(right.title, 'nl')
  || left.id.localeCompare(right.id)
);

function collectSubtree(root: Block, blocks: Block[]): Block[] {
  const childrenByParent = new Map<string, Block[]>();
  for (const block of blocks) {
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

function getBlockPath(block: Block, blocksById: Map<string, Block>): Block[] {
  const path: Block[] = [];
  const visited = new Set<string>();
  let current: Block | undefined = block;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? blocksById.get(current.parentId) : undefined;
  }
  return path;
}

function renderBlockSection(block: Block, project: Project, blocksById: Map<string, Block>, settings: BlockPrintSettings): string {
  const path = getBlockPath(block, blocksById)
    .map(segment => escapeHtml(segment.title || 'Naamloos blok'))
    .join('<span class="path-separator" aria-hidden="true">/</span>');

  const headerClass = `block-header ${settings.headerStyle} align-${settings.headerAlignment}${settings.headerDivider ? ' with-divider' : ''}`;
  const metadata = settings.headerStyle === 'full' || settings.headerStyle === 'compact'
    ? `<div class="project-name">${escapeHtml(project.title || 'Naamloos project')}</div>
      <nav class="block-path" aria-label="Blokpad">${path}</nav>`
    : '';
  const header = settings.headerStyle === 'none' ? '' : `
      <header class="${headerClass}">
        ${metadata}
        <h1>${escapeHtml(block.title || 'Naamloos blok')}</h1>
      </header>`;

  return `
    <section class="print-block" data-block-id="${escapeHtml(block.id)}">
      ${header}
      <div class="block-content">${block.content || '<p></p>'}</div>
    </section>`;
}

export function buildBlockPrintDocument({
  project,
  rootBlockId,
  blocks,
  draft,
  settings: requestedSettings
}: BuildBlockPrintDocumentInput): BlockPrintDocument {
  const settings = normalizeBlockPrintSettings(requestedSettings);
  const projectBlocks = blocks.filter(block => block.projectId === project.id && !block.isTrash);
  const originalRoot = projectBlocks.find(block => block.id === rootBlockId);
  if (!originalRoot) throw new Error('Het te printen blok is niet beschikbaar.');

  const root = draft
    ? { ...originalRoot, title: draft.title, content: draft.content }
    : originalRoot;
  const effectiveBlocks = projectBlocks.map(block => block.id === rootBlockId ? root : block);
  const blocksById = new Map(effectiveBlocks.map(block => [block.id, block]));
  const printableBlocks = collectSubtree(root, effectiveBlocks);
  const documentTitle = `${root.title || 'Naamloos blok'} - ${project.title || 'DeepScribe'}`;

  const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page { size: ${settings.pageSize} portrait; margin: ${MARGIN_MM[settings.margin]}mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #171717; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: ${settings.fontSize}pt; line-height: 1.55; }
    ${settings.pageBreakPerBlock ? '.print-block:not(:first-child) { break-before: page; page-break-before: always; }' : ''}
    .block-header.align-center { text-align: center; }
    .block-header.with-divider { margin-bottom: 5mm; padding-bottom: 4mm; border-bottom: .3mm solid #d4d4d4; }
    .project-name { color: #525252; font-size: 9pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .block-path { margin-top: 2mm; color: #737373; font-size: 9pt; overflow-wrap: anywhere; }
    .path-separator { display: inline-block; margin: 0 1.5mm; color: #a3a3a3; }
    .block-header h1 { margin: 6mm 0 5mm; font-size: 22pt; line-height: 1.2; overflow-wrap: anywhere; }
    .block-header.with-divider h1 { margin-bottom: 0; }
    .block-header.compact .project-name, .block-header.compact .block-path { display: inline; }
    .block-header.compact .project-name::after { content: " · "; color: #a3a3a3; }
    .block-header.compact .block-path { margin-top: 0; }
    .block-header.compact h1 { margin-top: 3mm; font-size: 17pt; }
    .block-header.title h1 { margin-top: 0; font-size: 20pt; }
    .block-content { font-family: ${FONT_STACKS[settings.font]}; overflow-wrap: anywhere; }
    .block-content h1 { margin: 7mm 0 3mm; font-size: 19pt; }
    .block-content h2 { margin: 6mm 0 2.5mm; font-size: 16pt; }
    .block-content h3 { margin: 5mm 0 2mm; font-size: 13pt; }
    .block-content p { margin: 0 0 3.5mm; }
    .block-content ul, .block-content ol { margin: 0 0 3.5mm; padding-left: 7mm; }
    .block-content li > p { margin: 0; }
    .block-content blockquote { margin: 4mm 0; padding: 1mm 0 1mm 5mm; border-left: 1.2mm solid #a3a3a3; color: #404040; }
    .block-content pre { margin: 4mm 0; padding: 4mm; border: .3mm solid #d4d4d4; border-radius: 2mm; background: #f5f5f5; white-space: pre-wrap; overflow-wrap: anywhere; }
    .block-content code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; }
    .block-content :not(pre) > code { padding: .3mm 1mm; border-radius: 1mm; background: #f5f5f5; }
    .block-content table { width: 100%; margin: 4mm 0; border-collapse: collapse; table-layout: fixed; }
    .block-content th, .block-content td { padding: 2mm; border: .3mm solid #a3a3a3; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    .block-content th { background: #f5f5f5; }
    .block-content img { display: block; max-width: 100%; height: auto; margin: 4mm auto; }
    .block-content a { color: #1d4ed8; text-decoration: underline; }
    .block-content ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    .block-content li[data-type="taskItem"] { display: flex; align-items: flex-start; gap: 2mm; }
    .block-content li[data-type="taskItem"] > label { flex: 0 0 auto; }
    .block-content li[data-type="taskItem"] > div { flex: 1 1 auto; min-width: 0; }
    .block-content input[type="checkbox"] { width: 4mm; height: 4mm; margin: .8mm 0 0; accent-color: #171717; }
    pre, blockquote, table, img { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>${printableBlocks.map(block => renderBlockSection(block, project, blocksById, settings)).join('')}
</body>
</html>`;

  return {
    html,
    jobName: `DeepScribe - ${root.title || 'Naamloos blok'}`,
    blockIds: printableBlocks.map(block => block.id)
  };
}
