import { db } from './db';
import type { Block, BlockRevision, RevisionSource } from '../types';
import { sanitizeTags } from '../utils/tagUtils';
import { recordActivity } from './activity';

function tagsEqual(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

export function isRevisionIdentical(rev: BlockRevision, block: Pick<Block, 'title' | 'content' | 'tags' | 'kind' | 'task'>): boolean {
  return rev.title === block.title &&
    rev.content === block.content &&
    tagsEqual(rev.tags, block.tags) &&
    rev.kind === block.kind &&
    JSON.stringify(rev.task ?? null) === JSON.stringify(block.task ?? null);
}

export async function recordBlockRevision(
  block: Block,
  source: RevisionSource = 'user',
  summary?: string,
  force = false
): Promise<BlockRevision | null> {
  const existingRevisions = await db.revisions.where('blockId').equals(block.id).sortBy('createdAt');
  const latest = existingRevisions[existingRevisions.length - 1];

  // Skip if identical to latest snapshot unless forced
  if (!force && latest && isRevisionIdentical(latest, block)) {
    return null;
  }

  const now = Date.now();
  const revision: BlockRevision = {
    id: `rev-${crypto.randomUUID()}`,
    blockId: block.id,
    projectId: block.projectId,
    title: block.title,
    content: block.content,
    plainText: block.plainText,
    tags: sanitizeTags(block.tags),
    kind: block.kind,
    task: block.task ? { ...block.task } : undefined,
    source,
    summary,
    createdAt: now
  };

  await db.revisions.add(revision);
  await pruneBlockRevisions(block.id, 50);
  return revision;
}

export async function getBlockRevisions(blockId: string): Promise<BlockRevision[]> {
  const revisions = await db.revisions.where('blockId').equals(blockId).sortBy('createdAt');
  return revisions.reverse();
}

export async function getBlockRevision(revisionId: string): Promise<BlockRevision | undefined> {
  return await db.revisions.get(revisionId);
}

export async function pruneBlockRevisions(blockId: string, maxKeep = 50): Promise<number> {
  const allRevisions = await db.revisions.where('blockId').equals(blockId).sortBy('createdAt');
  if (allRevisions.length <= maxKeep) return 0;

  const toDelete = allRevisions.slice(0, allRevisions.length - maxKeep);
  const idsToDelete = toDelete.map(r => r.id);
  await db.revisions.bulkDelete(idsToDelete);
  return idsToDelete.length;
}

export async function restoreBlockRevision(revisionId: string): Promise<Block> {
  const revision = await db.revisions.get(revisionId);
  if (!revision) throw new Error('Revisie niet gevonden.');

  const currentBlock = await db.blocks.get(revision.blockId);
  if (!currentBlock || currentBlock.isTrash) throw new Error('Het bijbehorende blok is niet beschikbaar.');

  // First create a backup revision of current state
  await recordBlockRevision(
    currentBlock,
    'restore',
    `Backup vóór herstel naar versie van ${new Date(revision.createdAt).toLocaleString('nl-NL')}`,
    true
  );

  // Recalculate stats from revision content
  const taskMatches = [...revision.content.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*>/gi)];
  const completedMatches = [...revision.content.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*data-checked="true"[^>]*>/gi)];

  const now = Date.now();
  const updatedBlock: Block = {
    ...currentBlock,
    title: revision.title,
    content: revision.content,
    plainText: revision.plainText,
    taskCount: taskMatches.length,
    completedTaskCount: completedMatches.length,
    tags: sanitizeTags(revision.tags),
    kind: revision.kind,
    task: revision.task ? { ...revision.task } : undefined,
    updatedAt: now
  };

  await db.blocks.put(updatedBlock);
  await recordActivity({
    projectId: currentBlock.projectId,
    blockId: currentBlock.id,
    source: 'user',
    action: 'block-restored',
    summary: `Blok “${revision.title}” hersteld naar revisie van ${new Date(revision.createdAt).toLocaleDateString('nl-NL')}`
  });

  return updatedBlock;
}
