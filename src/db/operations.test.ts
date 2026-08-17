import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addTagToBlock,
  collectDescendantIds,
  deleteTagFromProject,
  getAllProjectTags,
  markBlockSubtreeAsRead,
  markProjectAsRead,
  permanentlyDeleteProject,
  removeTagFromBlock,
  renameTagInProject,
  restoreBlock,
  restoreProject,
  saveBlockDraft,
  topLevelTrashedBlocks,
  trashBlock,
  trashProject
} from './operations';
import type { Block, Project } from '../types';
import { moveBlockInTree, reorderBlockWithinParent, reorderProject } from '../utils/dragAndDrop';

const now = 1_700_000_000_000;
const project: Project = {
  id: 'project-1', title: 'Project', description: '', color: '#fff', order: 0, tags: [], isTrash: false, createdAt: now, updatedAt: now
};
const block = (id: string, parentId: string | null, order: number): Block => ({
  id, projectId: project.id, parentId, title: id, content: '<p></p>', plainText: '', order,
  childCount: id === 'root' ? 1 : 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [],
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
    expect((await db.blocks.get('root'))?.childCount).toBe(0);
  });

  it('makes a card the last child and refreshes both parent counts', async () => {
    await db.blocks.add(block('destination-child', 'sibling', 0));
    await db.blocks.update('sibling', { childCount: 1 });

    expect(await moveBlockInTree('child', 'sibling', 'inside')).toBe(true);
    const children = await db.blocks.where('parentId').equals('sibling').sortBy('order');
    expect(children.map(item => item.id)).toEqual(['destination-child', 'child']);
    expect((await db.blocks.get('root'))?.childCount).toBe(0);
    expect((await db.blocks.get('sibling'))?.childCount).toBe(2);
  });

  it('refuses to move blocks across projects', async () => {
    const otherProject = { ...project, id: 'project-2' };
    await db.projects.add(otherProject);
    await db.blocks.add({ ...block('foreign', null, 0), projectId: otherProject.id });
    expect(await moveBlockInTree('child', 'foreign', 'inside')).toBe(false);
    expect((await db.blocks.get('child'))?.parentId).toBe('root');
  });

  it('reorders blocks within one column but never changes their parent', async () => {
    await db.blocks.add(block('second-child', 'root', 1));
    expect(await reorderBlockWithinParent('second-child', 'child', 'above')).toBe(true);
    const children = await db.blocks.where('parentId').equals('root').sortBy('order');
    expect(children.map(item => item.id)).toEqual(['second-child', 'child']);
    expect((await db.blocks.get('second-child'))?.parentId).toBe('root');

    expect(await reorderBlockWithinParent('child', 'sibling', 'below')).toBe(false);
    expect((await db.blocks.get('child'))?.parentId).toBe('root');
  });

  it('reorders projects persistently', async () => {
    const second: Project = { ...project, id: 'project-2', title: 'Tweede', order: 1 };
    await db.projects.add(second);
    expect(await reorderProject('project-2', 'project-1', 'above')).toBe(true);
    const projects = (await db.projects.toArray()).sort((a, b) => a.order - b.order);
    expect(projects.map(item => item.id)).toEqual(['project-2', 'project-1']);
  });

  it('moves projects through trash before permanent deletion', async () => {
    await db.attachments.add({
      id: 'attachment-1', blockId: 'child', fileName: 'notitie.txt', fileType: 'text/plain', fileSize: 7,
      dataUrl: 'data:text/plain;base64,bm90aXRpZQ==', createdAt: now
    });
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
    expect(await db.attachments.count()).toBe(0);
  });

  it('manages tags on blocks correctly', async () => {
    await addTagToBlock('root', 'belangrijk');
    await addTagToBlock('root', '#idee');
    let b = await db.blocks.get('root');
    expect(b?.tags).toEqual(['belangrijk', 'idee']);

    const tags = await getAllProjectTags(project.id);
    expect(tags).toEqual(['belangrijk', 'idee']);

    await removeTagFromBlock('root', 'belangrijk');
    b = await db.blocks.get('root');
    expect(b?.tags).toEqual(['idee']);
  });

  it('renames, merges and deletes tags across a project transactionally', async () => {
    await db.blocks.update('root', { tags: ['idee', 'concept'] });
    await db.blocks.update('child', { tags: ['idee'] });

    expect(await renameTagInProject(project.id, 'idee', 'concept')).toBe(2);
    expect((await db.blocks.get('root'))?.tags).toEqual(['concept']);
    expect((await db.blocks.get('child'))?.tags).toEqual(['concept']);

    expect(await deleteTagFromProject(project.id, '#concept')).toBe(2);
    expect((await db.blocks.get('root'))?.tags).toEqual([]);
    expect((await db.blocks.get('child'))?.tags).toEqual([]);
  });

  it('keeps the explicit tag list when autosaving other block fields', async () => {
    await db.blocks.update('root', { tags: ['belangrijk'] });
    await saveBlockDraft('root', {
      title: 'Gewijzigd', content: '<p>Nieuw</p>', plainText: 'Nieuw',
      taskCount: 0, completedTaskCount: 0, tags: ['belangrijk']
    });
    expect((await db.blocks.get('root'))?.tags).toEqual(['belangrijk']);
  });

  it('marks a block and its active descendants as read without touching siblings', async () => {
    await db.blocks.add({
      ...block('grandchild', 'child', 0),
      lastAgentEditAt: 30
    });
    await db.blocks.update('root', { lastAgentEditAt: 10, updatedAt: 100 });
    await db.blocks.update('child', { lastAgentEditAt: 20, lastSeenAgentEditAt: 20 });
    await db.blocks.update('sibling', { lastAgentEditAt: 40 });

    expect(await markBlockSubtreeAsRead('root')).toBe(2);
    expect((await db.blocks.get('root'))?.lastSeenAgentEditAt).toBe(10);
    expect((await db.blocks.get('root'))?.updatedAt).toBe(100);
    expect((await db.blocks.get('child'))?.lastSeenAgentEditAt).toBe(20);
    expect((await db.blocks.get('grandchild'))?.lastSeenAgentEditAt).toBe(30);
    expect((await db.blocks.get('sibling'))?.lastSeenAgentEditAt).toBeUndefined();
  });

  it('marks only active blocks in the requested project as read', async () => {
    const otherProject: Project = { ...project, id: 'project-2', title: 'Ander project' };
    await db.projects.add(otherProject);
    await db.blocks.update('root', { lastAgentEditAt: 10 });
    await db.blocks.update('child', { lastAgentEditAt: 20, isTrash: true });
    await db.blocks.add({ ...block('other', null, 0), projectId: otherProject.id, lastAgentEditAt: 30 });

    expect(await markProjectAsRead(project.id)).toBe(1);
    expect((await db.blocks.get('root'))?.lastSeenAgentEditAt).toBe(10);
    expect((await db.blocks.get('child'))?.lastSeenAgentEditAt).toBeUndefined();
    expect((await db.blocks.get('other'))?.lastSeenAgentEditAt).toBeUndefined();
  });

  it('handles cyclic block relationships while marking a subtree as read', async () => {
    await db.blocks.update('root', { parentId: 'child', lastAgentEditAt: 10 });
    await db.blocks.update('child', { lastAgentEditAt: 20 });

    expect(await markBlockSubtreeAsRead('root')).toBe(2);
    expect((await db.blocks.get('root'))?.lastSeenAgentEditAt).toBe(10);
    expect((await db.blocks.get('child'))?.lastSeenAgentEditAt).toBe(20);
  });
});
