import { db } from './db';
import type { Block } from '../types';

export function createId(prefix: 'proj' | 'block' | 'attachment'): string {
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
    if (!root) throw new Error('Blok niet gevonden.');
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
    if (!root) throw new Error('Blok niet gevonden.');
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
    if (!project) throw new Error('Project niet gevonden.');
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
  await db.transaction('rw', db.blocks, db.attachments, async () => {
    const allBlocks = await db.blocks.toArray();
    const root = allBlocks.find(block => block.id === blockId);
    if (!root) return;
    const ids = [...collectDescendantIds(allBlocks, blockId)];
    await db.attachments.where('blockId').anyOf(ids).delete();
    await db.blocks.where('id').anyOf(ids).delete();
    await refreshChildCount(root.parentId);
  });
}

export async function permanentlyDeleteProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.blocks, db.attachments, async () => {
    const blockIds = await db.blocks.where('projectId').equals(projectId).primaryKeys();
    if (blockIds.length) await db.attachments.where('blockId').anyOf(blockIds).delete();
    await db.blocks.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });
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
