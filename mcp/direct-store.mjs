import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { normalizeTag, sanitizeTags } from './core/tags.mjs';
import {
  detectCircularDependency,
  formatDependencyMarkdown,
  getBlockDependencyStatus,
  isBlockCompleted,
  sanitizeDependsOn
} from './core/dependencies.mjs';
import { rankBlocksLocally, rankChunksLocally, rankProjectsLocally } from './core/ranking.mjs';
import {
  CLAIMANT_AGENT_TARGETS,
  canTransitionTask,
  createTaskMetadata,
  getNextTaskNumber,
  isTaskClaimCandidate,
  normalizeLeaseSeconds,
  normalizeTaskCreator,
  parseTaskHumanId,
  redactTaskClaim,
  taskClaimWriteRefusal,
  taskProtectedFieldRefusal,
  TASK_AGENT_TARGETS,
  TASK_INBOX_PROJECT_ID,
  taskCreatorLabel,
  taskWithoutActiveClaim,
  validateTaskMetadata,
  validateTaskReady
} from './core/tasks.mjs';
import {
  containsMarkdownTask,
  contentStatsFromHtml as contentStats,
  escapeHtml,
  htmlToPlainText,
  inlineMarkdown,
  markdownToHtml,
  unescapeHtml
} from './core/markdown.mjs';
import { contentToHtml, looksLikeHtml, sanitizeHtml } from './core/html.mjs';

export { normalizeTag, sanitizeTags };
export { detectCircularDependency, formatDependencyMarkdown, getBlockDependencyStatus, isBlockCompleted, sanitizeDependsOn };
export { rankBlocksLocally, rankChunksLocally, rankProjectsLocally };
export { getNextTaskNumber, parseTaskHumanId };
export { contentStats, escapeHtml, htmlToPlainText, inlineMarkdown, markdownToHtml, unescapeHtml };
export { contentToHtml, looksLikeHtml, sanitizeHtml };

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export function resolveWorkspacePath(customPath) {
  if (customPath) return path.resolve(customPath);
  if (process.env.DEEPSCRIBE_WORKSPACE_DIR) return path.resolve(process.env.DEEPSCRIBE_WORKSPACE_DIR);

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const bootstrapCandidates = [
    path.join(appData, 'deepscribe', 'workspace-bootstrap.json'),
    path.join(appData, 'DeepScribe', 'workspace-bootstrap.json')
  ];

  for (const candidate of bootstrapCandidates) {
    try {
      const bootstrap = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (typeof bootstrap.workspacePath === 'string' && bootstrap.workspacePath) {
        return path.resolve(bootstrap.workspacePath);
      }
    } catch {
      // Try next candidate
    }
  }

  const documentsPath = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'Documents')
    : path.join(os.homedir(), 'Documents');
  return path.resolve(path.join(documentsPath, 'DeepScribe', 'Workspace'));
}

const CLAIM_RECEIPTS_KEY = 'task_claim_receipts';

function normalizeStoredTask(block) {
  if (!block) return block;
  const tags = sanitizeTags(block.tags || []);
  const legacyTag = ['agent-ready', 'agent-claimed', 'agent-blocked', 'agent-review', 'agent-done'].find(tag => tags.includes(tag));
  const headings = [...String(block.content || '').matchAll(/<h[1-6][^>]*>\s*([^<]+?)\s*<\/h[1-6]>/gi)].map(match => match[1].trim().toLocaleLowerCase('en-US'));
  const structuredTodo = tags.includes('todo') && (headings.includes('goal') || headings.includes('doel')) && headings.includes('context') && (headings.includes('acceptance criteria') || headings.includes('acceptatiecriteria'));
  if (block.kind !== 'task' && !legacyTag && !structuredTodo) return block;
  const sourceTask = block.task || { status: legacyTag === 'agent-ready' ? 'ready' : legacyTag === 'agent-claimed' ? 'in-progress' : legacyTag === 'agent-blocked' ? 'blocked' : legacyTag === 'agent-review' ? 'review' : legacyTag === 'agent-done' ? 'done' : 'inbox', agentTarget: legacyTag === 'agent-ready' ? 'any' : 'none' };
  const legacyStatus = sourceTask.status;
  const status = legacyStatus === 'draft' ? 'inbox' : legacyStatus === 'claimed' ? 'in-progress' : legacyStatus;
  const taskNumber = typeof sourceTask.taskNumber === 'number' && Number.isInteger(sourceTask.taskNumber) && sourceTask.taskNumber > 0 ? sourceTask.taskNumber : undefined;
  const creator = normalizeTaskCreator(sourceTask.creator);
  const task = { ...sourceTask, status, position: Number.isFinite(sourceTask.position) ? sourceTask.position : (block.order ?? block.createdAt ?? Date.now()), ...(taskNumber ? { taskNumber } : {}) };
  if (creator) task.creator = creator;
  else delete task.creator;
  return { ...block, kind: 'task', tags: tags.filter(tag => !tag.startsWith('agent-')), task };
}

function taskMetadataFromParams(params, current = createTaskMetadata()) {
  const status = typeof params.status === 'string' ? params.status : current.status;
  const task = {
    ...current,
    status,
    readyAt: status === 'ready' ? (current.status === 'ready' ? current.readyAt : Date.now()) : current.readyAt,
  };
  const errors = validateTaskMetadata(task);
  if (errors.length) throw new Error(errors.join(' '));
  return task;
}

export function formatWorkItemContent(goal, context, acceptanceCriteria, dependencyBlocks = []) {
  const sections = [
    `## Goal\n\n${goal}`,
    `## Context\n\n${context}`,
    `## Acceptance Criteria\n\n${acceptanceCriteria.map(criterion => `- ${criterion}`).join('\n')}`
  ];
  if (dependencyBlocks.length > 0) {
    sections.push(formatDependencyMarkdown(dependencyBlocks));
  }
  return sections.join('\n\n');
}

export function parseDailyPlanDate(dateParam) {
  if (dateParam && String(dateParam).trim()) {
    const trimmed = String(dateParam).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) {
        const formatter = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
        const humanDate = formatter.format(parsed);
        return { isoDate: trimmed, humanDate, title: `Dagplanning — ${humanDate}` };
      }
    }
    return {
      isoDate: trimmed.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
      humanDate: trimmed,
      title: trimmed.startsWith('Dagplanning') ? trimmed : `Dagplanning — ${trimmed}`
    };
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const isoDate = `${year}-${month}-${day}`;
  const formatter = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const humanDate = formatter.format(now);
  return { isoDate, humanDate, title: `Dagplanning — ${humanDate}` };
}

export function formatDailyPlanContent(focus, openTasks) {
  const sections = [];
  sections.push(`## Focus van de dag\n\n${focus?.trim() || 'Definieer het hoofddoel en de belangrijkste prioriteiten van vandaag.'}`);
  sections.push(`## Taken voor Developer (Solo Dev)\n\n- [ ] Architectuur, keuzes en richting bepalen\n- [ ] Review en afronding van agent-werk`);
  sections.push(`## Taken voor AI-Agent(s)\n\n- [ ] Actieve werkitems implementeren en testen\n- [ ] Voortgang en documentatie bijwerken`);

  if (openTasks && openTasks.length > 0) {
    const taskItems = openTasks.map(t => `- [ ] **${t.projectTitle}** (${t.blockTitle}): ${t.text}`).join('\n');
    sections.push(`## Openstaande projecttaken\n\n${taskItems}`);
  } else {
    sections.push(`## Openstaande projecttaken\n\n- [ ] Geen openstaande taken gevonden in andere projecten`);
  }

  sections.push(`## Dagrecap & Notities\n\n- `);
  return sections.join('\n\n');
}

export function todosFromBlock(block) {
  const taskRegex = /<li\s+[^>]*data-type="taskItem"[^>]*data-checked="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
  const matches = [...(block.content || '').matchAll(taskRegex)];
  return matches.map((match, index) => {
    const completed = match[1] === 'true';
    const text = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      blockId: block.id,
      blockTitle: block.title,
      taskIndex: index,
      text,
      completed
    };
  });
}

export function htmlToMarkdown(html) {
  if (!html || !String(html).trim()) return '';

  let text = String(html).replace(/\r\n?/g, '\n');

  text = text.replace(/<pre><code(?:\s+class="language-([a-z0-9_-]+)")?>([\s\S]*?)<\/code><\/pre>/gi, (_match, lang, code) => {
    return `\n\`\`\`${lang || ''}\n${unescapeHtml(code)}\n\`\`\`\n`;
  });

  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, (_match, code) => `\`${unescapeHtml(code)}\``);

  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => {
    const depth = Number(level);
    const hashes = '#'.repeat(depth);
    return `\n\n${hashes} ${content.trim()}\n\n`;
  });

  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, content) => {
    const lines = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n').split('\n');
    const quoted = lines.map(line => `> ${line.trim()}`).filter(l => l.length > 2).join('\n');
    return `\n\n${quoted}\n\n`;
  });

  text = text.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
  text = text.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  text = text.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');
  text = text.replace(/<(?:s|strike|del)[^>]*>([\s\S]*?)<\/(?:s|strike|del)>/gi, '~~$1~~');
  text = text.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1');
  text = text.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

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

  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content) => {
    const clean = content.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '').trim();
    return `\n- ${clean}`;
  });

  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableContent) => {
    const rows = [];
    const rowMatches = tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const cells = [];
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

  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = unescapeHtml(text);

  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compareBlocksForExport(left, right) {
  return (left.order ?? 0) - (right.order ?? 0)
    || (left.createdAt ?? 0) - (right.createdAt ?? 0)
    || String(left.title || '').localeCompare(String(right.title || ''), 'en')
    || String(left.id).localeCompare(String(right.id));
}

export function collectDirectExportSubtree(root, allBlocks) {
  const projectBlocks = allBlocks.filter(b => b.projectId === root.projectId && !b.isTrash);
  const childrenByParent = new Map();
  for (const block of projectBlocks) {
    if (!block.parentId) continue;
    const siblings = childrenByParent.get(block.parentId) ?? [];
    siblings.push(block);
    childrenByParent.set(block.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(compareBlocksForExport);

  const result = [];
  const visited = new Set();
  const visit = block => {
    if (visited.has(block.id)) return;
    visited.add(block.id);
    result.push(block);
    for (const child of childrenByParent.get(block.id) ?? []) visit(child);
  };
  visit(root);
  return result;
}

export function exportDirectBlockAsMarkdown({ project, rootBlock, blocks, includeChildren = true }) {
  const exportBlocks = includeChildren ? collectDirectExportSubtree(rootBlock, blocks) : [rootBlock];
  const depthMap = new Map();

  const traverseDepth = (current, depth) => {
    depthMap.set(current.id, depth);
    const children = exportBlocks.filter(b => b.parentId === current.id);
    for (const child of children) traverseDepth(child, depth + 1);
  };
  traverseDepth(rootBlock, 1);

  const sections = [];
  for (const block of exportBlocks) {
    const depth = Math.min(6, depthMap.get(block.id) ?? 1);
    const hashes = '#'.repeat(depth);
    const title = block.title || 'Untitled';
    const contentMd = htmlToMarkdown(block.content || '');

    let section = `${hashes} ${title}`;
    if (contentMd) section += `\n\n${contentMd}`;
    sections.push(section);
  }

  const header = `<!-- DeepScribe Export: ${project.title || 'Project'} / ${rootBlock.title || 'Block'} -->\n\n`;
  return header + sections.join('\n\n---\n\n');
}

export function exportDirectBlockAsText({ project, rootBlock, blocks, includeChildren = true }) {
  const exportBlocks = includeChildren ? collectDirectExportSubtree(rootBlock, blocks) : [rootBlock];
  const sections = [];

  for (const block of exportBlocks) {
    const title = block.title || 'Untitled';
    const plainText = htmlToPlainText(block.content || '');
    let section = `${title}\n${'='.repeat(title.length)}`;
    if (plainText) section += `\n\n${plainText}`;
    sections.push(section);
  }

  const header = `=== DeepScribe Export: ${project.title || 'Project'} ===\n\n`;
  return header + sections.join('\n\n\n');
}

export const DEFAULT_BLOCK_PRINT_SETTINGS = {
  pageSize: 'A4',
  font: 'serif',
  fontSize: 11,
  margin: 'normal',
  pageBreakPerBlock: true,
  pageNumbers: true,
  pageNumberPlacement: 'bottom',
  pageNumberAlignment: 'center',
  headerStyle: 'full',
  headerAlignment: 'left',
  headerDivider: false
};

export const BLOCK_PRINT_PRESETS = {
  a4Document: DEFAULT_BLOCK_PRINT_SETTINGS,
  a5Book: { ...DEFAULT_BLOCK_PRINT_SETTINGS, pageSize: 'A5', margin: 'compact' },
  largeText: { ...DEFAULT_BLOCK_PRINT_SETTINGS, fontSize: 13, margin: 'compact' }
};

export function normalizeDirectBlockPrintSettings(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BLOCK_PRINT_SETTINGS };
  return {
    pageSize: value.pageSize === 'A5' ? 'A5' : 'A4',
    font: value.font === 'sans' ? 'sans' : 'serif',
    fontSize: [10, 11, 12, 13, 14].includes(Number(value.fontSize)) ? Number(value.fontSize) : DEFAULT_BLOCK_PRINT_SETTINGS.fontSize,
    margin: value.margin === 'compact' || value.margin === 'wide' ? value.margin : 'normal',
    pageBreakPerBlock: value.pageBreakPerBlock !== false,
    pageNumbers: value.pageNumbers !== false,
    pageNumberPlacement: value.pageNumberPlacement === 'top' ? 'top' : 'bottom',
    pageNumberAlignment: value.pageNumberAlignment === 'left' || value.pageNumberAlignment === 'right' ? value.pageNumberAlignment : 'center',
    headerStyle: ['compact', 'title', 'none'].includes(value.headerStyle) ? value.headerStyle : 'full',
    headerAlignment: value.headerAlignment === 'center' ? 'center' : 'left',
    headerDivider: value.headerDivider === true
  };
}

export function exportDirectBlockAsHtml({ project, rootBlock, blocks, includeChildren = true, settings: requestedSettings = {} }) {
  const settings = normalizeDirectBlockPrintSettings(requestedSettings);
  const exportBlocks = includeChildren ? collectDirectExportSubtree(rootBlock, blocks) : [rootBlock];
  const marginMm = settings.margin === 'compact' ? 10 : settings.margin === 'wide' ? 22 : 16;
  const fontStack = settings.font === 'sans' ? '"Segoe UI", Arial, sans-serif' : 'Georgia, "Times New Roman", serif';
  const documentTitle = `${rootBlock.title || 'Untitled block'} - ${project.title || 'DeepScribe'}`;

  const blocksById = new Map(blocks.map(b => [b.id, b]));
  const getBlockPath = block => {
    const path = [];
    const visited = new Set();
    let current = block;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parentId ? blocksById.get(current.parentId) : undefined;
    }
    return path;
  };

  const sectionsHtml = exportBlocks.map(block => {
    const pathHtml = getBlockPath(block)
      .map(s => escapeHtml(s.title || 'Untitled block'))
      .join('<span class="path-separator" aria-hidden="true">/</span>');
    const headerClass = `block-header ${settings.headerStyle} align-${settings.headerAlignment}${settings.headerDivider ? ' with-divider' : ''}`;
    const metadata = settings.headerStyle === 'full' || settings.headerStyle === 'compact'
      ? `<div class="project-name">${escapeHtml(project.title || 'Untitled project')}</div>
        <nav class="block-path" aria-label="Block path">${pathHtml}</nav>`
      : '';
    const header = settings.headerStyle === 'none' ? '' : `
      <header class="${headerClass}">
        ${metadata}
        <h1>${escapeHtml(block.title || 'Untitled block')}</h1>
      </header>`;
    return `
    <section class="print-block" data-block-id="${escapeHtml(block.id)}">
      ${header}
      <div class="block-content">${block.content || '<p></p>'}</div>
    </section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page {
      size: ${settings.pageSize} portrait;
      margin: ${marginMm}mm;
      ${settings.pageNumbers ? `@${settings.pageNumberPlacement}-${settings.pageNumberAlignment} {
        content: counter(page);
        color: #737373;
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 8pt;
      }` : ''}
    }
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
    .block-content { font-family: ${fontStack}; overflow-wrap: anywhere; }
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
<body>${sectionsHtml}
</body>
</html>`;
}

function findHeadlessBrowser() {
  const isWindows = process.platform === 'win32';
  const candidates = isWindows ? [
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'msedge',
    'chrome',
    'chromium'
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'google-chrome',
    'chromium'
  ];

  for (const candidate of candidates.filter(Boolean)) {
    try {
      if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return isWindows ? 'msedge' : 'google-chrome';
}

function renderHtmlToPdfHeadless(html, outputPath) {
  const browser = findHeadlessBrowser();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-export-pdf-'));
  const tempHtml = path.join(tempDir, 'document.html');
  fs.writeFileSync(tempHtml, html, 'utf8');

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const args = [
      '--headless',
      '--disable-gpu',
      '--run-all-compositor-stages-before-draw',
      '--no-pdf-header-footer',
      `--print-to-pdf=${path.resolve(outputPath)}`,
      tempHtml
    ];
    execFileSync(browser, args, { timeout: 15000, stdio: 'ignore' });
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      return { success: true, sizeBytes: stats.size };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { fs.unlinkSync(tempHtml); } catch {}
    try { fs.rmdirSync(tempDir); } catch {}
  }
  return { success: false, error: 'Failed to generate PDF file' };
}

export class DirectWorkspaceStore {
  constructor(options = {}) {
    this.workspacePath = resolveWorkspacePath(options.workspacePath);
    this.database = null;
  }

  open() {
    if (this.database) return;
    fs.mkdirSync(this.workspacePath, { recursive: true });
    fs.mkdirSync(path.join(this.workspacePath, 'attachments'), { recursive: true });

    const manifestPath = path.join(this.workspacePath, 'workspace.json');
    if (!fs.existsSync(manifestPath)) {
      const manifest = { workspaceId: `workspace-${crypto.randomUUID()}`, formatVersion: 1, encrypted: false };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    const sqlitePath = path.join(this.workspacePath, 'workspace.sqlite');
    this.database = new DatabaseSync(sqlitePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES blocks(id) DEFERRABLE INITIALLY DEFERRED,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS blocks_project_id ON blocks(project_id);
      CREATE INDEX IF NOT EXISTS blocks_parent_id ON blocks(parent_id);
      CREATE INDEX IF NOT EXISTS attachments_block_id ON attachments(block_id);
      CREATE INDEX IF NOT EXISTS revisions_block_id ON revisions(block_id);
    `);
  }

  close() {
    if (!this.database) return;
    try {
      this.database.exec('PRAGMA wal_checkpoint(PASSIVE);');
      this.database.close();
    } catch {
      // Best effort
    }
    this.database = null;
  }

  getAllProjects() {
    this.open();
    return this.database.prepare('SELECT json FROM projects').all().map(row => JSON.parse(row.json));
  }

  getProject(id) {
    this.open();
    const row = this.database.prepare('SELECT json FROM projects WHERE id = ?').get(id);
    return row ? JSON.parse(row.json) : null;
  }

  getAllBlocks() {
    this.open();
    return this.database.prepare('SELECT json FROM blocks').all().map(row => normalizeStoredTask(JSON.parse(row.json)));
  }

  getBlock(id) {
    this.open();
    const row = this.database.prepare('SELECT json FROM blocks WHERE id = ?').get(id);
    return row ? normalizeStoredTask(JSON.parse(row.json)) : null;
  }

  findTaskBlockByIdentifier(identifier) {
    const clean = String(identifier || '').trim();
    const direct = this.getBlock(clean);
    if (direct && !direct.isTrash && direct.kind === 'task') return direct;

    const parsedNum = parseTaskHumanId(clean);
    const allBlocks = this.getAllBlocks().filter(b => !b.isTrash && b.kind === 'task');
    if (parsedNum !== null) {
      const found = allBlocks.find(b => b.task?.taskNumber === parsedNum);
      if (found) return found;
    }
    if (/^\d+$/.test(clean)) {
      const num = parseInt(clean, 10);
      const found = allBlocks.find(b => b.task?.taskNumber === num);
      if (found) return found;
    }
    return allBlocks.find(b => b.id === clean) || null;
  }

  getAllAttachments() {
    this.open();
    return this.database.prepare('SELECT json FROM attachments').all().map(row => JSON.parse(row.json));
  }

  getAttachment(id) {
    this.open();
    const row = this.database.prepare('SELECT json FROM attachments WHERE id = ?').get(id);
    return row ? JSON.parse(row.json) : null;
  }

  getAllActivities() {
    this.open();
    return this.database.prepare('SELECT json FROM activities').all().map(row => JSON.parse(row.json));
  }

  getSetting(id) {
    this.open();
    const row = this.database.prepare('SELECT json FROM settings WHERE id = ?').get(id);
    return row ? JSON.parse(row.json) : null;
  }

  saveSetting(setting) {
    this.open();
    this.database.prepare('INSERT INTO settings (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(setting.key ?? setting.id, JSON.stringify(setting));
  }

  getPrintSettings() {
    const record = this.getSetting('print_settings');
    return normalizeDirectBlockPrintSettings(record?.value ?? record);
  }

  savePrintSettings(settings) {
    const normalized = normalizeDirectBlockPrintSettings(settings);
    this.saveSetting({ key: 'print_settings', value: normalized });
    return normalized;
  }

  saveProject(project) {
    this.open();
    this.database.prepare('INSERT INTO projects (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(project.id, JSON.stringify(project));
  }

  saveBlock(block) {
    this.open();
    this.database.prepare('INSERT INTO blocks (id, project_id, parent_id, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, parent_id = excluded.parent_id, json = excluded.json')
      .run(block.id, block.projectId, block.parentId ?? null, JSON.stringify(block));
  }

  saveRevision(revision) {
    this.open();
    this.database.prepare('INSERT INTO revisions (id, block_id, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET block_id = excluded.block_id, json = excluded.json')
      .run(revision.id, revision.blockId, JSON.stringify(revision));
  }

  getBlockRevisions(blockId) {
    this.open();
    const rows = this.database.prepare('SELECT json FROM revisions WHERE block_id = ?').all(blockId);
    return rows.map(r => JSON.parse(r.json)).sort((a, b) => b.createdAt - a.createdAt);
  }

  getBlockRevision(id) {
    this.open();
    const row = this.database.prepare('SELECT json FROM revisions WHERE id = ?').get(id);
    return row ? JSON.parse(row.json) : null;
  }

  recordBlockRevision(block, source = 'agent', summary, force = false) {
    const existing = this.getBlockRevisions(block.id);
    const latest = existing[0];
    const safeTask = block.task ? taskWithoutActiveClaim(block.task) : undefined;
    if (!force && latest && latest.title === block.title && latest.content === block.content && (latest.tags || []).join(',') === (block.tags || []).join(',') && latest.kind === block.kind && JSON.stringify(latest.task || null) === JSON.stringify(safeTask || null)) {
      return null;
    }
    const revision = {
      id: `rev-${crypto.randomUUID()}`,
      blockId: block.id,
      projectId: block.projectId,
      title: block.title,
      content: block.content,
      plainText: block.plainText,
      tags: sanitizeTags(block.tags || []),
      kind: block.kind,
      task: safeTask,
      source,
      summary,
      createdAt: Date.now()
    };
    this.saveRevision(revision);
    return revision;
  }

  restoreBlockRevision(revisionId) {
    const revision = this.getBlockRevision(revisionId);
    if (!revision) throw new Error('Revisie niet gevonden.');
    const currentBlock = this.getBlock(revision.blockId);
    if (!currentBlock || currentBlock.isTrash) throw new Error('Het bijbehorende blok is niet beschikbaar.');

    // Backup current state
    this.recordBlockRevision(currentBlock, 'restore', `Backup before restoring version from ${new Date(revision.createdAt).toLocaleString('en-US')}`, true);

    const taskMatches = [...revision.content.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*>/gi)];
    const completedMatches = [...revision.content.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*data-checked="true"[^>]*>/gi)];

    const updated = {
      ...currentBlock,
      title: revision.title,
      content: revision.content,
      plainText: revision.plainText,
      taskCount: taskMatches.length,
      completedTaskCount: completedMatches.length,
      tags: sanitizeTags(revision.tags || []),
      kind: revision.kind,
      task: revision.task ? taskWithoutActiveClaim(revision.task) : undefined,
      updatedAt: Date.now()
    };
    this.saveBlock(updated);
    this.recordActivity({
      projectId: currentBlock.projectId,
      blockId: currentBlock.id,
      source: 'agent',
      action: 'block-restored',
      summary: `Block “${revision.title}” restored to revision from ${new Date(revision.createdAt).toLocaleDateString('en-US')}`
    });
    return updated;
  }

  recordActivity({ projectId, blockId, source = 'agent', action, summary }) {
    this.open();
    const activity = {
      id: `act-${crypto.randomUUID()}`,
      projectId: projectId || null,
      blockId: blockId || null,
      source,
      action,
      summary,
      createdAt: Date.now()
    };
    this.database.prepare('INSERT INTO activities (id, json) VALUES (?, ?)').run(activity.id, JSON.stringify(activity));
  }

  async projectWithCounts(project) {
    const blocks = this.getAllBlocks().filter(b => b.projectId === project.id && !b.isTrash);
    return {
      ...project,
      blockCount: blocks.length,
      openTaskCount: blocks.reduce((count, b) => count + Math.max(0, (b.taskCount || 0) - (b.completedTaskCount || 0)), 0)
    };
  }

  attachmentMetadata(attachment) {
    return {
      id: attachment.id,
      blockId: attachment.blockId,
      fileName: attachment.fileName,
      fileType: attachment.fileType || 'application/octet-stream',
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
      uri: `deepscribe://attachment/${encodeURIComponent(attachment.id)}`
    };
  }

  blockSummary(block) {
    const safeBlock = redactTaskClaim(block);
    return {
      id: block.id,
      projectId: block.projectId,
      parentId: block.parentId,
      title: block.title,
      plainText: block.plainText,
      tags: block.tags || [],
      dependsOn: block.dependsOn || [],
      order: block.order ?? 0,
      childCount: block.childCount ?? 0,
      taskCount: block.taskCount ?? 0,
      completedTaskCount: block.completedTaskCount ?? 0,
      attachmentCount: block.attachmentCount ?? 0,
      updatedAt: block.updatedAt,
      kind: safeBlock.kind,
      task: safeBlock.task
    };
  }

  async readAttachmentBase64(attachment) {
    if (attachment.fileSize > MAX_ATTACHMENT_BYTES) throw new Error('Deze bijlage is groter dan 25 MB.');
    if (attachment.localPath) {
      const fullPath = path.isAbsolute(attachment.localPath)
        ? attachment.localPath
        : path.join(this.workspacePath, attachment.localPath);
      if (!fs.existsSync(fullPath)) throw new Error('Het bijlagebestand is niet meer beschikbaar op schijf.');
      const buffer = await fs.promises.readFile(fullPath);
      return buffer.toString('base64');
    }
    if (attachment.dataUrl) {
      const separator = attachment.dataUrl.indexOf(',');
      if (separator < 0 || !attachment.dataUrl.slice(0, separator).includes(';base64')) {
        throw new Error('De opgeslagen bijlage heeft een ongeldig formaat.');
      }
      return attachment.dataUrl.slice(separator + 1);
    }
    throw new Error('Het bijlagebestand is niet meer beschikbaar.');
  }

  async handleRequest(method, rawParams = {}) {
    const params = (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) ? rawParams : {};

    const requireString = (key) => {
      const value = params[key];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is verplicht.`);
      return value.trim();
    };

    const optionalStr = (key) => typeof params[key] === 'string' ? params[key] : undefined;
    const clampLimit = (val, fallback = 50) => Math.max(1, Math.min(100, typeof val === 'number' ? Math.floor(val) : fallback));

    switch (method) {
      case 'status': {
        const projects = this.getAllProjects().filter(p => !p.isTrash && !p.systemKind);
        const blocks = this.getAllBlocks().filter(b => !b.isTrash);
        return {
          app: 'DeepScribe',
          projects: projects.length,
          blocks: blocks.length,
          workspacePath: this.workspacePath,
          mode: 'direct-sqlite'
        };
      }

      case 'list_projects': {
        const projects = this.getAllProjects()
          .filter(p => !p.isTrash && !p.systemKind)
          .sort((a, b) => (b.order ?? b.createdAt) - (a.order ?? a.createdAt));
        return await Promise.all(projects.map(p => this.projectWithCounts(p)));
      }

      case 'get_project': {
        const project = this.getProject(requireString('projectId'));
        if (!project || project.isTrash || project.systemKind) throw new Error('Project niet gevonden.');
        return await this.projectWithCounts(project);
      }

      case 'get_project_context': {
        const project = this.getProject(requireString('projectId'));
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');

        const blocks = this.getAllBlocks().filter(b => b.projectId === project.id && !b.isTrash);
        const openTasks = [];

        for (const block of blocks) {
          const depStatus = getBlockDependencyStatus(block, blocks);
          const todos = todosFromBlock(block).filter(t => !t.completed);
          if (todos.length > 0) {
            for (const todo of todos) {
              openTasks.push({
                blockId: block.id,
                blockTitle: block.title,
                text: todo.text,
                isBlocked: depStatus.isBlocked
              });
            }
          } else if ((block.kind === 'task' && block.task?.status !== 'done') || (block.tags || []).includes('todo') || (block.tags || []).includes('agent-ready')) {
            openTasks.push({
              blockId: block.id,
              blockTitle: block.title,
              text: block.title,
              isBlocked: depStatus.isBlocked
            });
          }
        }

        const activities = this.getAllActivities()
          .filter(a => a.projectId === project.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 10);

        return {
          projectId: project.id,
          title: project.title,
          description: project.description || '',
          tags: project.tags || [],
          color: project.color,
          scratchpad: project.scratchpad || '',
          scratchpadUpdatedAt: project.scratchpadUpdatedAt,
          totalBlocks: blocks.length,
          openTaskCount: openTasks.length,
          openTasks,
          recentActivities: activities.map(a => ({
            id: a.id,
            action: a.action,
            summary: a.summary,
            createdAt: a.createdAt,
            source: a.source
          })),
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        };
      }

      case 'update_project_scratchpad': {
        const projectId = requireString('projectId');
        const content = requireString('content');
        const append = params.append === true;
        const project = this.getProject(projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');

        const now = Date.now();
        let newScratchpad = content;
        if (append && project.scratchpad && project.scratchpad.trim()) {
          newScratchpad = `${project.scratchpad.trim()}\n\n${content.trim()}`;
        }

        const updated = {
          ...project,
          scratchpad: newScratchpad,
          scratchpadUpdatedAt: now,
          updatedAt: now
        };
        this.saveProject(updated);

        this.recordActivity({
          projectId,
          source: 'agent',
          action: 'project-scratchpad-updated',
          summary: `Agent werkte project context / scratchpad bij voor “${project.title}”`
        });

        return {
          projectId: project.id,
          title: project.title,
          scratchpad: newScratchpad,
          scratchpadUpdatedAt: now
        };
      }

      case 'list_blocks': {
        const projectId = requireString('projectId');
        const recursive = params.recursive === true;
        const parentId = typeof params.parentId === 'string' ? params.parentId : null;
        const blocks = this.getAllBlocks()
          .filter(b => b.projectId === projectId && !b.isTrash && (recursive || b.parentId === parentId))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return blocks.slice(0, clampLimit(params.limit, 100)).map(b => this.blockSummary(b));
      }

      case 'get_block': {
        const block = this.getBlock(requireString('blockId'));
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
        const allBlocks = this.getAllBlocks().filter(b => b.projectId === block.projectId);
        const byId = new Map(allBlocks.map(b => [b.id, b]));
        const breadcrumbPath = [];
        let current = block;
        while (current) {
          breadcrumbPath.unshift({ id: current.id, title: current.title });
          current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        const attachments = this.getAllAttachments()
          .filter(a => a.blockId === block.id)
          .sort((a, b) => a.createdAt - b.createdAt);
        const dependencyStatus = getBlockDependencyStatus(block, allBlocks);
        return {
          ...redactTaskClaim(block),
          path: breadcrumbPath,
          attachments: attachments.map(a => this.attachmentMetadata(a)),
          todos: todosFromBlock(block),
          dependencyStatus
        };
      }

      case 'get_block_dependencies': {
        const block = this.getBlock(requireString('blockId'));
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
        const allBlocks = this.getAllBlocks().filter(b => b.projectId === block.projectId);
        const status = getBlockDependencyStatus(block, allBlocks);
        return {
          blockId: block.id,
          blockTitle: block.title,
          ...status
        };
      }

      case 'list_attachments': {
        const blockId = optionalStr('blockId');
        const projectId = optionalStr('projectId');
        if (blockId) {
          const block = this.getBlock(blockId);
          if (!block || block.isTrash || (projectId && block.projectId !== projectId)) throw new Error('Blok niet gevonden.');
        }
        const allBlocks = new Map(this.getAllBlocks().map(b => [b.id, b]));
        const allProjects = new Map(this.getAllProjects().map(p => [p.id, p]));
        const attachments = this.getAllAttachments()
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        const visible = [];
        for (const attachment of attachments) {
          if (blockId && attachment.blockId !== blockId) continue;
          const block = allBlocks.get(attachment.blockId);
          if (!block || block.isTrash || (projectId && block.projectId !== projectId)) continue;
          const project = allProjects.get(block.projectId);
          if (project && !project.isTrash) visible.push(attachment);
        }
        return visible.slice(0, clampLimit(params.limit, 100)).map(a => this.attachmentMetadata(a));
      }

      case 'read_attachment': {
        const attachmentId = requireString('attachmentId');
        const attachment = this.getAttachment(attachmentId);
        if (!attachment) throw new Error('Bijlage niet gevonden.');
        const block = this.getBlock(attachment.blockId);
        if (!block || block.isTrash) throw new Error('Het gekoppelde blok is niet beschikbaar.');
        const project = this.getProject(block.projectId);
        if (!project || project.isTrash) throw new Error('Het gekoppelde project is niet beschikbaar.');
        const base64 = await this.readAttachmentBase64(attachment);
        return { ...this.attachmentMetadata(attachment), dataBase64: base64 };
      }

      case 'search': {
        const query = optionalStr('query')?.trim().toLocaleLowerCase() || '';
        const projectId = optionalStr('projectId');
        const tags = sanitizeTags(Array.isArray(params.tags) ? params.tags.filter(t => typeof t === 'string') : []);
        const blocks = this.getAllBlocks().filter(b => !b.isTrash
          && (!projectId || b.projectId === projectId)
          && tags.every(tag => (b.tags || []).includes(tag)));
        if (!query) {
          return blocks.sort((l, r) => (r.updatedAt ?? 0) - (l.updatedAt ?? 0))
            .slice(0, clampLimit(params.limit))
            .map(b => this.blockSummary(b));
        }

        const projects = this.getAllProjects().filter(p => !p.isTrash && !p.systemKind
          && (!projectId || p.id === projectId)
          && tags.every(tag => (p.tags || []).includes(tag)));

        const results = [
          ...rankChunksLocally(blocks, query).map(hit => ({
            resultType: 'block',
            ...this.blockSummary(hit.block),
            score: hit.score,
            snippet: hit.snippet,
            matchReasons: hit.matchReasons,
            heading: hit.heading || undefined,
            chunkIndex: hit.chunkIndex >= 0 ? hit.chunkIndex : undefined
          })),
          ...rankProjectsLocally(projects, query).map(hit => ({
            resultType: 'project',
            id: hit.project.id,
            title: hit.project.title,
            tags: hit.project.tags || [],
            color: hit.project.color,
            updatedAt: hit.project.updatedAt,
            score: hit.score,
            snippet: hit.snippet,
            matchReasons: hit.matchReasons,
            heading: hit.heading || undefined
          }))
        ].sort((l, r) => r.score - l.score || (r.updatedAt ?? 0) - (l.updatedAt ?? 0));

        return results.slice(0, clampLimit(params.limit))
          .map(result => ({ ...result, score: Math.round(result.score * 10) / 10 }));
      }

      case 'create_project': {
        const now = Date.now();
        const projects = this.getAllProjects().filter(p => !p.isTrash && !p.systemKind);
        const scratchpad = optionalStr('scratchpad');
        const project = {
          id: `proj-${crypto.randomUUID()}`,
          title: requireString('title'),
          description: optionalStr('description')?.trim() || '',
          color: optionalStr('color') || '#3b82f6',
          order: projects.reduce((highest, p) => Math.max(highest, p.order ?? -1), -1) + 1,
          tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter(t => typeof t === 'string') : []),
          scratchpad: scratchpad ? scratchpad : undefined,
          scratchpadUpdatedAt: scratchpad ? now : undefined,
          isTrash: false,
          createdAt: now,
          updatedAt: now
        };
        this.saveProject(project);
        this.recordActivity({ projectId: project.id, source: 'agent', action: 'project-created', summary: `Agent created project “${project.title}”` });
        return project;
      }

      case 'create_block': {
        if (params.kind === 'task' || params.task) throw new Error('Agents cannot create tasks. Create the requested content directly in a regular block.');
        const projectId = requireString('projectId');
        const project = this.getProject(projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');
        if (project.systemKind === 'task-inbox' || project.id === TASK_INBOX_PROJECT_ID) throw new Error('The Workspace Inbox only accepts tasks created through create_task.');

        const parentId = typeof params.parentId === 'string' && params.parentId ? params.parentId : null;
        if (parentId) {
          const parent = this.getBlock(parentId);
          if (!parent || parent.projectId !== projectId || parent.isTrash) throw new Error('Bovenliggend blok niet gevonden.');
        }

        const rawContent = optionalStr('content') || '';
        if (containsMarkdownTask(rawContent)) throw new Error('Agents cannot create inline todos.');
        const stats = contentStats(contentToHtml(rawContent));
        const siblingCount = this.getAllBlocks().filter(b => b.projectId === projectId && b.parentId === parentId && !b.isTrash).length;
        const now = Date.now();
        const rawDependsOn = sanitizeDependsOn(params.dependsOn);

        const block = {
          id: `block-${crypto.randomUUID()}`,
          projectId,
          parentId,
          title: requireString('title'),
          ...stats,
          order: siblingCount,
          childCount: 0,
          attachmentCount: 0,
          tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter(t => typeof t === 'string') : []),
          dependsOn: rawDependsOn.length > 0 ? rawDependsOn : undefined,
          ...(params.kind === 'task' && params.task ? { kind: 'task', task: params.task } : {}),
          lastAgentEditAt: now,
          isTrash: false,
          createdAt: now,
          updatedAt: now
        };

        this.saveBlock(block);
        if (parentId) {
          const parent = this.getBlock(parentId);
          if (parent) {
            const childCount = this.getAllBlocks().filter(b => b.parentId === parentId && !b.isTrash).length;
            this.saveBlock({ ...parent, childCount, updatedAt: now });
          }
        }
        this.recordBlockRevision(block, 'agent', 'Initial creation by agent');
        this.recordActivity({
          projectId,
          blockId: block.id,
          source: 'agent',
          action: block.kind === 'task' ? 'task-created' : 'block-created',
          summary: `Agent created ${block.kind === 'task' ? 'task' : 'block'} “${block.title}”`
        });
        return block;
      }

      case 'create_task': {
        const agentId = requireString('agentId');
        const requestId = requireString('requestId');
        const agentTarget = requireString('agentTarget');
        if (!CLAIMANT_AGENT_TARGETS.includes(agentTarget)) throw new Error('agentTarget is invalid for a task creator.');
        const customAgentName = optionalStr('customAgentName')?.trim();
        if (agentTarget === 'custom' && !customAgentName) throw new Error('customAgentName is required for a custom task creator.');

        const rawAssigneeTarget = optionalStr('assigneeTarget') || optionalStr('assignee') || optionalStr('targetAgent');
        const assigneeTarget = rawAssigneeTarget && TASK_AGENT_TARGETS.includes(rawAssigneeTarget)
          ? rawAssigneeTarget
          : 'any';
        if (rawAssigneeTarget && !TASK_AGENT_TARGETS.includes(rawAssigneeTarget)) {
          throw new Error('assigneeTarget is invalid.');
        }
        const rawAssigneeCustomName = optionalStr('assigneeCustomAgentName') || optionalStr('targetCustomAgentName');
        const assigneeCustomName = assigneeTarget === 'custom'
          ? (rawAssigneeCustomName || customAgentName || '')
          : undefined;
        if (assigneeTarget === 'custom' && !assigneeCustomName?.trim()) {
          throw new Error('assigneeCustomAgentName is required when assigneeTarget is custom.');
        }

        const requestedProjectId = optionalStr('projectId');
        const parentId = typeof params?.parentId === 'string' && params.parentId ? params.parentId : null;
        const projectId = requestedProjectId || TASK_INBOX_PROJECT_ID;

        let targetProject = null;
        if (requestedProjectId && requestedProjectId !== TASK_INBOX_PROJECT_ID) {
          targetProject = this.getProject(requestedProjectId);
          if (!targetProject || targetProject.isTrash) throw new Error('Project niet gevonden.');
          if (parentId) {
            const parent = this.getBlock(parentId);
            if (!parent || parent.projectId !== requestedProjectId || parent.isTrash) throw new Error('Bovenliggend blok niet gevonden.');
          }
        } else if (parentId) {
          throw new Error('Workspace Inbox tasks cannot have a parent block.');
        }

        const replay = this.getAllBlocks().find(block => block.kind === 'task'
          && block.task?.creator?.type === 'agent'
          && block.task.creator.agentId === agentId
          && block.task.creator.requestId === requestId);
        if (replay) return { ...replay, projectId: replay.projectId === TASK_INBOX_PROJECT_ID ? null : replay.projectId };
        const rawContent = optionalStr('content') || '';
        if (containsMarkdownTask(rawContent)) throw new Error('Agents cannot create inline todos inside tasks.');
        const now = Date.now();
        if (projectId === TASK_INBOX_PROJECT_ID && !this.getProject(TASK_INBOX_PROJECT_ID)) {
          this.saveProject({ id: TASK_INBOX_PROJECT_ID, title: 'Workspace Inbox', description: 'Internal workspace container for unassigned tasks.', color: '#A78BFA', order: Number.MAX_SAFE_INTEGER, tags: [], systemKind: 'task-inbox', isTrash: false, createdAt: now, updatedAt: now });
        }
        const siblingTasks = this.getAllBlocks().filter(block => !block.isTrash && block.projectId === projectId && block.kind === 'task' && block.task?.status === 'inbox');
        const position = siblingTasks.reduce((highest, block) => Math.max(highest, block.task?.position ?? -1), -1) + 1;
        const order = this.getAllBlocks().filter(block => !block.isTrash && block.projectId === projectId && block.parentId === parentId).length;
        const taskNumber = getNextTaskNumber(this.getAllBlocks());
        const block = {
          id: `block-${crypto.randomUUID()}`,
          projectId,
          parentId,
          title: requireString('title'),
          ...contentStats(contentToHtml(rawContent)),
          order,
          childCount: 0,
          attachmentCount: 0,
          tags: [],
          kind: 'task',
          task: createTaskMetadata(position, { type: 'agent', agentTarget, agentId, requestId, ...(agentTarget === 'custom' ? { customAgentName } : {}) }, taskNumber, assigneeTarget, assigneeCustomName),
          lastAgentEditAt: now,
          isTrash: false,
          createdAt: now,
          updatedAt: now
        };
        this.saveBlock(block);
        if (parentId) {
          const parent = this.getBlock(parentId);
          if (parent) {
            const childCount = this.getAllBlocks().filter(b => b.parentId === parentId && !b.isTrash).length;
            this.saveBlock({ ...parent, childCount, updatedAt: now });
          }
        }
        this.recordBlockRevision(block, 'agent', 'Initial task creation by agent');
        const projectSummary = targetProject?.title ? `“${targetProject.title}”` : 'Workspace Inbox';
        this.recordActivity({ projectId, blockId: block.id, source: 'agent', action: 'task-created', summary: `${taskCreatorLabel(block.task) || 'Agent'} created task “${block.title}” in ${projectSummary}` });
        return { ...block, projectId: block.projectId === TASK_INBOX_PROJECT_ID ? null : block.projectId };
      }

      case 'move_block': {
        const blockId = requireString('blockId');
        const targetBlockId = requireString('targetBlockId');
        const position = requireString('position');
        if (!['above', 'below', 'inside'].includes(position)) throw new Error('position moet above, below of inside zijn.');
        if (blockId === targetBlockId) throw new Error('Een blok kan niet ten opzichte van zichzelf worden verplaatst.');

        const block = this.getBlock(blockId);
        const target = this.getBlock(targetBlockId);
        if (!block || block.isTrash) throw new Error('Te verplaatsen blok niet gevonden.');
        if (!target || target.isTrash) throw new Error('Doelblok niet gevonden.');
        if (block.kind === 'task' || target.kind === 'task') throw new Error('Agents cannot move tasks or move blocks into tasks.');
        if (block.projectId !== target.projectId) throw new Error('Blokken kunnen alleen binnen hetzelfde project worden verplaatst.');
        const project = this.getProject(block.projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');

        const allProjectBlocks = this.getAllBlocks().filter(candidate => candidate.projectId === block.projectId);
        const byId = new Map(allProjectBlocks.map(candidate => [candidate.id, candidate]));
        const visited = new Set();
        let ancestor = target;
        while (ancestor) {
          if (ancestor.id === blockId) throw new Error('Een blok kan niet naar zijn eigen onderliggende boom worden verplaatst.');
          if (visited.has(ancestor.id)) throw new Error('De bestaande doelstructuur bevat een cyclus en kan niet veilig worden gewijzigd.');
          visited.add(ancestor.id);
          ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
        }

        const oldParentId = block.parentId ?? null;
        const newParentId = position === 'inside' ? target.id : (target.parentId ?? null);
        const now = Date.now();
        const destinationSiblings = allProjectBlocks
          .filter(candidate => !candidate.isTrash && candidate.parentId === newParentId && candidate.id !== blockId)
          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
        const targetIndex = position === 'inside' ? destinationSiblings.length : destinationSiblings.findIndex(candidate => candidate.id === targetBlockId);
        if (targetIndex < 0) throw new Error('Doelpositie kon niet veilig worden bepaald.');
        const insertIndex = position === 'below' ? targetIndex + 1 : targetIndex;
        destinationSiblings.splice(insertIndex, 0, block);

        this.open();
        this.database.exec('BEGIN IMMEDIATE');
        try {
          for (const [order, sibling] of destinationSiblings.entries()) {
            this.saveBlock({
              ...sibling,
              parentId: newParentId,
              order,
              updatedAt: now,
              ...(sibling.id === blockId ? { lastAgentEditAt: now } : {})
            });
          }
          if (oldParentId !== newParentId) {
            const oldSiblings = allProjectBlocks
              .filter(candidate => !candidate.isTrash && candidate.parentId === oldParentId && candidate.id !== blockId)
              .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
            for (const [order, sibling] of oldSiblings.entries()) this.saveBlock({ ...sibling, order, updatedAt: now });
          }
          for (const parentId of new Set([oldParentId, newParentId])) {
            if (!parentId) continue;
            const parent = this.getBlock(parentId);
            if (!parent) throw new Error('Bovenliggend blok niet gevonden tijdens verplaatsing.');
            const childCount = this.getAllBlocks().filter(candidate => !candidate.isTrash && candidate.parentId === parentId).length;
            this.saveBlock({ ...parent, childCount, updatedAt: now });
          }
          this.database.exec('COMMIT');
        } catch (error) {
          this.database.exec('ROLLBACK');
          throw error;
        }

        this.recordActivity({
          projectId: block.projectId,
          blockId,
          source: 'agent',
          action: 'block-reordered',
          summary: `Agent moved block “${block.title}” ${position} “${target.title}”`
        });
        return await this.handleRequest('get_block', { blockId });
      }

      case 'create_work_item': {
        throw new Error('Agents cannot create tasks or work items.');
      }

      case 'create_task_block': {
        throw new Error('Agents cannot create tasks.');
      }

      case 'update_task_status': {
        const inputId = optionalStr('taskId') || requireString('blockId');
        const block = this.findTaskBlockByIdentifier(inputId) || this.getBlock(inputId);
        if (!block || block.isTrash || block.kind !== 'task' || !block.task) throw new Error('Taakblok niet gevonden.');
        const blockId = block.id;
        const task = taskMetadataFromParams(params, block.task);
        if (task.status === 'in-progress' && block.task.status !== 'in-progress') throw new Error('Use claim_work_item or claim_next_work_item to claim a task.');
        if (block.task.claim && task.status !== block.task.status) {
          throw new Error('Een actief geclaimde taak kan alleen via transition_work_item worden gewijzigd.');
        }
        if (!canTransitionTask(block.task.status, task.status)) throw new Error('Ongeldige taakstatusovergang.');
        if (task.status === 'ready') {
          const errors = validateTaskReady(block.title, block.content, task);
          if (errors.length) throw new Error(errors.join(' '));
        }
        this.recordBlockRevision(block, 'user', 'State before agent task edit');
        const now = Date.now();
        const updated = { ...block, task, updatedAt: now, lastAgentEditAt: now };
        this.saveBlock(updated);
        this.recordBlockRevision(updated, 'agent', 'Agent changed task metadata');
        const action = block.task.status !== task.status ? task.status === 'ready' ? 'task-readiness-changed' : task.status === 'done' ? 'task-completed' : 'task-status-changed' : 'task-metadata-updated';
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action, summary: `Agent changed task “${block.title}” → ${task.status}` });
        return updated;
      }

      case 'list_tasks': {
        const projectId = optionalStr('projectId');
        const status = optionalStr('status');
        const now = Date.now();
        return this.getAllBlocks().filter(block => !block.isTrash && block.kind === 'task' && block.task)
          .filter(block => !projectId || block.projectId === projectId)
          .filter(block => !status || block.task.status === status)
          .filter(block => params.claimable !== true || (block.task.status === 'ready' && block.task.agentTarget !== 'none') || (block.task.status === 'in-progress' && block.task.claim?.expiresAt <= now))
          .sort((left, right) => (left.task.position ?? left.order) - (right.task.position ?? right.order))
          .slice(0, clampLimit(params.limit, 100))
          .map(block => ({ ...redactTaskClaim(block), projectId: block.projectId === 'proj-system-task-inbox' ? null : block.projectId }));
      }

      case 'get_task': {
        const inputId = optionalStr('blockId') || requireString('taskId');
        const block = this.findTaskBlockByIdentifier(inputId) || this.getBlock(inputId);
        if (!block || block.isTrash || block.kind !== 'task' || !block.task) throw new Error('Task not found.');
        return { ...redactTaskClaim(block), projectId: block.projectId === 'proj-system-task-inbox' ? null : block.projectId };
      }

      case 'list_claimable_work_items': {
        const agentId = requireString('agentId');
        void agentId;
        const agentTarget = requireString('agentTarget');
        if (!CLAIMANT_AGENT_TARGETS.includes(agentTarget)) throw new Error('agentTarget is ongeldig voor een claimant.');
        const customAgentName = optionalStr('customAgentName')?.trim();
        if (agentTarget === 'custom' && !customAgentName) throw new Error('customAgentName is verplicht voor een custom claimant.');
        const projectId = optionalStr('projectId');
        const now = Date.now();
        const projects = new Set(this.getAllProjects().filter(project => !project.isTrash).map(project => project.id));
        const allBlocks = this.getAllBlocks().filter(block => !block.isTrash);
        return allBlocks
          .filter(block => projects.has(block.projectId) && (!projectId || block.projectId === projectId) && isTaskClaimCandidate(block, allBlocks, agentTarget, customAgentName, now))
          .sort((left, right) => (left.task?.readyAt ?? left.updatedAt) - (right.task?.readyAt ?? right.updatedAt) || left.id.localeCompare(right.id))
          .slice(0, clampLimit(params.limit, 50))
          .map(redactTaskClaim);
      }

      case 'claim_next_work_item': {
        this.open();
        const agentId = requireString('agentId');
        const requestId = requireString('requestId');
        const agentTarget = requireString('agentTarget');
        if (!CLAIMANT_AGENT_TARGETS.includes(agentTarget)) throw new Error('agentTarget is ongeldig voor een claimant.');
        const customAgentName = optionalStr('customAgentName')?.trim();
        if (agentTarget === 'custom' && !customAgentName) throw new Error('customAgentName is verplicht voor een custom claimant.');
        const leaseSeconds = normalizeLeaseSeconds(params.leaseSeconds);
        const projectId = optionalStr('projectId');
        const now = Date.now();
        this.database.exec('BEGIN IMMEDIATE');
        try {
          const receiptRecord = this.getSetting(CLAIM_RECEIPTS_KEY);
          const receipts = Array.isArray(receiptRecord?.value) ? receiptRecord.value : [];
          const replay = receipts.find(receipt => receipt.agentId === agentId && receipt.requestId === requestId);
          if (replay) {
            const replayBlock = this.getBlock(replay.blockId);
            this.database.exec('COMMIT');
            return replayBlock ? { block: redactTaskClaim(replayBlock), claimToken: replay.token, replayed: true } : null;
          }
          const projects = new Set(this.getAllProjects().filter(project => !project.isTrash).map(project => project.id));
          const allBlocks = this.getAllBlocks().filter(block => !block.isTrash);
          const candidate = allBlocks
            .filter(block => projects.has(block.projectId) && (!projectId || block.projectId === projectId) && isTaskClaimCandidate(block, allBlocks, agentTarget, customAgentName, now))
            .sort((left, right) => (left.task?.readyAt ?? left.updatedAt) - (right.task?.readyAt ?? right.updatedAt) || left.id.localeCompare(right.id))[0];
          if (!candidate?.task) {
            this.database.exec('COMMIT');
            return null;
          }
          const attempt = (candidate.task.claimAttempt ?? candidate.task.claim?.attempt ?? 0) + 1;
          const token = crypto.randomUUID();
          const claim = { ownerId: agentId, agentTarget, ...(customAgentName ? { customAgentName } : {}), token, requestId, claimedAt: now, heartbeatAt: now, expiresAt: now + leaseSeconds * 1000, attempt };
          const updated = { ...candidate, task: { ...candidate.task, status: 'in-progress', claimAttempt: attempt, claim }, updatedAt: now, lastAgentEditAt: now };
          this.saveBlock(updated);
          const nextReceipts = [...receipts.filter(receipt => receipt.createdAt >= now - 7 * 86400000), { agentId, requestId, blockId: updated.id, token, createdAt: now }].slice(-500);
          this.saveSetting({ key: CLAIM_RECEIPTS_KEY, value: nextReceipts });
          this.recordActivity({ projectId: updated.projectId, blockId: updated.id, action: candidate.task.status === 'in-progress' ? 'task-claim-taken-over' : 'task-claimed', summary: `${agentId} claimed task “${updated.title}”` });
          this.database.exec('COMMIT');
          return { block: redactTaskClaim(updated), claimToken: token, expiresAt: claim.expiresAt, replayed: false };
        } catch (error) {
          this.database.exec('ROLLBACK');
          throw error;
        }
      }

      case 'claim_work_item': {
        this.open();
        const rawBlockId = requireString('blockId');
        const candidateBlock = this.findTaskBlockByIdentifier(rawBlockId) || this.getBlock(rawBlockId);
        const blockId = candidateBlock?.id || rawBlockId;
        const agentId = requireString('agentId');
        const requestId = requireString('requestId');
        const agentTarget = requireString('agentTarget');
        if (!CLAIMANT_AGENT_TARGETS.includes(agentTarget)) throw new Error('agentTarget is invalid for a claimant.');
        const customAgentName = optionalStr('customAgentName')?.trim();
        if (agentTarget === 'custom' && !customAgentName) throw new Error('customAgentName is required for a custom claimant.');
        const leaseSeconds = normalizeLeaseSeconds(params.leaseSeconds);
        const now = Date.now();
        this.database.exec('BEGIN IMMEDIATE');
        try {
          const receiptRecord = this.getSetting(CLAIM_RECEIPTS_KEY);
          const receipts = Array.isArray(receiptRecord?.value) ? receiptRecord.value : [];
          const replay = receipts.find(receipt => receipt.agentId === agentId && receipt.requestId === requestId);
          if (replay) {
            if (replay.blockId !== blockId) throw new Error('requestId has already been used to claim a different task.');
            const replayBlock = this.getBlock(replay.blockId);
            this.database.exec('COMMIT');
            return replayBlock ? { block: redactTaskClaim(replayBlock), claimToken: replay.token, replayed: true } : null;
          }
          const candidate = candidateBlock || this.getBlock(blockId);
          const projects = new Set(this.getAllProjects().filter(project => !project.isTrash).map(project => project.id));
          const allBlocks = this.getAllBlocks().filter(block => !block.isTrash);
          if (!candidate || !projects.has(candidate.projectId) || !isTaskClaimCandidate(candidate, allBlocks, agentTarget, customAgentName, now)) {
            throw new Error('This task is not available for a claim by this agent.');
          }
          const attempt = (candidate.task.claimAttempt ?? candidate.task.claim?.attempt ?? 0) + 1;
          const token = crypto.randomUUID();
          const claim = { ownerId: agentId, agentTarget, ...(customAgentName ? { customAgentName } : {}), token, requestId, claimedAt: now, heartbeatAt: now, expiresAt: now + leaseSeconds * 1000, attempt };
          const updated = { ...candidate, task: { ...candidate.task, status: 'in-progress', claimAttempt: attempt, claim }, updatedAt: now, lastAgentEditAt: now };
          this.saveBlock(updated);
          const nextReceipts = [...receipts.filter(receipt => receipt.createdAt >= now - 7 * 86400000), { agentId, requestId, blockId: updated.id, token, createdAt: now }].slice(-500);
          this.saveSetting({ key: CLAIM_RECEIPTS_KEY, value: nextReceipts });
          this.recordActivity({ projectId: updated.projectId, blockId: updated.id, action: candidate.task.status === 'in-progress' ? 'task-claim-taken-over' : 'task-claimed', summary: `${agentId} claimed task “${updated.title}”` });
          this.database.exec('COMMIT');
          return { block: redactTaskClaim(updated), claimToken: token, expiresAt: claim.expiresAt, replayed: false };
        } catch (error) {
          this.database.exec('ROLLBACK');
          throw error;
        }
      }

      case 'renew_work_item_claim': {
        this.open();
        const rawBlockId = requireString('blockId');
        const resolvedBlock = this.findTaskBlockByIdentifier(rawBlockId) || this.getBlock(rawBlockId);
        const blockId = resolvedBlock?.id || rawBlockId;
        const agentId = requireString('agentId');
        const token = requireString('claimToken');
        const leaseSeconds = normalizeLeaseSeconds(params.leaseSeconds);
        const now = Date.now();
        this.database.exec('BEGIN IMMEDIATE');
        try {
          const block = resolvedBlock || this.getBlock(blockId);
          const claim = block?.task?.claim;
          if (!block || block.kind !== 'task' || block.task?.status !== 'in-progress' || !claim) throw new Error('Actieve taakclaim niet gevonden.');
          if (claim.ownerId !== agentId || claim.token !== token) throw new Error('Claimtoken of eigenaar is ongeldig.');
          if (claim.expiresAt <= now) throw new Error('De taakclaim is verlopen.');
          const renewed = { ...claim, heartbeatAt: now, expiresAt: now + leaseSeconds * 1000 };
          const updated = { ...block, task: { ...block.task, claim: renewed }, updatedAt: now, lastAgentEditAt: now };
          this.saveBlock(updated);
          this.recordActivity({ projectId: block.projectId, blockId, action: 'task-claim-renewed', summary: `${agentId} verlengde de claim op “${block.title}”` });
          this.database.exec('COMMIT');
          return { block: redactTaskClaim(updated), expiresAt: renewed.expiresAt };
        } catch (error) {
          this.database.exec('ROLLBACK');
          throw error;
        }
      }

      case 'transition_work_item': {
        this.open();
        const rawBlockId = requireString('blockId');
        const resolvedBlock = this.findTaskBlockByIdentifier(rawBlockId) || this.getBlock(rawBlockId);
        const blockId = resolvedBlock?.id || rawBlockId;
        const agentId = requireString('agentId');
        const token = requireString('claimToken');
        const status = requireString('status');
        if (!['ready', 'blocked', 'review', 'done'].includes(status)) throw new Error('Ongeldige claimtransitie.');
        const now = Date.now();
        this.database.exec('BEGIN IMMEDIATE');
        try {
          const block = resolvedBlock || this.getBlock(blockId);
          const claim = block?.task?.claim;
          if (!block || block.kind !== 'task' || block.task?.status !== 'in-progress' || !claim) throw new Error('Actieve taakclaim niet gevonden.');
          if (claim.ownerId !== agentId || claim.token !== token) throw new Error('Claimtoken of eigenaar is ongeldig.');
          if (claim.expiresAt <= now) throw new Error('De taakclaim is verlopen.');
          const task = { ...block.task, status, claim: undefined, ...(status === 'ready' ? { readyAt: now } : {}) };
          const updated = { ...block, task, updatedAt: now, lastAgentEditAt: now };
          this.saveBlock(updated);
          this.recordActivity({ projectId: block.projectId, blockId, action: `task-${status}`, summary: optionalStr('summary')?.trim() || `${agentId} changed “${block.title}” to ${status}` });
          this.database.exec('COMMIT');
          return redactTaskClaim(updated);
        } catch (error) {
          this.database.exec('ROLLBACK');
          throw error;
        }
      }

      case 'get_agent_inbox_snapshot': {
        const projectId = requireString('projectId');
        const project = this.getProject(projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');
        const tasks = this.getAllBlocks()
          .filter(block => !block.isTrash && block.projectId === projectId && block.kind === 'task' && block.task && ['ready', 'in-progress'].includes(block.task.status))
          .sort((left, right) => (left.task?.readyAt ?? left.updatedAt) - (right.task?.readyAt ?? right.updatedAt) || left.id.localeCompare(right.id))
          .map(redactTaskClaim);
        return { projectId, tasks };
      }

      case 'convert_block_to_task': {
        throw new Error('Agents cannot convert blocks to tasks.');
      }

      case 'update_project': {
        const projectId = requireString('projectId');
        const project = this.getProject(projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');
        const now = Date.now();
        const updated = { ...project, updatedAt: now };
        if (typeof params.title === 'string' && params.title.trim()) updated.title = params.title.trim();
        if (typeof params.description === 'string') updated.description = params.description;
        if (typeof params.color === 'string') updated.color = params.color;
        if (Array.isArray(params.tags)) updated.tags = sanitizeTags(params.tags.filter(t => typeof t === 'string'));
        if (typeof params.scratchpad === 'string') {
          updated.scratchpad = params.scratchpad;
          updated.scratchpadUpdatedAt = now;
        }
        this.saveProject(updated);
        this.recordActivity({ projectId, source: 'agent', action: 'project-updated', summary: `Agent changed project “${updated.title}”` });
        return updated;
      }

      case 'update_block': {
        const blockId = requireString('blockId');
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
        const updateRefusal = taskProtectedFieldRefusal(block, params) ?? taskClaimWriteRefusal(block, params);
        if (updateRefusal) throw new Error(updateRefusal);
        if (typeof params.content === 'string' && (block.taskCount > 0 || containsMarkdownTask(params.content))) throw new Error('Agents cannot create or edit inline todos.');
        this.recordBlockRevision(block, 'user', 'State before agent edit');
        const now = Date.now();
        const updated = { ...block, updatedAt: now, lastAgentEditAt: now };
        if (block.kind !== 'task' && typeof params.title === 'string' && params.title.trim()) updated.title = params.title.trim();
        if (typeof params.content === 'string') Object.assign(updated, contentStats(contentToHtml(params.content)));
        if (Array.isArray(params.tags)) updated.tags = sanitizeTags(params.tags.filter(t => typeof t === 'string'));
        if (Array.isArray(params.dependsOn)) {
          const sanitized = sanitizeDependsOn(params.dependsOn);
          const allBlocks = this.getAllBlocks().filter(b => !b.isTrash && b.projectId === block.projectId);
          for (const depId of sanitized) {
            if (detectCircularDependency(allBlocks, blockId, depId)) {
              throw new Error(`Circulaire afhankelijkheid gedetecteerd: blok kan niet afhangen van ${depId}.`);
            }
          }
          updated.dependsOn = sanitized;
        }
        this.saveBlock(updated);
        this.recordBlockRevision(updated, 'agent', `Agent changed “${updated.title}”`);
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'block-updated', summary: `Agent changed “${updated.title}”` });
        return redactTaskClaim(updated);
      }

      case 'append_to_block': {
        const blockId = requireString('blockId');
        const text = requireString('text');
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
        const appendRefusal = taskClaimWriteRefusal(block, params);
        if (appendRefusal) throw new Error(appendRefusal);
        if (containsMarkdownTask(text)) throw new Error('Agents cannot create inline todos.');
        this.recordBlockRevision(block, 'user', 'State before agent addition');
        const addition = contentToHtml(text);
        const newContent = `${block.content || '<p></p>'}${addition}`;
        const stats = contentStats(newContent);
        const now = Date.now();
        const updated = { ...block, ...stats, updatedAt: now, lastAgentEditAt: now };
        this.saveBlock(updated);
        this.recordBlockRevision(updated, 'agent', `Agent appended text`);
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'block-appended', summary: `Agent appended text to “${block.title}”` });
        return redactTaskClaim(updated);
      }

      case 'list_todos': {
        const projectId = optionalStr('projectId');
        const blockId = optionalStr('blockId');
        const blocks = blockId
          ? [this.getBlock(blockId)].filter(b => Boolean(b && !b.isTrash))
          : this.getAllBlocks().filter(b => !b.isTrash && (!projectId || b.projectId === projectId));
        return blocks.flatMap(todosFromBlock)
          .filter(todo => params.completed === undefined || todo.completed === params.completed)
          .slice(0, clampLimit(params.limit, 100));
      }

      case 'add_todo': {
        throw new Error('Agents cannot create or edit inline todos.');
      }

      case 'set_todo_status': {
        throw new Error('Agents cannot create or edit inline todos.');
      }

      case 'list_block_revisions': {
        const blockId = requireString('blockId');
        const limit = clampLimit(params.limit, 50);
        return this.getBlockRevisions(blockId).slice(0, limit);
      }

      case 'get_block_revision': {
        const revisionId = requireString('revisionId');
        const revision = this.getBlockRevision(revisionId);
        if (!revision) throw new Error('Revisie niet gevonden.');
        return revision;
      }

      case 'restore_block_revision': {
        const revisionId = requireString('revisionId');
        const revision = this.getBlockRevision(revisionId);
        const block = revision ? this.getBlock(revision.blockId) : null;
        if (block?.kind === 'task' || revision?.kind === 'task') throw new Error('Agents cannot restore task revisions.');
        return this.restoreBlockRevision(revisionId);
      }

      case 'get_or_create_daily_plan': {
        throw new Error('Agents cannot create task plans.');
      }

      case 'list_activities': {
        const projectId = optionalStr('projectId');
        const blockId = optionalStr('blockId');
        const source = optionalStr('source');
        const since = typeof params.since === 'number' && Number.isFinite(params.since) ? params.since : undefined;
        const limit = clampLimit(params.limit, 100);

        let items = this.getAllActivities().sort((a, b) => b.createdAt - a.createdAt);
        if (projectId) items = items.filter(a => a.projectId === projectId);
        if (blockId) items = items.filter(a => a.blockId === blockId);
        if (source) items = items.filter(a => a.source === source);
        if (since !== undefined) items = items.filter(a => a.createdAt >= since);

        return items.slice(0, limit);
      }

      case 'record_activity': {
        const action = requireString('action');
        const summary = requireString('summary');
        const projectId = optionalStr('projectId');
        const blockId = optionalStr('blockId');
        const source = (params.source === 'user' || params.source === 'system') ? params.source : 'agent';

        this.open();
        const activity = {
          id: `activity-${crypto.randomUUID()}`,
          projectId: projectId || undefined,
          blockId: blockId || undefined,
          source,
          action,
          summary,
          createdAt: Date.now()
        };
        this.database.prepare('INSERT INTO activities (id, json) VALUES (?, ?)').run(activity.id, JSON.stringify(activity));
        return activity;
      }

      case 'get_export_settings': {
        const settings = this.getPrintSettings();
        return {
          settings,
          presets: BLOCK_PRINT_PRESETS
        };
      }

      case 'update_export_settings': {
        const current = this.getPrintSettings();
        const presetKey = typeof params.preset === 'string' && params.preset in BLOCK_PRINT_PRESETS
          ? params.preset
          : undefined;
        const baseSettings = presetKey ? BLOCK_PRINT_PRESETS[presetKey] : current;

        const updated = normalizeDirectBlockPrintSettings({
          ...baseSettings,
          ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
          ...(params.font !== undefined ? { font: params.font } : {}),
          ...(params.fontSize !== undefined ? { fontSize: params.fontSize } : {}),
          ...(params.margin !== undefined ? { margin: params.margin } : {}),
          ...(params.pageBreakPerBlock !== undefined ? { pageBreakPerBlock: params.pageBreakPerBlock } : {}),
          ...(params.pageNumbers !== undefined ? { pageNumbers: params.pageNumbers } : {}),
          ...(params.pageNumberPlacement !== undefined ? { pageNumberPlacement: params.pageNumberPlacement } : {}),
          ...(params.pageNumberAlignment !== undefined ? { pageNumberAlignment: params.pageNumberAlignment } : {}),
          ...(params.headerStyle !== undefined ? { headerStyle: params.headerStyle } : {}),
          ...(params.headerAlignment !== undefined ? { headerAlignment: params.headerAlignment } : {}),
          ...(params.headerDivider !== undefined ? { headerDivider: params.headerDivider } : {})
        });

        const saved = this.savePrintSettings(updated);
        this.recordActivity({
          source: 'agent',
          action: 'settings-updated',
          summary: `Agent updated default export settings${presetKey ? ` (preset: ${presetKey})` : ''}`
        });

        return {
          status: 'updated',
          settings: saved,
          presets: BLOCK_PRINT_PRESETS
        };
      }

      case 'export_block': {
        const blockId = requireString('blockId');
        this.open();
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Block niet gevonden.');
        const project = this.getProject(block.projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');

        const rawFormat = typeof params.format === 'string' ? params.format.toLowerCase() : 'pdf';
        const format = ['pdf', 'markdown', 'html', 'text'].includes(rawFormat) ? rawFormat : 'pdf';
        const includeChildren = params.includeChildren !== false;
        const outputPath = typeof params.outputPath === 'string' && params.outputPath.trim() ? params.outputPath.trim() : undefined;

        const storedSettings = this.getPrintSettings();
        const exportSettings = normalizeDirectBlockPrintSettings({
          ...storedSettings,
          ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
          ...(params.font !== undefined ? { font: params.font } : {}),
          ...(params.fontSize !== undefined ? { fontSize: params.fontSize } : {}),
          ...(params.margin !== undefined ? { margin: params.margin } : {}),
          ...(params.pageBreakPerBlock !== undefined ? { pageBreakPerBlock: params.pageBreakPerBlock } : {}),
          ...(params.pageNumbers !== undefined ? { pageNumbers: params.pageNumbers } : {}),
          ...(params.pageNumberPlacement !== undefined ? { pageNumberPlacement: params.pageNumberPlacement } : {}),
          ...(params.pageNumberAlignment !== undefined ? { pageNumberAlignment: params.pageNumberAlignment } : {}),
          ...(params.headerStyle !== undefined ? { headerStyle: params.headerStyle } : {}),
          ...(params.headerAlignment !== undefined ? { headerAlignment: params.headerAlignment } : {}),
          ...(params.headerDivider !== undefined ? { headerDivider: params.headerDivider } : {})
        });

        const allBlocks = this.getAllBlocks().filter(b => b.projectId === project.id && !b.isTrash);

        if (format === 'pdf') {
          const html = exportDirectBlockAsHtml({
            project,
            rootBlock: block,
            blocks: allBlocks,
            includeChildren,
            settings: exportSettings
          });

          const defaultFileName = `${String(block.title || 'Block').replace(/[\\/:*?"<>|]/g, '-').trim() || 'DeepScribe'}.pdf`;
          const downloadsPath = path.join(os.homedir(), 'Downloads');
          const targetFilePath = outputPath ? path.resolve(outputPath) : path.join(downloadsPath, defaultFileName);

          const pdfResult = renderHtmlToPdfHeadless(html, targetFilePath);
          if (pdfResult.success) {
            this.recordActivity({
              projectId: project.id,
              blockId: block.id,
              source: 'agent',
              action: 'block-exported',
              summary: `Agent exported block “${block.title}” as PDF`
            });
            return {
              status: 'exported',
              format: 'pdf',
              filePath: targetFilePath,
              title: block.title,
              sizeBytes: pdfResult.sizeBytes
            };
          } else {
            // Fallback: save HTML
            const fallbackPath = targetFilePath.replace(/\.pdf$/i, '.html');
            fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
            fs.writeFileSync(fallbackPath, html, 'utf8');
            const stats = fs.statSync(fallbackPath);
            return {
              status: 'exported',
              format: 'html_fallback',
              filePath: fallbackPath,
              title: block.title,
              content: html,
              sizeBytes: stats.size,
              message: `PDF rendering was not available (${pdfResult.error}). Rendered HTML saved.`
            };
          }
        }

        let content = '';
        if (format === 'markdown') {
          content = exportDirectBlockAsMarkdown({ project, rootBlock: block, blocks: allBlocks, includeChildren });
        } else if (format === 'text') {
          content = exportDirectBlockAsText({ project, rootBlock: block, blocks: allBlocks, includeChildren });
        } else if (format === 'html') {
          content = exportDirectBlockAsHtml({ project, rootBlock: block, blocks: allBlocks, includeChildren, settings: exportSettings });
        }

        let savedFilePath;
        let sizeBytes = Buffer.byteLength(content, 'utf8');

        if (outputPath) {
          savedFilePath = path.resolve(outputPath);
          fs.mkdirSync(path.dirname(savedFilePath), { recursive: true });
          fs.writeFileSync(savedFilePath, content, 'utf8');
          sizeBytes = fs.statSync(savedFilePath).size;
        }

        this.recordActivity({
          projectId: project.id,
          blockId: block.id,
          source: 'agent',
          action: 'block-exported',
          summary: `Agent exported block “${block.title}” as ${format.toUpperCase()}`
        });

        return {
          status: 'exported',
          format,
          title: block.title,
          ...(savedFilePath ? { filePath: savedFilePath } : {}),
          content,
          sizeBytes
        };
      }

      default:
        throw new Error(`Onbekende DeepScribe-methode: ${method}`);
    }
  }
}

let defaultStoreInstance = null;

export function getDirectStore(options) {
  if (!defaultStoreInstance || options) {
    defaultStoreInstance = new DirectWorkspaceStore(options);
  }
  return defaultStoreInstance;
}

export async function handleDirectStoreRequest(method, params, options) {
  const store = getDirectStore(options);
  return await store.handleRequest(method, params);
}
