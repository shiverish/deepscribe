import { db } from './db';
import type { Block, Project, TaskMetadata } from '../types';
import { parseTag, sanitizeTags } from '../utils/tagUtils';
import { sanitizeDependsOn } from '../utils/dependencyUtils';
import { invalidateChunks } from '../utils/semanticSearch';
import { linkIdsTouchingBlocks, syncWikiLinksForBlock } from '../../mcp/core/links.mjs';

async function removeLocalAttachmentFiles(blockIds: string[]): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.removeAttachment || blockIds.length === 0) return;
  const attachments = await db.attachments.where('blockId').anyOf(blockIds).toArray();
  for (const attachment of attachments) {
    if (attachment.localPath) await window.electronAPI.removeAttachment(attachment.localPath);
  }
}

export interface BlockDraftUpdate {
  title: string;
  content: string;
  plainText: string;
  taskCount: number;
  completedTaskCount: number;
  tags: string[];
  dependsOn?: string[];
  task?: TaskMetadata;
}

export async function saveBlockDraft(blockId: string, draft: BlockDraftUpdate): Promise<void> {
  await db.blocks.update(blockId, {
    ...draft,
    tags: sanitizeTags(draft.tags),
    dependsOn: draft.dependsOn ? sanitizeDependsOn(draft.dependsOn) : undefined,
    task: draft.task ? { ...draft.task } : undefined,
    updatedAt: Date.now()
  });
  await syncBlockWikiLinks(blockId);
}

/**
 * Resolves the `[[Title]]` references a block carries into stored relations.
 *
 * Resolution happens here, on save, rather than at render time: a relation that
 * points at a block id survives a rename, while title matching did not.
 */
export async function syncBlockWikiLinks(blockId: string): Promise<void> {
  const [block, allBlocks, links] = await Promise.all([
    db.blocks.get(blockId),
    db.blocks.toArray(),
    db.links.toArray()
  ]);
  if (!block) return;
  const { added, removedIds } = syncWikiLinksForBlock(block, allBlocks, links, 'user');
  if (added.length > 0) await db.links.bulkAdd(added);
  if (removedIds.length > 0) await db.links.bulkDelete(removedIds);
}

export interface ProjectDraftUpdate {
  title: string;
  description: string;
  tags: string[];
  color?: string;
  scratchpad?: string;
}

export async function saveProjectDraft(projectId: string, draft: ProjectDraftUpdate): Promise<void> {
  const current = await db.projects.get(projectId);
  const now = Date.now();
  const update: Partial<Project> = {
    title: draft.title,
    description: draft.description,
    tags: sanitizeTags(draft.tags),
    updatedAt: now
  };
  if (draft.color !== undefined) {
    update.color = draft.color;
  }
  if (draft.scratchpad !== undefined) {
    update.scratchpad = draft.scratchpad;
    if (draft.scratchpad !== current?.scratchpad) {
      update.scratchpadUpdatedAt = now;
    }
  }
  await db.projects.update(projectId, update);
}

export function createId(prefix: 'proj' | 'block' | 'attachment' | 'revision'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function collectDescendantIds(blocks: Block[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const block of blocks) {
    if (!block.parentId) continue;
    const children = childrenByParent.get(block.parentId) ?? [];
    children.push(block.id);
    childrenByParent.set(block.parentId, children);
  }

  const result = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return result;
}

function markUnseenAgentEditsRead(block: Block): boolean {
  if (block.isTrash || typeof block.lastAgentEditAt !== 'number') return false;
  if (block.lastAgentEditAt <= (block.lastSeenAgentEditAt ?? 0)) return false;
  block.lastSeenAgentEditAt = block.lastAgentEditAt;
  return true;
}

export async function markBlockSubtreeAsRead(blockId: string): Promise<number> {
  return db.transaction('rw', db.blocks, async () => {
    const allBlocks = await db.blocks.toArray();
    const ids = [...collectDescendantIds(allBlocks, blockId)];
    let changed = 0;
    await db.blocks.where('id').anyOf(ids).modify(block => {
      if (markUnseenAgentEditsRead(block)) changed += 1;
    });
    return changed;
  });
}

export async function markProjectAsRead(projectId: string): Promise<number> {
  return db.transaction('rw', db.blocks, async () => {
    let changed = 0;
    await db.blocks.where('projectId').equals(projectId).modify(block => {
      if (markUnseenAgentEditsRead(block)) changed += 1;
    });
    return changed;
  });
}

function collectAncestorIds(blocks: Block[], blockId: string): Set<string> {
  const byId = new Map(blocks.map(block => [block.id, block]));
  const result = new Set<string>();
  let current = byId.get(blockId);
  while (current?.parentId && !result.has(current.parentId)) {
    result.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return result;
}

async function refreshChildCount(blockId: string | null): Promise<void> {
  if (!blockId) return;
  const childCount = await db.blocks
    .filter(block => block.parentId === blockId && !block.isTrash)
    .count();
  await db.blocks.update(blockId, { childCount, updatedAt: Date.now() });
}

export async function trashBlock(blockId: string): Promise<void> {
  await db.transaction('rw', db.blocks, async () => {
    const allBlocks = await db.blocks.toArray();
    const root = allBlocks.find(block => block.id === blockId);
    if (!root) throw new Error('Block not found.');
    const ids = collectDescendantIds(allBlocks, blockId);
    const trashedAt = Date.now();
    await db.blocks.where('id').anyOf([...ids]).modify({ isTrash: true, trashedAt, updatedAt: trashedAt });
    await refreshChildCount(root.parentId);
  });
}

export async function restoreBlock(blockId: string): Promise<void> {
  await db.transaction('rw', db.blocks, async () => {
    const allBlocks = await db.blocks.toArray();
    const root = allBlocks.find(block => block.id === blockId);
    if (!root) throw new Error('Block not found.');
    const ids = collectDescendantIds(allBlocks, blockId);
    collectAncestorIds(allBlocks, blockId).forEach(id => ids.add(id));
    const restoredAt = Date.now();
    await db.blocks.where('id').anyOf([...ids]).modify(block => {
      block.isTrash = false;
      delete block.trashedAt;
      block.updatedAt = restoredAt;
    });
    await refreshChildCount(root.parentId);
  });
}

export async function trashProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.blocks, async () => {
    const project = await db.projects.get(projectId);
    if (!project) throw new Error('Project not found.');
    const trashedAt = Date.now();
    await db.projects.update(projectId, { isTrash: true, trashedAt, updatedAt: trashedAt });
    await db.blocks.where('projectId').equals(projectId).modify(block => {
      if (!block.isTrash) {
        block.isTrash = true;
        block.trashedAt = trashedAt;
        block.trashedWithProject = true;
        block.updatedAt = trashedAt;
      }
    });
  });
}

export async function restoreProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.blocks, async () => {
    const restoredAt = Date.now();
    await db.projects.update(projectId, project => {
      project.isTrash = false;
      delete project.trashedAt;
      project.updatedAt = restoredAt;
    });
    await db.blocks.where('projectId').equals(projectId).modify(block => {
      if (block.trashedWithProject) {
        block.isTrash = false;
        delete block.trashedAt;
        delete block.trashedWithProject;
        block.updatedAt = restoredAt;
      }
    });
  });
}

export async function permanentlyDeleteBlock(blockId: string): Promise<void> {
  const allBlocks = await db.blocks.toArray();
  const root = allBlocks.find(block => block.id === blockId);
  if (!root) return;
  const ids = [...collectDescendantIds(allBlocks, blockId)];
  await removeLocalAttachmentFiles(ids);
  await db.transaction('rw', db.blocks, db.attachments, db.activities, async () => {
    await db.attachments.where('blockId').anyOf(ids).delete();
    await db.activities.where('blockId').anyOf(ids).delete();
    await db.blocks.where('id').anyOf(ids).delete();
    await refreshChildCount(root.parentId);
  });
  // Drop the search index entries so deleted blocks leave no chunks behind.
  for (const id of ids) invalidateChunks(id);
  await removeLinksTouching(ids);
}

/** Removes every relation that points at one of these blocks. */
async function removeLinksTouching(blockIds: readonly string[]): Promise<void> {
  if (blockIds.length === 0) return;
  const stale = linkIdsTouchingBlocks(await db.links.toArray(), blockIds);
  if (stale.length > 0) await db.links.bulkDelete(stale);
}

export async function permanentlyDeleteProject(projectId: string): Promise<void> {
  const blockIds = await db.blocks.where('projectId').equals(projectId).primaryKeys();
  await removeLocalAttachmentFiles(blockIds);
  await db.transaction('rw', db.projects, db.blocks, db.attachments, db.activities, async () => {
    if (blockIds.length) await db.attachments.where('blockId').anyOf(blockIds).delete();
    await db.activities.where('projectId').equals(projectId).delete();
    await db.blocks.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });
  // Drop the search index entries so the deleted project and its blocks leave
  // no chunks behind.
  for (const id of blockIds) invalidateChunks(String(id));
  invalidateChunks(projectId);
  await removeLinksTouching(blockIds.map(String));
}

export function topLevelTrashedBlocks(blocks: Block[]): Block[] {
  const byId = new Map(blocks.map(block => [block.id, block]));
  return blocks.filter(block => block.isTrash && (!block.parentId || !byId.get(block.parentId)?.isTrash));
}

export async function emptyTrash(): Promise<void> {
  const trashedProjects = await db.projects.filter(project => project.isTrash).toArray();
  for (const project of trashedProjects) await permanentlyDeleteProject(project.id);

  const remainingBlocks = await db.blocks.toArray();
  for (const block of topLevelTrashedBlocks(remainingBlocks)) await permanentlyDeleteBlock(block.id);
}

export async function getAllProjectTags(projectId: string): Promise<string[]> {
  const blocks = await db.blocks.where('projectId').equals(projectId).toArray();
  const tagsSet = new Set<string>();
  for (const block of blocks) {
    if (!block.isTrash && block.tags) {
      for (const tag of sanitizeTags(block.tags)) tagsSet.add(tag);
    }
  }
  return Array.from(tagsSet).sort();
}

export async function addTagToBlock(blockId: string, tag: string): Promise<void> {
  const normalized = parseTag(tag).tag;
  if (!normalized) return;
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(blockId);
    if (!block) return;
    const currentTags = sanitizeTags(block.tags);
    if (!currentTags.includes(normalized)) {
      await db.blocks.update(blockId, {
        tags: [...currentTags, normalized],
        updatedAt: Date.now()
      });
    }
  });
}

export async function removeTagFromBlock(blockId: string, tag: string): Promise<void> {
  const normalized = parseTag(tag).tag;
  if (!normalized) return;
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(blockId);
    if (!block || !block.tags) return;
    const updatedTags = block.tags.filter(t => t !== normalized);
    await db.blocks.update(blockId, {
      tags: updatedTags,
      updatedAt: Date.now()
    });
  });
}

export async function renameTagInProject(projectId: string, from: string, to: string): Promise<number> {
  const source = parseTag(from).tag;
  const target = parseTag(to).tag;
  if (!source || !target || source === target) return 0;

  let changed = 0;
  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.where('projectId').equals(projectId).modify(block => {
      const current = sanitizeTags(block.tags);
      if (!current.includes(source)) return;
      block.tags = sanitizeTags(current.map(tag => tag === source ? target : tag));
      block.updatedAt = Date.now();
      changed += 1;
    });
  });
  return changed;
}

export async function deleteTagFromProject(projectId: string, tag: string): Promise<number> {
  const target = parseTag(tag).tag;
  if (!target) return 0;

  let changed = 0;
  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.where('projectId').equals(projectId).modify(block => {
      const current = sanitizeTags(block.tags);
      if (!current.includes(target)) return;
      block.tags = current.filter(value => value !== target);
      block.updatedAt = Date.now();
      changed += 1;
    });
  });
  return changed;
}
