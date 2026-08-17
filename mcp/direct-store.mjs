import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const STOP_WORDS = new Set(['de', 'het', 'een', 'en', 'of', 'van', 'voor', 'met', 'in', 'op', 'aan', 'is', 'zijn', 'te', 'dit', 'dat']);
const CONCEPT_GROUPS = [
  ['todo', 'taak', 'taken', 'actie', 'werk'],
  ['idee', 'concept', 'gedachte', 'voorstel'],
  ['agent', 'agents', 'ai', 'assistent', 'automatisering'],
  ['bestand', 'bestanden', 'document', 'bijlage', 'file'],
  ['zoeken', 'zoekfunctie', 'vinden', 'search'],
  ['app', 'applicatie', 'software', 'programma'],
  ['fout', 'bug', 'probleem', 'issue'],
  ['ontwerp', 'design', 'ui', 'interface']
];

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

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function inlineMarkdown(value) {
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

export function markdownToHtml(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let list = null;

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
  const addListItem = (type, item, start) => {
    flushParagraph();
    if (!list || list.type !== type) {
      flushList();
      list = { type, start, items: [] };
    }
    list.items.push(item);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line.trim())) {
      flushParagraph();
      flushList();
      const language = line.trim().slice(3).trim();
      const code = [];
      while (index + 1 < lines.length && !/^```\s*$/.test(lines[index + 1])) code.push(lines[++index]);
      if (index + 1 < lines.length) index += 1;
      const className = language && /^[a-z0-9_-]+$/i.test(language) ? ` class="language-${language}"` : '';
      output.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
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

export function contentStats(content) {
  const taskMatches = [...(content || '').matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*>/gi)];
  const completedMatches = [...(content || '').matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*data-checked="true"[^>]*>/gi)];
  return {
    content: content || '<p></p>',
    plainText: (content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    taskCount: taskMatches.length,
    completedTaskCount: completedMatches.length
  };
}

export function normalizeTag(tag) {
  return String(tag || '').normalize('NFC').trim().replace(/^#+/, '').trim().toLowerCase();
}

export function sanitizeTags(tags = []) {
  const result = new Set();
  for (const candidate of tags) {
    const normalized = normalizeTag(candidate);
    if (normalized && normalized.length <= 48 && /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(normalized)) {
      result.add(normalized);
    }
  }
  return Array.from(result);
}

export function isBlockCompleted(block) {
  if (block.isTrash) return false;
  const tags = (block.tags || []).map(t => String(t).toLowerCase().trim());
  if (tags.some(t => t === 'done' || t === 'agent-done' || t === 'completed' || t === 'klaar' || t === 'afgerond')) {
    return true;
  }
  if (block.taskCount > 0 && block.completedTaskCount >= block.taskCount) {
    return true;
  }
  return false;
}

export function sanitizeDependsOn(raw) {
  if (!Array.isArray(raw)) return [];
  const unique = new Set();
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) unique.add(trimmed);
    }
  }
  return Array.from(unique);
}

export function detectCircularDependency(allBlocks, blockId, candidateDependencyId) {
  if (blockId === candidateDependencyId) return true;
  const byId = new Map(allBlocks.filter(b => !b.isTrash).map(b => [b.id, b]));
  const visited = new Set();
  const queue = [candidateDependencyId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === blockId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentBlock = byId.get(currentId);
    if (currentBlock && Array.isArray(currentBlock.dependsOn)) {
      for (const nextId of currentBlock.dependsOn) {
        if (!visited.has(nextId)) queue.push(nextId);
      }
    }
  }
  return false;
}

export function getBlockDependencyStatus(block, allBlocks) {
  const activeBlocks = allBlocks.filter(b => !b.isTrash);
  const byId = new Map(activeBlocks.map(b => [b.id, b]));

  const dependsOnIds = sanitizeDependsOn(block.dependsOn);
  const pendingDependencies = [];
  const completedDependencies = [];
  const missingDependencyIds = [];

  for (const depId of dependsOnIds) {
    const targetBlock = byId.get(depId);
    if (!targetBlock) {
      missingDependencyIds.push(depId);
      continue;
    }
    if (isBlockCompleted(targetBlock)) {
      completedDependencies.push(targetBlock);
    } else {
      pendingDependencies.push(targetBlock);
    }
  }

  const blocking = activeBlocks.filter(other => {
    if (other.id === block.id) return false;
    const otherDepends = sanitizeDependsOn(other.dependsOn);
    return otherDepends.includes(block.id);
  });

  return {
    isBlocked: pendingDependencies.length > 0,
    pendingDependencies,
    completedDependencies,
    missingDependencyIds,
    blocking
  };
}

export function formatDependencyMarkdown(dependencies) {
  if (!dependencies || dependencies.length === 0) return '';
  const lines = dependencies.map(dep => {
    const completed = isBlockCompleted(dep);
    const check = completed ? '[x]' : '[ ]';
    const statusText = completed ? 'Afgerond' : 'Openstaand';
    return `- ${check} [[${dep.title}]] (\`${dep.id}\`) — *${statusText}*`;
  });
  return `## Afhankelijkheden\n\n${lines.join('\n')}`;
}

export function formatWorkItemContent(goal, context, acceptanceCriteria, dependencyBlocks = []) {
  const sections = [
    `## Doel\n\n${goal}`,
    `## Context\n\n${context}`,
    `## Acceptatiecriteria\n\n${acceptanceCriteria.map(criterion => `- ${criterion}`).join('\n')}`
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

function normalizeToken(token) {
  return token.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '');
}

function tokens(text) {
  return String(text || '').split(/\s+/).map(normalizeToken).filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function expandQuery(queryTokens) {
  const expanded = new Set(queryTokens);
  for (const token of queryTokens) {
    const group = CONCEPT_GROUPS.find(values => values.includes(token));
    group?.forEach(value => expanded.add(value));
  }
  return expanded;
}

function trigrams(value) {
  const padded = `  ${value} `;
  const result = new Set();
  for (let index = 0; index <= padded.length - 3; index += 1) result.add(padded.slice(index, index + 3));
  return result;
}

function trigramSimilarity(left, right) {
  const a = trigrams(left);
  const b = trigrams(right);
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return a.size + b.size ? (2 * overlap) / (a.size + b.size) : 0;
}

export function rankBlocksLocally(blocks, query) {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];
  const expanded = expandQuery(queryTokens);
  const normalizedQuery = queryTokens.join(' ');

  return blocks.map(block => {
    const titleTokens = tokens(block.title);
    const bodyTokens = tokens(block.plainText);
    const tagTokens = (block.tags || []).flatMap(tokens);
    let score = 0;
    for (const token of expanded) {
      if (titleTokens.includes(token)) score += queryTokens.includes(token) ? 8 : 3;
      if (tagTokens.includes(token)) score += queryTokens.includes(token) ? 6 : 2;
      const bodyHits = bodyTokens.filter(value => value === token).length;
      score += Math.min(bodyHits, 4) * (queryTokens.includes(token) ? 2 : 1);
    }
    score += trigramSimilarity(normalizedQuery, normalizeToken(block.title)) * 4;
    return { block, score };
  }).filter(result => result.score >= 1).sort((a, b) => b.score - a.score || b.block.updatedAt - a.block.updatedAt);
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
    return this.database.prepare('SELECT json FROM blocks').all().map(row => JSON.parse(row.json));
  }

  getBlock(id) {
    this.open();
    const row = this.database.prepare('SELECT json FROM blocks WHERE id = ?').get(id);
    return row ? JSON.parse(row.json) : null;
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
    if (!force && latest && latest.title === block.title && latest.content === block.content && (latest.tags || []).join(',') === (block.tags || []).join(',')) {
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
    this.recordBlockRevision(currentBlock, 'restore', `Backup vóór herstel naar versie van ${new Date(revision.createdAt).toLocaleString('nl-NL')}`, true);

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
      updatedAt: Date.now()
    };
    this.saveBlock(updated);
    this.recordActivity({
      projectId: currentBlock.projectId,
      blockId: currentBlock.id,
      source: 'agent',
      action: 'block-restored',
      summary: `Blok “${revision.title}” hersteld naar revisie van ${new Date(revision.createdAt).toLocaleDateString('nl-NL')}`
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
      updatedAt: block.updatedAt
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
        const projects = this.getAllProjects().filter(p => !p.isTrash);
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
          .filter(p => !p.isTrash)
          .sort((a, b) => (b.order ?? b.createdAt) - (a.order ?? a.createdAt));
        return await Promise.all(projects.map(p => this.projectWithCounts(p)));
      }

      case 'get_project': {
        const project = this.getProject(requireString('projectId'));
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');
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
          } else if ((block.tags || []).includes('todo') || (block.tags || []).includes('agent-ready')) {
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
          ...block,
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
        const ranked = query
          ? rankBlocksLocally(blocks, query).map(r => r.block)
          : blocks.sort((l, r) => (r.updatedAt ?? 0) - (l.updatedAt ?? 0));
        return ranked.slice(0, clampLimit(params.limit)).map(b => this.blockSummary(b));
      }

      case 'create_project': {
        const now = Date.now();
        const projects = this.getAllProjects().filter(p => !p.isTrash);
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
        this.recordActivity({ projectId: project.id, source: 'agent', action: 'project-created', summary: `Agent maakte project “${project.title}”` });
        return project;
      }

      case 'create_block': {
        const projectId = requireString('projectId');
        const project = this.getProject(projectId);
        if (!project || project.isTrash) throw new Error('Project niet gevonden.');

        const parentId = typeof params.parentId === 'string' && params.parentId ? params.parentId : null;
        if (parentId) {
          const parent = this.getBlock(parentId);
          if (!parent || parent.projectId !== projectId || parent.isTrash) throw new Error('Bovenliggend blok niet gevonden.');
        }

        const rawContent = optionalStr('content') || '';
        const stats = contentStats(markdownToHtml(rawContent));
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
        this.recordBlockRevision(block, 'agent', 'Initiële aanmaak door agent');
        this.recordActivity({ projectId, blockId: block.id, source: 'agent', action: 'block-created', summary: `Agent maakte blok “${block.title}”` });
        return block;
      }

      case 'create_work_item': {
        const goal = requireString('goal');
        const context = requireString('context');
        const acceptanceCriteria = Array.isArray(params.acceptanceCriteria)
          ? params.acceptanceCriteria.filter(c => typeof c === 'string' && Boolean(c.trim())).map(c => c.trim())
          : [];
        if (goal.length < 10) throw new Error('goal moet minimaal 10 tekens bevatten.');
        if (context.length < 20) throw new Error('context moet minimaal 20 tekens bevatten.');
        if (acceptanceCriteria.length === 0) throw new Error('Minimaal één acceptanceCriterion is verplicht.');
        const suppliedTags = Array.isArray(params.tags) ? params.tags.filter(t => typeof t === 'string') : [];

        const rawDependsOn = sanitizeDependsOn(params.dependsOn);
        const dependencyBlocks = rawDependsOn.map(id => this.getBlock(id)).filter(b => Boolean(b && !b.isTrash));

        return await this.handleRequest('create_block', {
          ...params,
          content: formatWorkItemContent(goal, context, acceptanceCriteria, dependencyBlocks),
          dependsOn: rawDependsOn,
          tags: ['todo', 'agent-ready', ...suppliedTags]
        });
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
        this.recordActivity({ projectId, source: 'agent', action: 'project-updated', summary: `Agent wijzigde project “${updated.title}”` });
        return updated;
      }

      case 'update_block': {
        const blockId = requireString('blockId');
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
        this.recordBlockRevision(block, 'user', 'Status vóór agent-wijziging');
        const now = Date.now();
        const updated = { ...block, updatedAt: now, lastAgentEditAt: now };
        if (typeof params.title === 'string' && params.title.trim()) updated.title = params.title.trim();
        if (typeof params.content === 'string') Object.assign(updated, contentStats(markdownToHtml(params.content)));
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
        this.recordBlockRevision(updated, 'agent', `Agent wijzigde “${updated.title}”`);
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'block-updated', summary: `Agent wijzigde “${updated.title}”` });
        return updated;
      }

      case 'append_to_block': {
        const blockId = requireString('blockId');
        const text = requireString('text');
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
        this.recordBlockRevision(block, 'user', 'Status vóór toevoeging door agent');
        const addition = markdownToHtml(text);
        const newContent = `${block.content || '<p></p>'}${addition}`;
        const stats = contentStats(newContent);
        const now = Date.now();
        const updated = { ...block, ...stats, updatedAt: now, lastAgentEditAt: now };
        this.saveBlock(updated);
        this.recordBlockRevision(updated, 'agent', `Agent voegde tekst toe`);
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'block-appended', summary: `Agent voegde tekst toe aan “${block.title}”` });
        return updated;
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
        const blockId = requireString('blockId');
        const text = requireString('text');
        const completed = params.completed === true;
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

        this.recordBlockRevision(block, 'user', 'Status vóór toevoegen van todo');
        const itemHtml = `<li data-type="taskItem" data-checked="${completed}"><label><input type="checkbox"${completed ? ' checked' : ''}><span></span></label><div><p>${escapeHtml(text)}</p></div></li>`;
        let newContent = '';
        if (block.content && block.content.includes('</ul>')) {
          newContent = block.content.replace(/<\/ul>$/, `${itemHtml}</ul>`);
        } else {
          newContent = `${block.content || '<p></p>'}<ul data-type="taskList">${itemHtml}</ul>`;
        }

        const stats = contentStats(newContent);
        const now = Date.now();
        const updated = { ...block, ...stats, updatedAt: now, lastAgentEditAt: now };
        this.saveBlock(updated);
        this.recordBlockRevision(updated, 'agent', `Agent voegde todo “${text}” toe`);
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'todo-added', summary: `Agent voegde todo “${text}” toe aan “${block.title}”` });
        return todosFromBlock(updated);
      }

      case 'set_todo_status': {
        const blockId = requireString('blockId');
        const taskIndex = typeof params.taskIndex === 'number' ? Math.floor(params.taskIndex) : -1;
        if (taskIndex < 0) throw new Error('taskIndex moet nul of hoger zijn.');
        if (typeof params.completed !== 'boolean') throw new Error('completed is verplicht.');
        const block = this.getBlock(blockId);
        if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

        this.recordBlockRevision(block, 'user', 'Status vóór todo statuswijziging');
        let currentIndex = 0;
        let replaced = false;
        const newContent = (block.content || '').replace(/(<li\s+[^>]*data-type="taskItem"[^>]*data-checked=")(true|false)("[^>]*>)/gi, (match, prefix, _state, suffix) => {
          if (currentIndex === taskIndex) {
            replaced = true;
            currentIndex += 1;
            return `${prefix}${params.completed}${suffix}`;
          }
          currentIndex += 1;
          return match;
        });
        if (!replaced) throw new Error('Todo niet gevonden.');

        const stats = contentStats(newContent);
        const now = Date.now();
        const updated = { ...block, ...stats, updatedAt: now, lastAgentEditAt: now };
        this.saveBlock(updated);
        this.recordBlockRevision(updated, 'agent', `Agent markeerde todo als ${params.completed ? 'afgerond' : 'open'}`);
        this.recordActivity({ projectId: block.projectId, blockId, source: 'agent', action: 'todo-status', summary: `Agent markeerde een todo in “${block.title}” als ${params.completed ? 'afgerond' : 'open'}` });
        return todosFromBlock(updated)[taskIndex];
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
        return this.restoreBlockRevision(revisionId);
      }

      case 'get_or_create_daily_plan': {
        const dateInfo = parseDailyPlanDate(optionalStr('date'));
        const focus = optionalStr('focus');
        const includeOpenTasks = params.includeOpenTasks !== false;

        const projects = this.getAllProjects().filter(p => !p.isTrash);
        let project = projects.find(p => (p.tags || []).includes('planning') || (p.tags || []).includes('daily-log') || /dagplanning|daily planning/i.test(p.title));

        if (!project) {
          project = await this.handleRequest('create_project', {
            title: 'Dagplanning & Focus',
            description: 'Centrale dagplanningen, dagelijkse doelstellingen en werkverdeling tussen ontwikkelaar en AI-agents.',
            color: '#10b981',
            tags: ['planning', 'daily-log', 'focus']
          });
        }

        const projectBlocks = this.getAllBlocks().filter(b => b.projectId === project.id && !b.isTrash);
        let block = projectBlocks.find(b =>
          (b.tags || []).includes(`date-${dateInfo.isoDate}`) ||
          b.title.toLowerCase() === dateInfo.title.toLowerCase() ||
          b.title.toLowerCase().includes(dateInfo.isoDate) ||
          b.title.toLowerCase().includes(dateInfo.humanDate.toLowerCase())
        );

        if (!block) {
          const openTasks = [];
          if (includeOpenTasks) {
            const activeProjects = this.getAllProjects().filter(p => !p.isTrash && p.id !== project.id);
            const projectMap = new Map(activeProjects.map(p => [p.id, p.title]));
            const allOtherBlocks = this.getAllBlocks().filter(b => !b.isTrash);

            for (const b of allOtherBlocks) {
              if (b.projectId === project.id) continue;
              const projectTitle = projectMap.get(b.projectId);
              if (!projectTitle) continue;
              const depStatus = getBlockDependencyStatus(b, allOtherBlocks);
              const statusLabel = depStatus.isBlocked
                ? `[GEBLOKKEERD door: ${depStatus.pendingDependencies.map(d => d.title).join(', ')}]`
                : '[READY]';

              const todos = todosFromBlock(b).filter(t => !t.completed);
              if (todos.length > 0) {
                for (const todo of todos) openTasks.push({ projectTitle, blockTitle: b.title, text: `${statusLabel} ${todo.text}` });
              } else if ((b.tags || []).includes('todo') || (b.tags || []).includes('agent-ready')) {
                openTasks.push({ projectTitle, blockTitle: b.title, text: `${statusLabel} ${b.title}` });
              }
            }
          }

          const content = formatDailyPlanContent(focus, openTasks);
          block = await this.handleRequest('create_block', {
            projectId: project.id,
            title: dateInfo.title,
            content,
            tags: ['planning', 'daily-log', 'agent-ready', `date-${dateInfo.isoDate}`]
          });
        }

        const allBlocks = this.getAllBlocks().filter(b => b.projectId === project.id);
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
        return {
          ...block,
          path: breadcrumbPath,
          attachments: attachments.map(a => this.attachmentMetadata(a)),
          todos: todosFromBlock(block)
        };
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
