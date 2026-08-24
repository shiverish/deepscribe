import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import type { Block, Project } from '../types';
import { createTaskInboxProject, normalizeTaskMetadata, TASK_INBOX_PROJECT_ID } from './taskBlocks';
import { archiveDoneTasks, archiveUserTask, createUserTask, ensureArchiveParentBlock, relocateUserTask, updateUserTaskStatus } from './taskManagement';

const project = (id: string, title: string): Project => ({ id, title, description: '', color: '#123456', order: 0, tags: [], isTrash: false, createdAt: 1, updatedAt: 1 });

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await db.projects.clear();
  await db.projects.bulkAdd([createTaskInboxProject(1), project('project-1', 'Project One'), project('project-2', 'Project Two')]);
});

afterAll(async () => { db.close(); await db.delete(); });

describe('user-managed tasks', () => {
  it('creates free tasks in the workspace inbox and later links them without changing content', async () => {
    const task = await createUserTask({ title: 'Set up a new project' });
    expect(task).toMatchObject({ projectId: TASK_INBOX_PROJECT_ID, parentId: null, content: '<p></p>', kind: 'task', task: { creator: { type: 'user' } } });
    expect(task.task?.status).toBe('inbox');

    const parent: Block = { id: 'context', projectId: 'project-1', parentId: null, title: 'Context', content: '<p>Keep</p>', plainText: 'Keep', order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false, createdAt: 1, updatedAt: 1 };
    await db.blocks.add(parent);
    await db.blocks.update(task.id, { content: '<p>Unstructured notes stay intact.</p>', plainText: 'Unstructured notes stay intact.' });
    await relocateUserTask((await db.blocks.get(task.id))!, 'project-1', parent.id);
    expect(await db.blocks.get(task.id)).toMatchObject({ projectId: 'project-1', parentId: parent.id, content: '<p>Unstructured notes stay intact.</p>' });
  });

  it('releases active claims when the user moves a task to another status', async () => {
    const task = await createUserTask({ title: 'Claimed task', projectId: 'project-1' });
    const claimed = { ...task, task: { ...task.task!, status: 'in-progress' as const, claim: { ownerId: 'agent', agentTarget: 'openai' as const, token: 'secret', requestId: 'request', claimedAt: 1, heartbeatAt: 1, expiresAt: 999, attempt: 1 } } };
    await db.blocks.put(claimed);
    await updateUserTaskStatus(claimed, 'done', 0);
    expect((await db.blocks.get(task.id))?.task).toMatchObject({ status: 'done', position: 0 });
    expect((await db.blocks.get(task.id))?.task?.claim).toBeUndefined();
  });

  it('normalizes legacy statuses and completion metadata without requiring structured content', () => {
    expect(normalizeTaskMetadata({ status: 'draft', agentTarget: 'none', completionPolicy: 'review-required' }, 7)).toEqual({ status: 'inbox', agentTarget: 'none', position: 7 });
    expect(normalizeTaskMetadata({ status: 'claimed', agentTarget: 'openai', completionPolicy: 'auto-complete' }, 8)).toMatchObject({ status: 'in-progress', agentTarget: 'openai', position: 8 });
  });

  it('archives a task into an automatically created Archive root block in the project', async () => {
    const task = await createUserTask({ title: 'Finished work item', projectId: 'project-1' });
    await db.blocks.update(task.id, { content: '<p>Result summary</p>', tags: ['research'] });
    await updateUserTaskStatus((await db.blocks.get(task.id))!, 'done', 0);

    const refreshedTask = (await db.blocks.get(task.id))!;
    const archived = await archiveUserTask(refreshedTask);

    expect(archived.kind).toBeUndefined();
    expect(archived.task).toBeUndefined();
    expect(archived.projectId).toBe('project-1');
    expect(archived.tags).toContain('archived');
    expect(archived.tags).toContain('research');

    const archiveParent = (await db.blocks.get(archived.parentId!))!;
    expect(archiveParent).toBeDefined();
    expect(archiveParent.title).toBe('Archive');
    expect(archiveParent.parentId).toBeNull();
    expect(archiveParent.childCount).toBe(1);

    // Reusing the same Archive parent on subsequent archives
    const task2 = await createUserTask({ title: 'Second finished item', projectId: 'project-1' });
    await updateUserTaskStatus((await db.blocks.get(task2.id))!, 'done', 0);
    const archived2 = await archiveUserTask((await db.blocks.get(task2.id))!);
    expect(archived2.parentId).toBe(archiveParent.id);
    expect((await db.blocks.get(archiveParent.id))?.childCount).toBe(2);
  });

  it('archives tasks from Workspace Inbox to a specified destination project', async () => {
    const inboxTask = await createUserTask({ title: 'Inbox task to archive' });
    await updateUserTaskStatus((await db.blocks.get(inboxTask.id))!, 'done', 0);

    const archived = await archiveUserTask((await db.blocks.get(inboxTask.id))!, 'project-2');
    expect(archived.projectId).toBe('project-2');
    expect(archived.kind).toBeUndefined();
    expect(archived.tags).toContain('archived');

    const archiveParent = await ensureArchiveParentBlock('project-2');
    expect(archived.parentId).toBe(archiveParent.id);
  });

  it('bulk archives done tasks while skipping non-done tasks', async () => {
    const done1 = await createUserTask({ title: 'Done 1', projectId: 'project-1' });
    await updateUserTaskStatus((await db.blocks.get(done1.id))!, 'done', 0);

    const done2 = await createUserTask({ title: 'Done 2 in Inbox' });
    await updateUserTaskStatus((await db.blocks.get(done2.id))!, 'done', 0);

    const pending = await createUserTask({ title: 'Pending task', projectId: 'project-1' });

    const allBlocks = await db.blocks.toArray();
    const result = await archiveDoneTasks(allBlocks, 'project-1');

    expect(result.archivedCount).toBe(2);
    expect((await db.blocks.get(done1.id))?.kind).toBeUndefined();
    expect((await db.blocks.get(done2.id))?.kind).toBeUndefined();
    expect((await db.blocks.get(pending.id))?.kind).toBe('task');
  });
});
