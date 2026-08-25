import { db } from '../db/db';
import { recordActivity } from '../db/activity';
import { recordBlockRevision, getBlockRevisions, getBlockRevision, restoreBlockRevision } from '../db/revisions';
import { sanitizeDependsOn, detectCircularDependency, getBlockDependencyStatus, formatDependencyMarkdown } from '../utils/dependencyUtils';
import type { Attachment, Block, ClaimantAgentTarget, Project, ActivityEntry, ActivitySource, TaskMetadata, TaskStatus } from '../types';
import { sanitizeTags } from '../utils/tagUtils';
import { rankBlocksLocally } from '../utils/semanticSearch';
import { isDescendantOrSelf, moveBlockInTree } from '../utils/dragAndDrop';
import { canTransitionTask, createTaskClaim, createTaskInboxProject, createTaskMetadata, isTaskClaimCandidate, isTaskInboxProject, normalizeLeaseSeconds, redactTaskClaim, taskCreatorLabel, TASK_INBOX_PROJECT_ID, validateTaskMetadata, validateTaskReady } from '../utils/taskBlocks';
import { exportBlockAsHtml, exportBlockAsMarkdown, exportBlockAsText, type ExportFormat } from '../utils/exportUtils';

type JsonObject = Record<string, unknown>;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const CLAIM_RECEIPTS_KEY = 'task_claim_receipts';
type ClaimReceipt = { agentId: string; requestId: string; blockId: string; token: string; createdAt: number };

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function requiredString(params: JsonObject, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is verplicht.`);
  return value.trim();
}

function optionalString(params: JsonObject, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function clampLimit(value: unknown, fallback = 50): number {
  return Math.max(1, Math.min(100, typeof value === 'number' ? Math.floor(value) : fallback));
}

function containsMarkdownTask(value: string): boolean {
  return /^\s*[-*+]\s+\[[ xX]\]\s+/m.test(value);
}

function htmlDocument(content: string): Document | null {
  if (typeof DOMParser !== 'undefined') {
    try {
      return new DOMParser().parseFromString(content || '<p></p>', 'text/html');
    } catch {
      // Fall through to non-browser handling
    }
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]!);
}

function inlineMarkdown(value: string): string {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^\s)]+\))/g;
  let result = '';
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    result += escapeHtml(value.slice(cursor, index));
    if (token.startsWith('`')) result += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else if (token.startsWith('**') || token.startsWith('__')) result += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    else if (token.startsWith('~~')) result += `<s>${escapeHtml(token.slice(2, -2))}</s>`;
    else if (token.startsWith('*') || token.startsWith('_')) result += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link?.[2] || '';
      result += link && /^(https?:\/\/|mailto:)/i.test(href)
        ? `<a href="${escapeHtml(href)}">${escapeHtml(link[1])}</a>`
        : escapeHtml(token);
    }
    cursor = index + token.length;
  }
  return result + escapeHtml(value.slice(cursor));
}

export function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: { type: 'bullet' | 'ordered' | 'task'; start?: number; items: Array<{ text: string; checked?: boolean }> } | null = null;
  let pendingBlankLines = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${paragraph.map(line => inlineMarkdown(line.trim())).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    if (list.type === 'task') {
      output.push(`<ul data-type="taskList">${list.items.map(item => `<li data-type="taskItem" data-checked="${item.checked === true}"><label><input type="checkbox"${item.checked ? ' checked' : ''}><span></span></label><div><p>${inlineMarkdown(item.text)}</p></div></li>`).join('')}</ul>`);
    } else {
      const tag = list.type === 'ordered' ? 'ol' : 'ul';
      const start = tag === 'ol' && list.start && list.start !== 1 ? ` start="${list.start}"` : '';
      output.push(`<${tag}${start}>${list.items.map(item => `<li><p>${inlineMarkdown(item.text)}</p></li>`).join('')}</${tag}>`);
    }
    list = null;
  };
  const addListItem = (type: 'bullet' | 'ordered' | 'task', item: { text: string; checked?: boolean }, start?: number) => {
    flushParagraph();
    if (!list || list.type !== type) {
      flushList();
      list = { type, start, items: [] };
    }
    list.items.push(item);
  };
  const flushIntentionalBlankLines = () => {
    if (output.length > 0 && pendingBlankLines > 1) {
      output.push(...Array.from({ length: pendingBlankLines - 1 }, () => '<p></p>'));
    }
    pendingBlankLines = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      flushList();
      pendingBlankLines += 1;
      continue;
    }
    flushIntentionalBlankLines();
    if (/^```/.test(line.trim())) {
      flushParagraph();
      flushList();
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      while (index + 1 < lines.length && !/^```\s*$/.test(lines[index + 1])) code.push(lines[++index]);
      if (index + 1 < lines.length) index += 1;
      const className = language && /^[a-z0-9_-]+$/i.test(language) ? ` class="language-${language}"` : '';
      output.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      output.push('<hr>');
      continue;
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (task) {
      addListItem('task', { text: task[2], checked: task[1].toLowerCase() === 'x' });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      addListItem('bullet', { text: bullet[1] });
      continue;
    }
    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      addListItem('ordered', { text: ordered[2] }, Number(ordered[1]));
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return output.join('') || '<p></p>';
}

function plainTextFromDocument(document: Document): string {
  const parts: string[] = [];
  const blockElements = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR']);
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue || '');
      return;
    }
    node.childNodes.forEach(visit);
    if (node instanceof HTMLElement && blockElements.has(node.tagName)) parts.push(' ');
  };
  document.body.childNodes.forEach(visit);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function contentStats(content: string) {
  const document = htmlDocument(content);
  if (document) {
    const tasks = [...document.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')];
    return {
      content: document.body.innerHTML,
      plainText: plainTextFromDocument(document),
      taskCount: tasks.length,
      completedTaskCount: tasks.filter(task => task.dataset.checked === 'true' || task.querySelector('input')?.checked).length
    };
  }
  const taskMatches = [...content.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*>/gi)];
  const completedMatches = [...content.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*data-checked="true"[^>]*>/gi)];
  return {
    content: content || '<p></p>',
    plainText: content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    taskCount: taskMatches.length,
    completedTaskCount: completedMatches.length
  };
}

function attachmentMetadata(attachment: Attachment) {
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

function blockSummary(block: Block) {
  return {
    id: block.id,
    projectId: block.projectId,
    parentId: block.parentId,
    title: block.title,
    plainText: block.plainText,
    tags: block.tags,
    dependsOn: block.dependsOn || [],
    order: block.order,
    childCount: block.childCount,
    taskCount: block.taskCount,
    completedTaskCount: block.completedTaskCount,
    attachmentCount: block.attachmentCount,
    kind: block.kind,
    task: redactTaskClaim(block).task,
    updatedAt: block.updatedAt
  };
}

async function getActiveAttachment(attachmentId: string): Promise<Attachment> {
  const attachment = await db.attachments.get(attachmentId);
  if (!attachment) throw new Error('Bijlage niet gevonden.');
  const block = await db.blocks.get(attachment.blockId);
  if (!block || block.isTrash) throw new Error('Het gekoppelde blok is niet beschikbaar.');
  const project = await db.projects.get(block.projectId);
  if (!project || project.isTrash) throw new Error('Het gekoppelde project is niet beschikbaar.');
  return attachment;
}

async function readAttachmentBase64(attachment: Attachment): Promise<string> {
  if (attachment.fileSize > MAX_ATTACHMENT_BYTES) throw new Error('Deze bijlage is groter dan 25 MB.');
  if (attachment.localPath) {
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!electronAPI?.readAttachment) throw new Error('Bijlagen lezen is alleen beschikbaar in de desktop-app.');
    return await electronAPI.readAttachment(attachment.localPath);
  }
  if (attachment.dataUrl) {
    const separator = attachment.dataUrl.indexOf(',');
    if (separator < 0 || !attachment.dataUrl.slice(0, separator).includes(';base64')) throw new Error('De opgeslagen bijlage heeft een ongeldig formaat.');
    return attachment.dataUrl.slice(separator + 1);
  }
  throw new Error('Het bijlagebestand is niet meer beschikbaar.');
}

async function projectWithCounts(project: Project) {
  const blocks = await db.blocks.where('projectId').equals(project.id).filter(block => !block.isTrash).toArray();
  return {
    ...project,
    blockCount: blocks.length,
    openTaskCount: blocks.reduce((count, block) => count + Math.max(0, block.taskCount - block.completedTaskCount), 0)
  };
}

async function createProject(params: JsonObject) {
  const now = Date.now();
  const projects = await db.projects.filter(project => !project.isTrash && !project.systemKind).toArray();
  const scratchpad = optionalString(params, 'scratchpad');
  const project: Project = {
    id: `proj-${crypto.randomUUID()}`,
    title: requiredString(params, 'title'),
    description: optionalString(params, 'description')?.trim() || '',
    color: optionalString(params, 'color') || '#3b82f6',
    order: projects.reduce((highest, current) => Math.max(highest, current.order ?? -1), -1) + 1,
    tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []),
    scratchpad: scratchpad ? scratchpad : undefined,
    scratchpadUpdatedAt: scratchpad ? now : undefined,
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };
  await db.projects.add(project);
  await recordActivity({ projectId: project.id, source: 'agent', action: 'project-created', summary: `Agent created project “${project.title}”` });
  return project;
}

async function getProjectContext(params: JsonObject) {
  const projectId = requiredString(params, 'projectId');
  const project = await db.projects.get(projectId);
  if (!project || project.isTrash) throw new Error('Project niet gevonden.');
  if (isTaskInboxProject(project)) throw new Error('The Workspace Inbox only accepts tasks created through create_task.');

  const blocks = await db.blocks.where('projectId').equals(projectId).filter(b => !b.isTrash).toArray();
  const openTasks: Array<{ blockId: string; blockTitle: string; text: string; isBlocked?: boolean }> = [];

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

  const activities = await db.activities
    .where('projectId')
    .equals(projectId)
    .reverse()
    .limit(10)
    .toArray();

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

async function updateProjectScratchpad(params: JsonObject) {
  const projectId = requiredString(params, 'projectId');
  const content = requiredString(params, 'content');
  const append = params.append === true;
  const project = await db.projects.get(projectId);
  if (!project || project.isTrash) throw new Error('Project niet gevonden.');

  const now = Date.now();
  let newScratchpad = content;
  if (append && project.scratchpad && project.scratchpad.trim()) {
    newScratchpad = `${project.scratchpad.trim()}\n\n${content.trim()}`;
  }

  await db.projects.update(projectId, {
    scratchpad: newScratchpad,
    scratchpadUpdatedAt: now,
    updatedAt: now
  });

  await recordActivity({
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

async function createBlock(params: JsonObject) {
  if (params.kind === 'task' || params.task) throw new Error('Agents cannot create tasks. Create the requested content directly in a regular block.');
  const projectId = requiredString(params, 'projectId');
  const project = await db.projects.get(projectId);
  if (!project || project.isTrash) throw new Error('Project niet gevonden.');
  if (isTaskInboxProject(project)) throw new Error('The Workspace Inbox only accepts tasks created through create_task.');

  const parentId = typeof params.parentId === 'string' && params.parentId ? params.parentId : null;
  if (parentId) {
    const parent = await db.blocks.get(parentId);
    if (!parent || parent.projectId !== projectId || parent.isTrash) throw new Error('Bovenliggend blok niet gevonden.');
  }

  const rawContent = optionalString(params, 'content') || '';
  if (containsMarkdownTask(rawContent)) throw new Error('Agents cannot create inline todos.');
  const stats = contentStats(markdownToHtml(rawContent));
  const siblingCount = await db.blocks.filter(block => block.projectId === projectId && block.parentId === parentId && !block.isTrash).count();
  const now = Date.now();
  const dependsOn = sanitizeDependsOn(params.dependsOn);

  const block: Block = {
    id: `block-${crypto.randomUUID()}`,
    projectId,
    parentId,
    title: requiredString(params, 'title'),
    ...stats,
    order: siblingCount,
    childCount: 0,
    attachmentCount: 0,
    tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []),
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    ...(params.kind === 'task' && params.task ? { kind: 'task' as const, task: params.task as TaskMetadata } : {}),
    lastAgentEditAt: now,
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };

  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.add(block);
    if (parentId) await db.blocks.update(parentId, { childCount: await db.blocks.filter(item => item.parentId === parentId && !item.isTrash).count(), updatedAt: now });
  });
  await recordBlockRevision(block, 'agent', 'Initial creation by agent');
  await recordActivity({
    projectId,
    blockId: block.id,
    source: 'agent',
    action: block.kind === 'task' ? 'task-created' : 'block-created',
    summary: `Agent created ${block.kind === 'task' ? 'task' : 'block'} “${block.title}”`
  });
  return block;
}

function taskMetadataFromParams(params: JsonObject, current?: TaskMetadata): TaskMetadata {
  const base = current ?? createTaskMetadata();
  const status = typeof params.status === 'string' ? params.status as TaskStatus : base.status;
  const task: TaskMetadata = {
    ...base,
    status,
    readyAt: status === 'ready' ? (base.status === 'ready' ? base.readyAt : Date.now()) : base.readyAt,
  };
  const errors = validateTaskMetadata(task);
  if (errors.length) throw new Error(errors.join(' '));
  return task;
}

export async function createTaskBlock(params: JsonObject) {
  void params;
  throw new Error('Agents cannot create tasks.');
}

async function createAgentTask(params: JsonObject) {
  const { agentId, requestId, agentTarget, customAgentName } = claimantFromParams(params);
  if (!requestId) throw new Error('requestId is required.');
  const title = requiredString(params, 'title');
  const rawContent = optionalString(params, 'content') || '';
  if (containsMarkdownTask(rawContent)) throw new Error('Agents cannot create inline todos inside tasks.');
  const now = Date.now();
  const result = await db.transaction('rw', [db.projects, db.blocks], async () => {
    const replay = await db.blocks.filter(block => block.kind === 'task'
      && block.task?.creator?.type === 'agent'
      && block.task.creator.agentId === agentId
      && block.task.creator.requestId === requestId).first();
    if (replay) return { block: replay, created: false };
    if (!await db.projects.get(TASK_INBOX_PROJECT_ID)) await db.projects.add(createTaskInboxProject(now));
    const inboxTasks = await db.blocks.filter(block => !block.isTrash && block.projectId === TASK_INBOX_PROJECT_ID && block.kind === 'task' && block.task?.status === 'inbox').toArray();
    const position = inboxTasks.reduce((highest, block) => Math.max(highest, block.task?.position ?? -1), -1) + 1;
    const order = await db.blocks.filter(block => !block.isTrash && block.projectId === TASK_INBOX_PROJECT_ID && block.parentId === null).count();
    const block: Block = {
      id: `block-${crypto.randomUUID()}`,
      projectId: TASK_INBOX_PROJECT_ID,
      parentId: null,
      title,
      ...contentStats(markdownToHtml(rawContent)),
      order,
      childCount: 0,
      attachmentCount: 0,
      tags: [],
      kind: 'task',
      task: createTaskMetadata(position, {
        type: 'agent', agentTarget, agentId, requestId,
        ...(agentTarget === 'custom' ? { customAgentName } : {})
      }),
      lastAgentEditAt: now,
      isTrash: false,
      createdAt: now,
      updatedAt: now
    };
    await db.blocks.add(block);
    return { block, created: true };
  });
  if (result.created) {
    await recordBlockRevision(result.block, 'agent', 'Initial task creation by agent');
    await recordActivity({
      projectId: TASK_INBOX_PROJECT_ID,
      blockId: result.block.id,
      source: 'agent',
      action: 'task-created',
      summary: `${taskCreatorLabel(result.block.task) ?? 'Agent'} created task “${title}” in Workspace Inbox`
    });
  }
  return { ...result.block, projectId: null };
}

async function updateTaskBlock(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash || block.kind !== 'task' || !block.task) throw new Error('Taakblok niet gevonden.');
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
  await recordBlockRevision(block, 'user', 'State before agent task edit');
  const updated = { ...block, task, updatedAt: Date.now(), lastAgentEditAt: Date.now() };
  await db.blocks.put(updated);
  await recordBlockRevision(updated, 'agent', 'Agent changed task metadata');
  const action = block.task.status !== task.status ? task.status === 'ready' ? 'task-readiness-changed' : task.status === 'done' ? 'task-completed' : 'task-status-changed' : 'task-metadata-updated';
  await recordActivity({ projectId: block.projectId, blockId, source: 'agent', action, summary: `Agent changed task “${block.title}” → ${task.status}` });
  return updated;
}

function claimantFromParams(params: JsonObject) {
  const agentId = requiredString(params, 'agentId');
  const requestId = optionalString(params, 'requestId')?.trim();
  const rawTarget = requiredString(params, 'agentTarget');
  if (!['openai', 'claude', 'gemini', 'custom'].includes(rawTarget)) throw new Error('agentTarget is invalid for an agent.');
  const agentTarget = rawTarget as ClaimantAgentTarget;
  const customAgentName = optionalString(params, 'customAgentName')?.trim();
  if (agentTarget === 'custom' && !customAgentName) throw new Error('customAgentName is required for a custom agent.');
  return { agentId, requestId, agentTarget, customAgentName };
}

async function claimableWorkItems(params: JsonObject) {
  const { agentTarget, customAgentName } = claimantFromParams(params);
  const projectId = optionalString(params, 'projectId');
  const now = Date.now();
  const projects = new Set((await db.projects.filter(project => !project.isTrash).toArray()).map(project => project.id));
  const allBlocks = await db.blocks.filter(block => !block.isTrash).toArray();
  return allBlocks
    .filter(block => projects.has(block.projectId) && (!projectId || block.projectId === projectId) && isTaskClaimCandidate(block, allBlocks, agentTarget, customAgentName, now))
    .sort((left, right) => (left.task?.readyAt ?? left.updatedAt) - (right.task?.readyAt ?? right.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, clampLimit(params.limit, 50))
    .map(redactTaskClaim);
}

async function claimNextWorkItem(params: JsonObject) {
  const { agentId, requestId, agentTarget, customAgentName } = claimantFromParams(params);
  if (!requestId) throw new Error('requestId is verplicht.');
  const leaseSeconds = normalizeLeaseSeconds(params.leaseSeconds);
  const projectId = optionalString(params, 'projectId');
  const now = Date.now();
  return await db.transaction('rw', [db.projects, db.blocks, db.settings, db.activities], async () => {
    const receiptRecord = await db.settings.get(CLAIM_RECEIPTS_KEY);
    const receipts = Array.isArray(receiptRecord?.value) ? receiptRecord.value as ClaimReceipt[] : [];
    const replay = receipts.find(receipt => receipt.agentId === agentId && receipt.requestId === requestId);
    if (replay) {
      const replayBlock = await db.blocks.get(replay.blockId);
      return replayBlock ? { block: redactTaskClaim(replayBlock), claimToken: replay.token, replayed: true } : null;
    }
    const projects = new Set((await db.projects.filter(project => !project.isTrash).toArray()).map(project => project.id));
    const allBlocks = await db.blocks.filter(block => !block.isTrash).toArray();
    const candidate = allBlocks
      .filter(block => projects.has(block.projectId) && (!projectId || block.projectId === projectId) && isTaskClaimCandidate(block, allBlocks, agentTarget, customAgentName, now))
      .sort((left, right) => (left.task?.readyAt ?? left.updatedAt) - (right.task?.readyAt ?? right.updatedAt) || left.id.localeCompare(right.id))[0];
    if (!candidate || !candidate.task) return null;
    const attempt = (candidate.task.claimAttempt ?? candidate.task.claim?.attempt ?? 0) + 1;
    const token = crypto.randomUUID();
    const claim = createTaskClaim({ ownerId: agentId, agentTarget, customAgentName, requestId, token, now, leaseSeconds, attempt });
    const updated: Block = { ...candidate, task: { ...candidate.task, status: 'in-progress', claimAttempt: attempt, claim }, updatedAt: now, lastAgentEditAt: now };
    await db.blocks.put(updated);
    const nextReceipts = [...receipts.filter(receipt => receipt.createdAt >= now - 7 * 86400000), { agentId, requestId, blockId: updated.id, token, createdAt: now }].slice(-500);
    await db.settings.put({ key: CLAIM_RECEIPTS_KEY, value: nextReceipts });
    await db.activities.add({ id: `activity-${crypto.randomUUID()}`, projectId: updated.projectId, blockId: updated.id, source: 'agent', action: candidate.task.status === 'in-progress' ? 'task-claim-taken-over' : 'task-claimed', summary: `${agentId} claimed task “${updated.title}”`, createdAt: now });
    return { block: redactTaskClaim(updated), claimToken: token, expiresAt: claim.expiresAt, replayed: false };
  });
}

async function claimWorkItem(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const { agentId, requestId, agentTarget, customAgentName } = claimantFromParams(params);
  if (!requestId) throw new Error('requestId is required.');
  const leaseSeconds = normalizeLeaseSeconds(params.leaseSeconds);
  const now = Date.now();
  return await db.transaction('rw', [db.projects, db.blocks, db.settings, db.activities], async () => {
    const receiptRecord = await db.settings.get(CLAIM_RECEIPTS_KEY);
    const receipts = Array.isArray(receiptRecord?.value) ? receiptRecord.value as ClaimReceipt[] : [];
    const replay = receipts.find(receipt => receipt.agentId === agentId && receipt.requestId === requestId);
    if (replay) {
      if (replay.blockId !== blockId) throw new Error('requestId has already been used to claim a different task.');
      const replayBlock = await db.blocks.get(replay.blockId);
      return replayBlock ? { block: redactTaskClaim(replayBlock), claimToken: replay.token, replayed: true } : null;
    }
    const candidate = await db.blocks.get(blockId);
    const projects = new Set((await db.projects.filter(project => !project.isTrash).toArray()).map(project => project.id));
    const allBlocks = await db.blocks.filter(block => !block.isTrash).toArray();
    if (!candidate || !isTaskClaimCandidate(candidate, allBlocks, agentTarget, customAgentName, now) || !projects.has(candidate.projectId)) {
      throw new Error('This task is not available for a claim by this agent.');
    }
    const attempt = (candidate.task!.claimAttempt ?? candidate.task!.claim?.attempt ?? 0) + 1;
    const token = crypto.randomUUID();
    const claim = createTaskClaim({ ownerId: agentId, agentTarget, customAgentName, requestId, token, now, leaseSeconds, attempt });
    const updated: Block = { ...candidate, task: { ...candidate.task!, status: 'in-progress', claimAttempt: attempt, claim }, updatedAt: now, lastAgentEditAt: now };
    await db.blocks.put(updated);
    const nextReceipts = [...receipts.filter(receipt => receipt.createdAt >= now - 7 * 86400000), { agentId, requestId, blockId: updated.id, token, createdAt: now }].slice(-500);
    await db.settings.put({ key: CLAIM_RECEIPTS_KEY, value: nextReceipts });
    await db.activities.add({ id: `activity-${crypto.randomUUID()}`, projectId: updated.projectId, blockId: updated.id, source: 'agent', action: candidate.task!.status === 'in-progress' ? 'task-claim-taken-over' : 'task-claimed', summary: `${agentId} claimed task “${updated.title}”`, createdAt: now });
    return { block: redactTaskClaim(updated), claimToken: token, expiresAt: claim.expiresAt, replayed: false };
  });
}

async function renewWorkItemClaim(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const agentId = requiredString(params, 'agentId');
  const token = requiredString(params, 'claimToken');
  const leaseSeconds = normalizeLeaseSeconds(params.leaseSeconds);
  const now = Date.now();
  return await db.transaction('rw', [db.blocks, db.activities], async () => {
    const block = await db.blocks.get(blockId);
    const claim = block?.task?.claim;
    if (!block || block.kind !== 'task' || block.task?.status !== 'in-progress' || !claim) throw new Error('Actieve taakclaim niet gevonden.');
    if (claim.ownerId !== agentId || claim.token !== token) throw new Error('Claimtoken of eigenaar is ongeldig.');
    if (claim.expiresAt <= now) throw new Error('De taakclaim is verlopen.');
    const renewed = { ...claim, heartbeatAt: now, expiresAt: now + leaseSeconds * 1000 };
    const updated = { ...block, task: { ...block.task, claim: renewed }, updatedAt: now, lastAgentEditAt: now };
    await db.blocks.put(updated);
    await db.activities.add({ id: `activity-${crypto.randomUUID()}`, projectId: block.projectId, blockId, source: 'agent', action: 'task-claim-renewed', summary: `${agentId} verlengde de claim op “${block.title}”`, createdAt: now });
    return { block: redactTaskClaim(updated), expiresAt: renewed.expiresAt };
  });
}

async function transitionWorkItem(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const agentId = requiredString(params, 'agentId');
  const token = requiredString(params, 'claimToken');
  const status = requiredString(params, 'status') as TaskStatus;
  if (!['ready', 'blocked', 'review', 'done'].includes(status)) throw new Error('Ongeldige claimtransitie.');
  const now = Date.now();
  return await db.transaction('rw', [db.blocks, db.activities], async () => {
    const block = await db.blocks.get(blockId);
    const claim = block?.task?.claim;
    if (!block || block.kind !== 'task' || block.task?.status !== 'in-progress' || !claim) throw new Error('Actieve taakclaim niet gevonden.');
    if (claim.ownerId !== agentId || claim.token !== token) throw new Error('Claimtoken of eigenaar is ongeldig.');
    if (claim.expiresAt <= now) throw new Error('De taakclaim is verlopen.');
    const task: TaskMetadata = { ...block.task, status, claim: undefined, ...(status === 'ready' ? { readyAt: now } : {}) };
    const updated = { ...block, task, updatedAt: now, lastAgentEditAt: now };
    await db.blocks.put(updated);
    await db.activities.add({ id: `activity-${crypto.randomUUID()}`, projectId: block.projectId, blockId, source: 'agent', action: `task-${status}`, summary: optionalString(params, 'summary')?.trim() || `${agentId} changed “${block.title}” to ${status}`, createdAt: now });
    return redactTaskClaim(updated);
  });
}

export async function convertBlockToTask(params: JsonObject) {
  void params;
  throw new Error('Agents cannot convert blocks to tasks.');
}

async function moveBlock(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const targetBlockId = requiredString(params, 'targetBlockId');
  const position = requiredString(params, 'position');
  if (!['above', 'below', 'inside'].includes(position)) throw new Error('position moet above, below of inside zijn.');
  if (blockId === targetBlockId) throw new Error('Een blok kan niet ten opzichte van zichzelf worden verplaatst.');

  const [block, target] = await Promise.all([db.blocks.get(blockId), db.blocks.get(targetBlockId)]);
  if (!block || block.isTrash) throw new Error('Te verplaatsen blok niet gevonden.');
  if (!target || target.isTrash) throw new Error('Doelblok niet gevonden.');
  if (block.kind === 'task' || target.kind === 'task') throw new Error('Agents cannot move tasks or move blocks into tasks.');
  if (block.projectId !== target.projectId) throw new Error('Blokken kunnen alleen binnen hetzelfde project worden verplaatst.');
  const project = await db.projects.get(block.projectId);
  if (!project || project.isTrash) throw new Error('Project niet gevonden.');
  if (await isDescendantOrSelf(blockId, targetBlockId)) {
    throw new Error('Een blok kan niet naar zijn eigen onderliggende boom worden verplaatst.');
  }

  const moved = await moveBlockInTree(blockId, targetBlockId, position as 'above' | 'below' | 'inside');
  if (!moved) throw new Error('Het blok kon niet veilig worden verplaatst.');
  await db.blocks.update(blockId, { lastAgentEditAt: Date.now() });
  await recordActivity({
    projectId: block.projectId,
    blockId,
    source: 'agent',
    action: 'block-reordered',
    summary: `Agent moved block “${block.title}” ${position} “${target.title}”`
  });
  return await handleMcpBridgeRequest('get_block', { blockId });
}

export function formatWorkItemContent(
  goal: string,
  context: string,
  acceptanceCriteria: string[],
  dependencyBlocks: Block[] = []
): string {
  const sections: string[] = [
    `## Goal\n\n${goal}`,
    `## Context\n\n${context}`,
    `## Acceptance Criteria\n\n${acceptanceCriteria.map(criterion => `- ${criterion}`).join('\n')}`
  ];
  if (dependencyBlocks.length > 0) {
    sections.push(formatDependencyMarkdown(dependencyBlocks, dependencyBlocks));
  }
  return sections.join('\n\n');
}

export async function createWorkItem(params: JsonObject) {
  const goal = requiredString(params, 'goal');
  const context = requiredString(params, 'context');
  const acceptanceCriteria = Array.isArray(params.acceptanceCriteria)
    ? params.acceptanceCriteria.filter((criterion): criterion is string => typeof criterion === 'string' && Boolean(criterion.trim())).map(criterion => criterion.trim())
    : [];
  if (goal.length < 10) throw new Error('goal moet minimaal 10 tekens bevatten.');
  if (context.length < 20) throw new Error('context moet minimaal 20 tekens bevatten.');
  if (acceptanceCriteria.length === 0) throw new Error('Minimaal één acceptanceCriterion is verplicht.');
  const suppliedTags = Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : [];

  const rawDependsOn = sanitizeDependsOn(params.dependsOn);
  let dependencyBlocks: Block[] = [];
  if (rawDependsOn.length > 0) {
    dependencyBlocks = await db.blocks.where('id').anyOf(rawDependsOn).filter(b => !b.isTrash).toArray();
  }

  return await createBlock({
    ...params,
    content: formatWorkItemContent(goal, context, acceptanceCriteria, dependencyBlocks),
    dependsOn: rawDependsOn,
    tags: ['todo', 'agent-ready', ...suppliedTags]
  });
}

async function updateBlock(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
  if (block.kind === 'task') throw new Error('Agents can only read task content. Use update_task_status for progress.');
  if (typeof params.content === 'string' && (block.taskCount > 0 || containsMarkdownTask(params.content))) throw new Error('Agents cannot create or edit inline todos.');

  await recordBlockRevision(block, 'user', 'State before agent edit');
  const now = Date.now();
  const update: Partial<Block> = { updatedAt: now, lastAgentEditAt: now };
  if (typeof params.title === 'string' && params.title.trim()) update.title = params.title.trim();
  if (typeof params.content === 'string') Object.assign(update, contentStats(markdownToHtml(params.content)));
  if (Array.isArray(params.tags)) update.tags = sanitizeTags(params.tags.filter((tag): tag is string => typeof tag === 'string'));
  if (Array.isArray(params.dependsOn)) {
    const sanitized = sanitizeDependsOn(params.dependsOn);
    const allBlocks = await db.blocks.filter(b => !b.isTrash && b.projectId === block.projectId).toArray();
    for (const depId of sanitized) {
      if (detectCircularDependency(allBlocks, blockId, depId)) {
        throw new Error(`Circulaire afhankelijkheid gedetecteerd: blok kan niet afhangen van ${depId}.`);
      }
    }
    update.dependsOn = sanitized;
  }
  await db.blocks.update(blockId, update);
  const updated = await db.blocks.get(blockId);
  if (updated) await recordBlockRevision(updated, 'agent', `Agent changed “${updated.title}”`);
  await recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'block-updated', summary: `Agent changed “${updated?.title ?? block.title}”` });
  return updated;
}

async function appendToBlock(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const text = requiredString(params, 'text');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
  if (block.kind === 'task') throw new Error('Agents can only read task content. Use update_task_status for progress.');
  if (containsMarkdownTask(text)) throw new Error('Agents cannot create inline todos.');

  await recordBlockRevision(block, 'user', 'State before agent addition');
  const document = htmlDocument(block.content);
  const addition = markdownToHtml(text);
  let newContent = '';
  if (document) {
    const additionDoc = htmlDocument(addition);
    if (additionDoc) {
      for (const node of [...additionDoc.body.childNodes]) document.body.appendChild(document.importNode(node, true));
      newContent = document.body.innerHTML;
    } else {
      newContent = `${block.content}${addition}`;
    }
  } else {
    newContent = `${block.content}${addition}`;
  }
  const stats = contentStats(newContent);
  const now = Date.now();
  await db.blocks.update(blockId, { ...stats, updatedAt: now, lastAgentEditAt: now });
  const updated = await db.blocks.get(blockId);
  if (updated) await recordBlockRevision(updated, 'agent', `Agent appended text`);
  await recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'block-appended', summary: `Agent appended text to “${block.title}”` });
  return updated;
}

function todosFromBlock(block: Block) {
  const document = htmlDocument(block.content);
  if (document) {
    return [...document.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')].map((task, index) => ({
      blockId: block.id,
      blockTitle: block.title,
      taskIndex: index,
      text: task.textContent?.replace(/\s+/g, ' ').trim() || '',
      completed: task.dataset.checked === 'true' || Boolean(task.querySelector('input')?.checked)
    }));
  }
  const taskRegex = /<li\s+[^>]*data-type="taskItem"[^>]*data-checked="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
  const matches = [...block.content.matchAll(taskRegex)];
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

export async function addTodo(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const text = requiredString(params, 'text');
  const completed = params.completed === true;
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

  const document = htmlDocument(block.content);
  let newContent = '';
  if (document) {
    let taskList = document.querySelector<HTMLUListElement>('ul[data-type="taskList"]');
    if (!taskList) {
      taskList = document.createElement('ul');
      taskList.dataset.type = 'taskList';
      document.body.appendChild(taskList);
    }
    const item = document.createElement('li');
    item.dataset.type = 'taskItem';
    item.dataset.checked = String(completed);
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = completed;
    label.append(input, document.createElement('span'));
    const wrapper = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    wrapper.appendChild(paragraph);
    item.append(label, wrapper);
    taskList.appendChild(item);
    newContent = document.body.innerHTML;
  } else {
    const itemHtml = `<li data-type="taskItem" data-checked="${completed}"><label><input type="checkbox"${completed ? ' checked' : ''}><span></span></label><div><p>${escapeHtml(text)}</p></div></li>`;
    if (block.content.includes('</ul>')) {
      newContent = block.content.replace(/<\/ul>$/, `${itemHtml}</ul>`);
    } else {
      newContent = `${block.content}<ul data-type="taskList">${itemHtml}</ul>`;
    }
  }

  await recordBlockRevision(block, 'user', 'State before adding todo');
  const stats = contentStats(newContent);
  const now = Date.now();
  await db.blocks.update(blockId, { ...stats, updatedAt: now, lastAgentEditAt: now });
  const updated = await db.blocks.get(blockId);
  if (updated) await recordBlockRevision(updated, 'agent', `Agent added todo “${text}”`);
  await recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'todo-added', summary: `Agent added todo “${text}” to “${block.title}”` });
  return todosFromBlock((await db.blocks.get(blockId))!);
}

export async function setTodoStatus(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const taskIndex = typeof params.taskIndex === 'number' ? Math.floor(params.taskIndex) : -1;
  if (taskIndex < 0) throw new Error('taskIndex moet nul of hoger zijn.');
  if (typeof params.completed !== 'boolean') throw new Error('completed is verplicht.');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

  await recordBlockRevision(block, 'user', 'State before todo status change');
  const document = htmlDocument(block.content);
  let newContent = '';
  if (document) {
    const item = [...document.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')][taskIndex];
    if (!item) throw new Error('Todo niet gevonden.');
    item.dataset.checked = String(params.completed);
    const input = item.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (input) input.checked = params.completed;
    newContent = document.body.innerHTML;
  } else {
    let currentIndex = 0;
    let replaced = false;
    newContent = block.content.replace(/(<li\s+[^>]*data-type="taskItem"[^>]*data-checked=")(true|false)("[^>]*>)/gi, (match, prefix, _state, suffix) => {
      if (currentIndex === taskIndex) {
        replaced = true;
        currentIndex += 1;
        return `${prefix}${params.completed}${suffix}`;
      }
      currentIndex += 1;
      return match;
    });
    if (!replaced) throw new Error('Todo niet gevonden.');
  }

  const stats = contentStats(newContent);
  const now = Date.now();
  await db.blocks.update(blockId, { ...stats, updatedAt: now, lastAgentEditAt: now });
  const updated = await db.blocks.get(blockId);
  if (updated) await recordBlockRevision(updated, 'agent', `Agent marked todo as ${params.completed ? 'done' : 'open'}`);
  await recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'todo-status', summary: `Agent marked a todo in “${block.title}” as ${params.completed ? 'done' : 'open'}` });
  return todosFromBlock((await db.blocks.get(blockId))!)[taskIndex];
}

function parseDailyPlanDate(dateParam?: string) {
  if (dateParam && dateParam.trim()) {
    const trimmed = dateParam.trim();
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

export function formatDailyPlanContent(
  focus?: string,
  openTasks?: Array<{ projectTitle: string; blockTitle: string; text: string }>
): string {
  const sections: string[] = [];

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

export async function getOrCreateDailyPlan(params: JsonObject) {
  const dateInfo = parseDailyPlanDate(optionalString(params, 'date'));
  const focus = optionalString(params, 'focus');
  const includeOpenTasks = params.includeOpenTasks !== false;

  const projects = await db.projects.filter(p => !p.isTrash).toArray();
  let project = projects.find(p => p.tags.includes('planning') || p.tags.includes('daily-log') || /dagplanning|daily planning/i.test(p.title));

  if (!project) {
    project = await createProject({
      title: 'Dagplanning & Focus',
      description: 'Centrale dagplanningen, dagelijkse doelstellingen en werkverdeling tussen ontwikkelaar en AI-agents.',
      color: '#10b981',
      tags: ['planning', 'daily-log', 'focus']
    });
  }

  const projectBlocks = await db.blocks.where('projectId').equals(project.id).filter(b => !b.isTrash).toArray();
  let block = projectBlocks.find(b =>
    b.tags.includes(`date-${dateInfo.isoDate}`) ||
    b.title.toLowerCase() === dateInfo.title.toLowerCase() ||
    b.title.toLowerCase().includes(dateInfo.isoDate) ||
    b.title.toLowerCase().includes(dateInfo.humanDate.toLowerCase())
  );

  if (!block) {
    const openTasks: Array<{ projectTitle: string; blockTitle: string; text: string }> = [];
    if (includeOpenTasks) {
      const activeProjects = await db.projects.filter(p => !p.isTrash && p.id !== project!.id).toArray();
      const projectMap = new Map(activeProjects.map(p => [p.id, p.title]));
      const allBlocks = await db.blocks.filter(b => !b.isTrash).toArray();

      for (const b of allBlocks) {
        const projectTitle = projectMap.get(b.projectId);
        if (!projectTitle) continue;
        const depStatus = getBlockDependencyStatus(b, allBlocks);
        const statusLabel = depStatus.isBlocked
          ? `[GEBLOKKEERD door: ${depStatus.pendingDependencies.map(d => d.title).join(', ')}]`
          : '[READY]';

        const todos = todosFromBlock(b).filter(t => !t.completed);
        if (todos.length > 0) {
          for (const todo of todos) {
            openTasks.push({ projectTitle, blockTitle: b.title, text: `${statusLabel} ${todo.text}` });
          }
        } else if ((b.kind === 'task' && b.task?.status !== 'done') || b.tags.includes('todo') || b.tags.includes('agent-ready')) {
          openTasks.push({ projectTitle, blockTitle: b.title, text: `${statusLabel} ${b.title}` });
        }
      }
    }

    const content = formatDailyPlanContent(focus, openTasks);
    block = await createBlock({
      projectId: project.id,
      title: dateInfo.title,
      content,
      tags: ['planning', 'daily-log', 'agent-ready', `date-${dateInfo.isoDate}`]
    });
  }

  const allBlocks = await db.blocks.where('projectId').equals(project.id).toArray();
  const byId = new Map(allBlocks.map(item => [item.id, item]));
  const path: Array<{ id: string; title: string }> = [];
  let current: Block | undefined = block;
  while (current) {
    path.unshift({ id: current.id, title: current.title });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  const attachments = await db.attachments.where('blockId').equals(block.id).sortBy('createdAt');
  return {
    ...redactTaskClaim(block),
    path,
    attachments: attachments.map(attachmentMetadata),
    todos: todosFromBlock(block)
  };
}

/**
 * Maakt een taak vanuit een schermvastlegging: direct oppakbaar, en optioneel in een project.
 *
 * Dit is bewust een eigen methode en geen verruiming van create_task. Daar geldt dat een agent
 * geen eigen werk mag aanmaken en dat elke taak in de Workspace Inbox belandt met doel 'none'.
 * Die regel blijft ongewijzigd. Een vastlegging is iets anders: er zit altijd een mens achter
 * die op dat moment de sneltoets indrukt, en die bedoelt het werk juist wél weg te zetten.
 */
async function createCapture(params: JsonObject) {
  const { agentId, requestId, agentTarget: claimantTarget, customAgentName } = claimantFromParams(params);
  if (!requestId) throw new Error('requestId is required.');

  const title = requiredString(params, 'title');
  const rawContent = optionalString(params, 'content') || '';
  if (containsMarkdownTask(rawContent)) throw new Error('Agents cannot create inline todos inside tasks.');

  // Zonder project belandt de vastlegging in de inbox; dat blijft de snelste route.
  const requestedProjectId = optionalString(params, 'projectId');
  const projectId = requestedProjectId || TASK_INBOX_PROJECT_ID;
  if (requestedProjectId && requestedProjectId !== TASK_INBOX_PROJECT_ID) {
    const project = await db.projects.get(requestedProjectId);
    if (!project || project.isTrash) throw new Error('Project niet gevonden.');
  }

  // Let op: 'agentTarget' is hierboven al de identiteit van de aanleverende partij.
  // Aan wie het werk toevalt is iets anders en heet daarom 'assignTo'.
  const assignTo = optionalString(params, 'assignTo') || 'any';
  const now = Date.now();

  const result = await db.transaction('rw', [db.projects, db.blocks], async () => {
    const replay = await db.blocks.filter(block => block.kind === 'task'
      && block.task?.creator?.type === 'agent'
      && block.task.creator.agentId === agentId
      && block.task.creator.requestId === requestId).first();
    if (replay) return { block: replay, created: false };

    if (projectId === TASK_INBOX_PROJECT_ID && !await db.projects.get(TASK_INBOX_PROJECT_ID)) {
      await db.projects.add(createTaskInboxProject(now));
    }

    const siblings = await db.blocks.filter(block => !block.isTrash && block.projectId === projectId && block.kind === 'task').toArray();
    const position = siblings.reduce((highest, block) => Math.max(highest, block.task?.position ?? -1), -1) + 1;
    const order = await db.blocks.filter(block => !block.isTrash && block.projectId === projectId && block.parentId === null).count();

    const task = createTaskMetadata(position, {
      type: 'agent', agentTarget: claimantTarget, agentId, requestId,
      ...(claimantTarget === 'custom' ? { customAgentName } : {})
    });
    task.status = 'ready';
    task.readyAt = now;
    task.agentTarget = assignTo as TaskMetadata['agentTarget'];

    const errors = validateTaskReady(title, rawContent, task);
    if (errors.length) throw new Error(errors.join(' '));

    const block: Block = {
      id: `block-${crypto.randomUUID()}`,
      projectId,
      parentId: null,
      title,
      ...contentStats(markdownToHtml(rawContent)),
      order,
      childCount: 0,
      attachmentCount: 0,
      tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []),
      kind: 'task',
      task,
      lastAgentEditAt: now,
      isTrash: false,
      createdAt: now,
      updatedAt: now
    };
    await db.blocks.add(block);
    return { block, created: true };
  });

  if (result.created) {
    await recordBlockRevision(result.block, 'agent', 'Screen capture created by SeeScribe');
    await recordActivity({
      projectId: result.block.projectId,
      blockId: result.block.id,
      source: 'agent',
      action: 'task-readiness-changed',
      summary: `Screen capture “${result.block.title}” is ready for any agent`
    });
  }

  return result.block;
}

/**
 * Slaat een binaire bijlage op bij een bestaand blok. Gebruikt door SeeScribe om
 * de geannoteerde schermafbeelding en de bijbehorende annotatiegegevens mee te sturen.
 */
async function createAttachment(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const fileName = requiredString(params, 'fileName');
  const base64 = requiredString(params, 'base64');
  const fileType = optionalString(params, 'fileType') || 'application/octet-stream';

  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
  const project = await db.projects.get(block.projectId);
  if (!project || project.isTrash) throw new Error('Project niet gevonden.');

  const fileSize = Math.round((base64.length * 3) / 4);
  if (fileSize > MAX_ATTACHMENT_BYTES) throw new Error('Deze bijlage is groter dan 25 MB.');

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!electronAPI?.importAttachment) {
    throw new Error('Bijlagen opslaan is alleen beschikbaar in de desktop-app.');
  }

  const stored = await electronAPI.importAttachment({
    projectId: block.projectId,
    blockId,
    fileName,
    base64
  });

  const attachment: Attachment = {
    id: `attachment-${crypto.randomUUID()}`,
    blockId,
    fileName,
    fileType,
    fileSize,
    localPath: stored.localPath,
    createdAt: Date.now()
  };

  await db.attachments.add(attachment);
  await db.blocks.update(blockId, { attachmentCount: (block.attachmentCount || 0) + 1 });

  return attachmentMetadata(attachment);
}

export async function handleMcpBridgeRequest(method: string, rawParams: unknown): Promise<unknown> {
  const params = asObject(rawParams);

  switch (method) {
    case 'status':
      return {
        app: 'DeepScribe',
        projects: await db.projects.filter(project => !project.isTrash && !project.systemKind).count(),
        blocks: await db.blocks.filter(block => !block.isTrash).count()
      };
    case 'list_projects': {
      const projects = await db.projects.filter(project => !project.isTrash && !project.systemKind).sortBy('updatedAt');
      return await Promise.all(projects.reverse().map(projectWithCounts));
    }
    case 'get_project': {
      const project = await db.projects.get(requiredString(params, 'projectId'));
      if (!project || project.isTrash || isTaskInboxProject(project)) throw new Error('Project niet gevonden.');
      return await projectWithCounts(project);
    }
    case 'get_project_context':
      return await getProjectContext(params);
    case 'update_project_scratchpad':
      return await updateProjectScratchpad(params);
    case 'list_blocks': {
      const projectId = requiredString(params, 'projectId');
      const recursive = params.recursive === true;
      const parentId = typeof params.parentId === 'string' ? params.parentId : null;
      const blocks = await db.blocks.where('projectId').equals(projectId).filter(block => !block.isTrash && (recursive || block.parentId === parentId)).sortBy('order');
      return blocks.slice(0, clampLimit(params.limit, 100)).map(blockSummary);
    }
    case 'get_block': {
      const blockId = requiredString(params, 'blockId');
      const block = await db.blocks.get(blockId);
      if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
      const allBlocks = await db.blocks.where('projectId').equals(block.projectId).toArray();
      const byId = new Map(allBlocks.map(item => [item.id, item]));
      const path: Array<{ id: string; title: string }> = [];
      let current: Block | undefined = block;
      while (current) {
        path.unshift({ id: current.id, title: current.title });
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      const attachments = await db.attachments.where('blockId').equals(block.id).sortBy('createdAt');
      const depStatus = getBlockDependencyStatus(block, allBlocks);
      return { 
        ...redactTaskClaim(block),
        path, 
        attachments: attachments.map(attachmentMetadata),
        todos: todosFromBlock(block),
        dependencyStatus: depStatus
      };
    }
    case 'get_block_dependencies': {
      const blockId = requiredString(params, 'blockId');
      const block = await db.blocks.get(blockId);
      if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
      const allBlocks = await db.blocks.filter(b => !b.isTrash && b.projectId === block.projectId).toArray();
      const status = getBlockDependencyStatus(block, allBlocks);
      return {
        blockId: block.id,
        blockTitle: block.title,
        ...status
      };
    }
    case 'list_attachments': {
      const blockId = optionalString(params, 'blockId');
      const projectId = optionalString(params, 'projectId');
      if (blockId) {
        const block = await db.blocks.get(blockId);
        if (!block || block.isTrash || (projectId && block.projectId !== projectId)) throw new Error('Blok niet gevonden.');
      }
      const attachments = blockId
        ? await db.attachments.where('blockId').equals(blockId).sortBy('createdAt')
        : await db.attachments.orderBy('createdAt').reverse().toArray();
      const visible: Attachment[] = [];
      for (const attachment of attachments) {
        const block = await db.blocks.get(attachment.blockId);
        if (!block || block.isTrash || (projectId && block.projectId !== projectId)) continue;
        const project = await db.projects.get(block.projectId);
        if (project && !project.isTrash) visible.push(attachment);
      }
      return visible.slice(0, clampLimit(params.limit, 100)).map(attachmentMetadata);
    }
    case 'create_capture':
      return await createCapture(params);
    case 'create_attachment':
      return await createAttachment(params);
    case 'read_attachment': {
      const attachment = await getActiveAttachment(requiredString(params, 'attachmentId'));
      return { ...attachmentMetadata(attachment), dataBase64: await readAttachmentBase64(attachment) };
    }
    case 'search': {
      const query = optionalString(params, 'query')?.trim().toLocaleLowerCase() || '';
      const projectId = optionalString(params, 'projectId');
      const tags = sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []);
      const blocks = await db.blocks.filter(block => !block.isTrash
        && (!projectId || block.projectId === projectId)
        && tags.every(tag => block.tags.includes(tag))).toArray();
      const ranked = query
        ? rankBlocksLocally(blocks, query).map(result => result.block)
        : blocks.sort((left, right) => right.updatedAt - left.updatedAt);
      return ranked.slice(0, clampLimit(params.limit)).map(blockSummary);
    }
    case 'create_project':
      return await createProject(params);
    case 'create_block':
      return await createBlock(params);
    case 'create_task':
      return await createAgentTask(params);
    case 'move_block':
      return await moveBlock(params);
    case 'create_work_item':
    case 'create_task_block':
    case 'convert_block_to_task':
    case 'add_todo':
    case 'set_todo_status':
    case 'get_or_create_daily_plan':
      throw new Error('Agents cannot create or edit tasks or inline todos.');
    case 'update_task_status':
      return await updateTaskBlock(params);
    case 'list_tasks': {
      const projectId = optionalString(params, 'projectId');
      const status = optionalString(params, 'status');
      const claimable = params.claimable === true;
      const now = Date.now();
      const allBlocks = await db.blocks.filter(block => !block.isTrash).toArray();
      return allBlocks
        .filter(block => block.kind === 'task' && block.task)
        .filter(block => !projectId || block.projectId === projectId)
        .filter(block => !status || block.task?.status === status)
        .filter(block => !claimable || (block.task?.status === 'ready' && block.task.agentTarget !== 'none') || (block.task?.status === 'in-progress' && Boolean(block.task.claim && block.task.claim.expiresAt <= now)))
        .sort((left, right) => (left.task?.position ?? left.order) - (right.task?.position ?? right.order))
        .slice(0, clampLimit(params.limit, 100))
        .map(block => ({ ...redactTaskClaim(block), projectId: block.projectId === 'proj-system-task-inbox' ? null : block.projectId }));
    }
    case 'get_task': {
      const block = await db.blocks.get(requiredString(params, 'taskId'));
      if (!block || block.isTrash || block.kind !== 'task' || !block.task) throw new Error('Task not found.');
      return { ...redactTaskClaim(block), projectId: block.projectId === 'proj-system-task-inbox' ? null : block.projectId };
    }
    case 'list_claimable_work_items':
      return await claimableWorkItems(params);
    case 'claim_next_work_item':
      return await claimNextWorkItem(params);
    case 'claim_work_item':
      return await claimWorkItem(params);
    case 'renew_work_item_claim':
      return await renewWorkItemClaim(params);
    case 'transition_work_item':
      return await transitionWorkItem(params);
    case 'get_agent_inbox_snapshot': {
      const projectId = requiredString(params, 'projectId');
      const project = await db.projects.get(projectId);
      if (!project || project.isTrash) throw new Error('Project niet gevonden.');
      const blocks = await db.blocks.where('projectId').equals(projectId).filter(block => !block.isTrash && block.kind === 'task').toArray();
      return {
        projectId,
        tasks: blocks
          .filter(block => block.task && ['ready', 'in-progress'].includes(block.task.status))
          .sort((left, right) => (left.task?.readyAt ?? left.updatedAt) - (right.task?.readyAt ?? right.updatedAt) || left.id.localeCompare(right.id))
          .map(redactTaskClaim)
      };
    }
    case 'update_project': {
      const projectId = requiredString(params, 'projectId');
      const project = await db.projects.get(projectId);
      if (!project || project.isTrash) throw new Error('Project niet gevonden.');
      const now = Date.now();
      const update: Partial<Project> = { updatedAt: now };
      if (typeof params.title === 'string' && params.title.trim()) update.title = params.title.trim();
      if (typeof params.description === 'string') update.description = params.description;
      if (typeof params.color === 'string') update.color = params.color;
      if (Array.isArray(params.tags)) update.tags = sanitizeTags(params.tags.filter((tag): tag is string => typeof tag === 'string'));
      if (typeof params.scratchpad === 'string') {
        update.scratchpad = params.scratchpad;
        update.scratchpadUpdatedAt = now;
      }
      await db.projects.update(projectId, update);
      const updated = await db.projects.get(projectId);
      await recordActivity({ projectId, source: 'agent', action: 'project-updated', summary: `Agent changed project “${updated?.title ?? project.title}”` });
      return updated;
    }
    case 'update_block':
      return await updateBlock(params);
    case 'append_to_block':
      return await appendToBlock(params);
    case 'list_todos': {
      const projectId = optionalString(params, 'projectId');
      const blockId = optionalString(params, 'blockId');
      const blocks = blockId
        ? [await db.blocks.get(blockId)].filter((block): block is Block => Boolean(block && !block.isTrash))
        : await db.blocks.filter(block => !block.isTrash && (!projectId || block.projectId === projectId)).toArray();
      return blocks.flatMap(todosFromBlock).filter(todo => params.completed === undefined || todo.completed === params.completed).slice(0, clampLimit(params.limit, 100));
    }
    case 'list_block_revisions': {
      const blockId = requiredString(params, 'blockId');
      const limit = clampLimit(params.limit, 50);
      const revisions = await getBlockRevisions(blockId);
      return revisions.slice(0, limit);
    }
    case 'get_block_revision': {
      const revisionId = requiredString(params, 'revisionId');
      const revision = await getBlockRevision(revisionId);
      if (!revision) throw new Error('Revisie niet gevonden.');
      return revision;
    }
    case 'restore_block_revision': {
      const revisionId = requiredString(params, 'revisionId');
      const revision = await getBlockRevision(revisionId);
      const block = revision ? await db.blocks.get(revision.blockId) : undefined;
      if (block?.kind === 'task' || revision?.kind === 'task') throw new Error('Agents cannot restore task revisions.');
      return await restoreBlockRevision(revisionId);
    }
    case 'list_activities': {
      const projectId = optionalString(params, 'projectId');
      const blockId = optionalString(params, 'blockId');
      const source = optionalString(params, 'source');
      const since = typeof params.since === 'number' && Number.isFinite(params.since) ? params.since : undefined;
      const limit = clampLimit(params.limit, 100);

      let items = await db.activities.orderBy('createdAt').reverse().toArray();
      if (projectId) items = items.filter(a => a.projectId === projectId);
      if (blockId) items = items.filter(a => a.blockId === blockId);
      if (source) items = items.filter(a => a.source === source);
      if (since !== undefined) items = items.filter(a => a.createdAt >= since);

      return items.slice(0, limit);
    }
    case 'record_activity': {
      const action = requiredString(params, 'action');
      const summary = requiredString(params, 'summary');
      const projectId = optionalString(params, 'projectId');
      const blockId = optionalString(params, 'blockId');
      const source: ActivitySource = (params.source === 'user' || params.source === 'system') ? params.source : 'agent';

      const entry: ActivityEntry = {
        id: `activity-${crypto.randomUUID()}`,
        projectId: projectId || undefined,
        blockId: blockId || undefined,
        source,
        action,
        summary,
        createdAt: Date.now()
      };
      await db.activities.add(entry);
      return entry;
    }
    case 'export_block': {
      const blockId = requiredString(params, 'blockId');
      const block = await db.blocks.get(blockId);
      if (!block || block.isTrash) throw new Error('Block not found.');
      const project = await db.projects.get(block.projectId);
      if (!project || project.isTrash) throw new Error('Project not found.');

      const rawFormat = typeof params.format === 'string' ? params.format.toLowerCase() : 'pdf';
      const format = (['pdf', 'markdown', 'html', 'text'].includes(rawFormat) ? rawFormat : 'pdf') as ExportFormat;
      const includeChildren = params.includeChildren !== false;
      const pageSize = params.pageSize === 'A5' ? 'A5' : 'A4';
      const font = params.font === 'sans' ? 'sans' : 'serif';
      const margin = params.margin === 'compact' || params.margin === 'wide' ? params.margin : 'normal';
      const outputPath = typeof params.outputPath === 'string' && params.outputPath.trim() ? params.outputPath.trim() : undefined;

      const allBlocks = await db.blocks.where('projectId').equals(project.id).filter(b => !b.isTrash).toArray();

      if (format === 'pdf') {
        const html = exportBlockAsHtml({
          project,
          rootBlock: block,
          blocks: allBlocks,
          includeChildren,
          settings: { pageSize, font, margin }
        });

        const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (electronAPI?.exportHeadlessPdf) {
          const exportResult = await electronAPI.exportHeadlessPdf({
            html,
            jobName: `${block.title || 'Block'} - ${project.title || 'DeepScribe'}`,
            pageSize,
            outputPath
          });
          await recordActivity({
            projectId: project.id,
            blockId: block.id,
            source: 'agent',
            action: 'block-exported',
            summary: `Agent exported block “${block.title}” as PDF`
          });
          return {
            status: 'exported',
            format: 'pdf',
            filePath: exportResult.filePath,
            title: block.title,
            sizeBytes: exportResult.sizeBytes
          };
        } else {
          return {
            status: 'exported',
            format: 'html_fallback',
            title: block.title,
            content: html,
            message: 'PDF export is processed natively in the desktop app. HTML markup returned.'
          };
        }
      }

      let content = '';
      if (format === 'markdown') {
        content = exportBlockAsMarkdown({ project, rootBlock: block, blocks: allBlocks, includeChildren });
      } else if (format === 'text') {
        content = exportBlockAsText({ project, rootBlock: block, blocks: allBlocks, includeChildren });
      } else if (format === 'html') {
        content = exportBlockAsHtml({ project, rootBlock: block, blocks: allBlocks, includeChildren, settings: { pageSize, font, margin } });
      }

      let savedFilePath: string | undefined;
      let sizeBytes = Buffer.byteLength(content, 'utf8');

      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (outputPath && electronAPI?.writeExportFile) {
        const writeResult = await electronAPI.writeExportFile({ filePath: outputPath, content });
        savedFilePath = writeResult.filePath;
        sizeBytes = writeResult.sizeBytes;
      }

      await recordActivity({
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
