import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  collectDescendantIds,
  permanentlyDeleteProject,
  restoreBlock,
  restoreProject,
  topLevelTrashedBlocks,
  trashBlock,
  trashProject
} from './operations';
import type { Block, Project } from '../types';
import { moveBlockInTree } from '../utils/dragAndDrop';

const now = 1_700_000_000_000;
const project: Project = {
  id: 'project-1', title: 'Project', description: '', color: '#fff', isTrash: false, createdAt: now, updatedAt: now
};
const block = (id: string, parentId: string | null, order: number): Block => ({
  id, projectId: project.id, parentId, title: id, content: '<p></p>', plainText: '', order,
  childCount: id === 'root' ? 1 : 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0,
  isTrash: false, createdAt: now, updatedAt: now
});

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await db.projects.add(project);
  await db.blocks.bulkAdd([block('root', null, 0), block('child', 'root', 0), block('sibling', null, 1)]);
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe('local data safety operations', () => {
  it('collects descendants without looping on damaged cyclic input', () => {
    const blocks = [block('a', 'b', 0), block('b', 'a', 0)];
    expect([...collectDescendantIds(blocks, 'a')].sort()).toEqual(['a', 'b']);
  });

  it('trashes a complete branch and restores an accessible path', async () => {
    await trashBlock('child');
    expect((await db.blocks.get('child'))?.isTrash).toBe(true);

    await trashBlock('root');
    await restoreBlock('child');
    expect((await db.blocks.get('root'))?.isTrash).toBe(false);
    expect((await db.blocks.get('child'))?.isTrash).toBe(false);
  });

  it('only exposes the root of a trashed branch', async () => {
    await trashBlock('root');
    expect(topLevelTrashedBlocks(await db.blocks.toArray()).map(item => item.id)).toEqual(['root']);
  });

  it('prevents cycles and keeps sibling ordering valid while moving', async () => {
    expect(await moveBlockInTree('root', 'child', 'inside')).toBe(false);
    expect(await moveBlockInTree('child', 'sibling', 'below')).toBe(true);
    const moved = await db.blocks.get('child');
    expect(moved?.parentId).toBeNull();
    const roots = await db.blocks.filter(item => item.parentId === null).sortBy('order');
    expect(roots.map(item => item.id)).toEqual(['root', 'sibling', 'child']);
  });

  it('moves projects through trash before permanent deletion', async () => {
    await trashBlock('child');
    await trashProject(project.id);
    expect((await db.projects.get(project.id))?.isTrash).toBe(true);
    expect((await db.blocks.where('projectId').equals(project.id).toArray()).every(item => item.isTrash)).toBe(true);

    await restoreProject(project.id);
    expect((await db.projects.get(project.id))?.isTrash).toBe(false);
    expect((await db.blocks.get('child'))?.isTrash).toBe(true);
    expect((await db.blocks.get('root'))?.isTrash).toBe(false);

    await trashProject(project.id);
    await permanentlyDeleteProject(project.id);
    expect(await db.projects.get(project.id)).toBeUndefined();
    expect(await db.blocks.where('projectId').equals(project.id).count()).toBe(0);
  });
});
