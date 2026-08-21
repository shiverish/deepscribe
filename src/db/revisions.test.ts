import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  recordBlockRevision,
  getBlockRevisions,
  getBlockRevision,
  pruneBlockRevisions,
  restoreBlockRevision
} from './revisions';
import type { Block, Project } from '../types';

const now = 1_700_000_000_000;
const project: Project = {
  id: 'project-1',
  title: 'Project',
  description: '',
  color: '#fff',
  order: 0,
  tags: [],
  isTrash: false,
  createdAt: now,
  updatedAt: now
};

const block = (id: string, title = 'Titel 1', content = '<p>Inhoud</p>'): Block => ({
  id,
  projectId: project.id,
  parentId: null,
  title,
  content,
  plainText: 'Inhoud',
  order: 0,
  childCount: 0,
  taskCount: 0,
  completedTaskCount: 0,
  attachmentCount: 0,
  tags: ['concept'],
  isTrash: false,
  createdAt: now,
  updatedAt: now
});

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await db.projects.add(project);
  await db.blocks.add(block('block-1'));
});

describe('block revisions', () => {
  it('records a new revision when block changes', async () => {
    const current = (await db.blocks.get('block-1'))!;
    const rev1 = await recordBlockRevision(current, 'user', 'Initiële versie');
    expect(rev1).not.toBeNull();
    expect(rev1?.source).toBe('user');
    expect(rev1?.title).toBe('Titel 1');

    // Duplicate call without changes should return null
    const duplicate = await recordBlockRevision(current, 'user');
    expect(duplicate).toBeNull();

    // After modifying block
    const modified = { ...current, content: '<p>Gewijzigd door agent</p>', plainText: 'Gewijzigd door agent' };
    const rev2 = await recordBlockRevision(modified, 'agent', 'Agent update');
    expect(rev2).not.toBeNull();
    expect(rev2?.source).toBe('agent');

    const history = await getBlockRevisions('block-1');
    expect(history.length).toBe(2);
    expect(history[0].id).toBe(rev2!.id); // newest first

    const singleRev = await getBlockRevision(rev1!.id);
    expect(singleRev?.title).toBe('Titel 1');
  });

  it('restores a previous revision and keeps a backup snapshot', async () => {
    const b = (await db.blocks.get('block-1'))!;
    const v1 = await recordBlockRevision(b, 'user', 'Versie 1');

    // Update block to v2
    const v2Block = { ...b, title: 'Titel V2', content: '<p>Nieuwe tekst</p>', plainText: 'Nieuwe tekst' };
    await db.blocks.put(v2Block);
    await recordBlockRevision(v2Block, 'agent', 'Versie 2 door agent');

    // Restore to v1
    const restored = await restoreBlockRevision(v1!.id);
    expect(restored.title).toBe('Titel 1');
    expect(restored.content).toBe('<p>Inhoud</p>');

    const history = await getBlockRevisions('block-1');
    // Should now have: backup before restore, v2, v1
    expect(history.length).toBe(3);
    expect(history[0].source).toBe('restore');
  });

  it('restores task kind and metadata from the selected revision', async () => {
    const original = (await db.blocks.get('block-1'))!;
    const taskVersion: Block = {
      ...original,
      kind: 'task',
      task: { status: 'ready', agentTarget: 'claude', position: 0 }
    };
    await db.blocks.put(taskVersion);
    const revision = await recordBlockRevision(taskVersion, 'user', 'Taakversie');
    await db.blocks.put({ ...original, title: 'Weer tekstblok', kind: undefined, task: undefined });

    const restored = await restoreBlockRevision(revision!.id);
    expect(restored.kind).toBe('task');
    expect(restored.task).toEqual({ status: 'ready', agentTarget: 'claude', position: 0 });
  });

  it('does not snapshot or restore a live task claim', async () => {
    const original = (await db.blocks.get('block-1'))!;
    const claimed: Block = {
      ...original,
      kind: 'task',
      task: {
        status: 'in-progress', agentTarget: 'openai', position: 0,
        claim: { ownerId: 'agent', agentTarget: 'openai', token: 'secret', requestId: 'request', claimedAt: 1, heartbeatAt: 1, expiresAt: 999, attempt: 1 }
      }
    };
    const revision = await recordBlockRevision(claimed, 'agent', 'Tijdens claim');
    expect(revision?.task?.status).toBe('ready');
    expect(revision?.task?.claim).toBeUndefined();
    await db.blocks.put(claimed);
    const restored = await restoreBlockRevision(revision!.id);
    expect(restored.task?.status).toBe('ready');
    expect(restored.task?.claim).toBeUndefined();
  });

  it('prunes older revisions beyond maxKeep', async () => {
    const b = (await db.blocks.get('block-1'))!;
    for (let i = 0; i < 10; i++) {
      await db.revisions.add({
        id: `rev-${i}`,
        blockId: b.id,
        projectId: b.projectId,
        title: `Versie ${i}`,
        content: `<p>Versie ${i}</p>`,
        plainText: `Versie ${i}`,
        tags: [],
        source: 'user',
        createdAt: now + i * 1000
      });
    }

    const prunedCount = await pruneBlockRevisions(b.id, 5);
    expect(prunedCount).toBe(5);

    const remaining = await getBlockRevisions(b.id);
    expect(remaining.length).toBe(5);
    expect(remaining[0].title).toBe('Versie 9');
  });
});
