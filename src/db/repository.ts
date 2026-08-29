import { db, subscribeToDatabaseMutations } from './db';
import type { Attachment, Block, WorkspaceSnapshot, WorkspaceStatus } from '../types';
import { createTaskInboxProject, normalizeTaskMetadata, TASK_INBOX_PROJECT_ID } from '../utils/taskBlocks';
import { sanitizeTags } from '../utils/tagUtils';

let initialized = false;
let initializationPromise: Promise<WorkspaceStatus | null> | null = null;
let applyingSnapshot = false;
let syncTimer: number | null = null;
let syncPromise: Promise<void> = Promise.resolve();
let currentStatus: WorkspaceStatus | null = null;

export interface DataRepository {
  initialize(): Promise<WorkspaceStatus | null>;
  snapshot(): Promise<WorkspaceSnapshot>;
  flush(): Promise<void>;
  reload(): Promise<WorkspaceStatus | null>;
  status(): WorkspaceStatus | null;
  subscribe(listener: () => void): () => void;
}

const listeners = new Set<() => void>();
const legacyStatuses = ['agent-ready', 'agent-claimed', 'agent-blocked', 'agent-review', 'agent-done'] as const;

function normalizeSnapshotBlock(block: Block): Block {
  const tags = sanitizeTags(block.tags ?? []);
  const agentStatus = legacyStatuses.find(status => tags.includes(status));
  const headings = [...(block.content || '').matchAll(/<h[1-6][^>]*>\s*([^<]+?)\s*<\/h[1-6]>/gi)]
    .map(match => match[1].trim().toLocaleLowerCase('en-US'));
  const structuredTodo = tags.includes('todo')
    && (headings.includes('goal') || headings.includes('doel'))
    && headings.includes('context')
    && (headings.includes('acceptance criteria') || headings.includes('acceptatiecriteria'));
  if (block.kind !== 'task' && !agentStatus && !structuredTodo) return { ...block, tags };
  const task = normalizeTaskMetadata(block.task, block.order ?? block.createdAt);
  if (!block.task) {
    task.status = agentStatus === 'agent-ready' ? 'ready' : agentStatus === 'agent-claimed' ? 'in-progress'
      : agentStatus === 'agent-blocked' ? 'blocked' : agentStatus === 'agent-review' ? 'review'
        : agentStatus === 'agent-done' ? 'done' : 'inbox';
    if (agentStatus === 'agent-ready') task.agentTarget = 'any';
  }
  return { ...block, kind: 'task', task, tags: tags.filter(tag => !legacyStatuses.includes(tag as typeof legacyStatuses[number])) };
}

async function createSnapshot(): Promise<WorkspaceSnapshot> {
  const [projects, blocks, attachments, settings, activities, templates, revisions, links] = await Promise.all([
    db.projects.toArray(), db.blocks.toArray(), db.attachments.toArray(), db.settings.toArray(),
    db.activities.toArray(), db.templates.toArray(), db.revisions.toArray(), db.links.toArray()
  ]);
  return { projects, blocks, attachments, settings, activities, templates, revisions, links };
}

async function migrateAttachment(attachment: Attachment, projectId: string): Promise<Attachment> {
  if (!window.electronAPI) return attachment;
  if (attachment.dataUrl) {
    const base64 = attachment.dataUrl.includes(',') ? attachment.dataUrl.split(',')[1] : attachment.dataUrl;
    const result = await window.electronAPI.importAttachment({
      projectId, blockId: attachment.blockId, fileName: attachment.fileName, base64
    });
    return { ...attachment, localPath: result.localPath, dataUrl: undefined };
  }
  if (attachment.localPath) {
    const result = await window.electronAPI.migrateLegacyAttachment({
      projectId, blockId: attachment.blockId, localPath: attachment.localPath
    });
    return { ...attachment, localPath: result.localPath };
  }
  return attachment;
}

async function applySnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
  applyingSnapshot = true;
  try {
    const projects = snapshot.projects.some(project => project.id === TASK_INBOX_PROJECT_ID)
      ? snapshot.projects
      : [...snapshot.projects, createTaskInboxProject()];
    const blocks = snapshot.blocks.map(normalizeSnapshotBlock);
    await db.transaction('rw', [db.projects, db.blocks, db.attachments, db.settings, db.activities, db.templates, db.revisions, db.links], async () => {
      await Promise.all([db.links.clear(), db.revisions.clear(), db.attachments.clear(), db.activities.clear(), db.templates.clear(), db.settings.clear(), db.blocks.clear(), db.projects.clear()]);
      if (projects.length) await db.projects.bulkAdd(projects);
      if (blocks.length) await db.blocks.bulkAdd(blocks);
      if (snapshot.attachments.length) await db.attachments.bulkAdd(snapshot.attachments);
      if (snapshot.settings.length) await db.settings.bulkAdd(snapshot.settings);
      if (snapshot.activities.length) await db.activities.bulkAdd(snapshot.activities);
      if (snapshot.templates.length) await db.templates.bulkAdd(snapshot.templates);
      if (snapshot.revisions?.length) await db.revisions.bulkAdd(snapshot.revisions);
      if (snapshot.links?.length) await db.links.bulkAdd(snapshot.links);
    });
  } finally {
    applyingSnapshot = false;
  }
}

async function saveNow(): Promise<void> {
  if (!window.electronAPI?.workspace || applyingSnapshot) return;
  const snapshot = await createSnapshot();
  syncPromise = syncPromise.catch(() => {}).then(() => window.electronAPI!.workspace.save(snapshot));
  await syncPromise;
  currentStatus = await window.electronAPI.workspace.status();
  listeners.forEach(listener => listener());
}

function scheduleSync(): void {
  if (!initialized || applyingSnapshot || !window.electronAPI?.workspace) return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void saveNow().catch(error => console.error('Workspace synchroniseren is mislukt.', error));
  }, 200);
}

subscribeToDatabaseMutations(scheduleSync);

export const repository: DataRepository = {
  async initialize() {
    if (initialized || !window.electronAPI?.workspace) return currentStatus;
    if (!initializationPromise) {
      initializationPromise = (async () => {
        currentStatus = await window.electronAPI!.workspace.status();
        const workspaceSnapshot = await window.electronAPI!.workspace.load();
        const hasWorkspaceData = workspaceSnapshot.projects.length > 0
          || workspaceSnapshot.blocks.length > 0
          || workspaceSnapshot.settings.length > 0;
        if (hasWorkspaceData) {
          await applySnapshot(workspaceSnapshot);
        } else {
          const legacySnapshot = await createSnapshot();
          if (legacySnapshot.projects.length > 0 && !window.confirm(
            'DeepScribe will migrate your existing local data to the new workspace folder once. The existing storage will be retained as a safety copy. Continue?'
          )) {
            throw new Error('Workspace migration was postponed by the user.');
          }
          const blocksById = new Map(legacySnapshot.blocks.map(block => [block.id, block]));
          legacySnapshot.attachments = await Promise.all(legacySnapshot.attachments.map(attachment => {
            const projectId = blocksById.get(attachment.blockId)?.projectId;
            return projectId ? migrateAttachment(attachment, projectId) : attachment;
          }));
          if (legacySnapshot.attachments.length) await db.attachments.bulkPut(legacySnapshot.attachments);
          await window.electronAPI!.workspace.save(legacySnapshot);
          currentStatus = await window.electronAPI!.workspace.status();
        }
        initialized = true;
        listeners.forEach(listener => listener());
        return currentStatus;
      })();
    }
    try {
      return await initializationPromise;
    } finally {
      if (!initialized) initializationPromise = null;
    }
  },
  snapshot: createSnapshot,
  async flush() {
    if (syncTimer !== null) {
      window.clearTimeout(syncTimer);
      syncTimer = null;
    }
    await saveNow();
  },
  async reload() {
    if (!initialized || !window.electronAPI?.workspace || applyingSnapshot) return currentStatus;
    const workspaceSnapshot = await window.electronAPI.workspace.load();
    await applySnapshot(workspaceSnapshot);
    currentStatus = await window.electronAPI.workspace.status();
    listeners.forEach(listener => listener());
    return currentStatus;
  },
  status: () => currentStatus,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
