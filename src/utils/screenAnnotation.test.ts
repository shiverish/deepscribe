import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/db';
import { createAnnotationBlock } from './screenAnnotation';
import { TASK_INBOX_PROJECT_ID } from './taskBlocks';

describe('screenAnnotation utility', () => {
  beforeEach(async () => {
    await db.blocks.clear();
    await db.attachments.clear();
    await db.activities.clear();
  });

  it('creates a task block with correct structure, task metadata and tags', async () => {
    const result = await createAnnotationBlock({
      projectId: TASK_INBOX_PROJECT_ID,
      promptText: 'Fix navbar alignment on mobile',
      kind: 'task',
      isReadyTask: true
    });

    expect(result.block).toBeDefined();
    expect(result.block.projectId).toBe(TASK_INBOX_PROJECT_ID);
    expect(result.block.title).toBe('Fix navbar alignment on mobile');
    expect(result.block.kind).toBe('task');
    expect(result.block.task).toBeDefined();
    expect(result.block.task?.status).toBe('ready');
    expect(result.block.task?.agentTarget).toBe('any');
    expect(result.block.tags).toContain('screenshot');
    expect(result.block.tags).toContain('todo');
    expect(result.block.content).toContain('Fix navbar alignment on mobile');

    // Check database insertion
    const fromDb = await db.blocks.get(result.block.id);
    expect(fromDb).toBeDefined();
    expect(fromDb?.title).toBe('Fix navbar alignment on mobile');
  });

  it('creates a standard document block when kind is block', async () => {
    const result = await createAnnotationBlock({
      projectId: 'proj-test',
      title: 'UI Design Reference',
      promptText: 'Header layout proposal',
      kind: 'block'
    });

    expect(result.block).toBeDefined();
    expect(result.block.projectId).toBe('proj-test');
    expect(result.block.title).toBe('UI Design Reference');
    expect(result.block.kind).toBeUndefined();
    expect(result.block.task).toBeUndefined();
    expect(result.block.tags).toContain('screenshot');
    expect(result.block.tags).toContain('annotation');
    expect(result.block.tags).not.toContain('todo');

    const fromDb = await db.blocks.get(result.block.id);
    expect(fromDb).toBeDefined();
  });
});
