import { db } from '../db/db';
import { recordActivity } from '../db/activity';
import type { Block, TaskAgentTarget, TaskStatus } from '../types';
import { createTaskMetadata, TASK_INBOX_PROJECT_ID } from './taskBlocks';
import { sanitizeTags } from './tagUtils';

function nextPosition(tasks: Block[], status: TaskStatus): number {
  return tasks.reduce((highest, block) => block.task?.status === status ? Math.max(highest, block.task.position) : highest, -1) + 1;
}

export async function createUserTask(input: {
  title: string;
  projectId?: string | null;
  parentId?: string | null;
}): Promise<Block> {
  const title = input.title.trim();
  if (!title) throw new Error('Enter a task title.');
  const projectId = input.projectId || TASK_INBOX_PROJECT_ID;
  const parentId = input.parentId || null;
  const project = await db.projects.get(projectId);
  if (!project || project.isTrash) throw new Error('The selected project is unavailable.');
  if (parentId) {
    const parent = await db.blocks.get(parentId);
    if (!parent || parent.isTrash || parent.projectId !== projectId) throw new Error('The selected context block is unavailable.');
  }
  const tasks = await db.blocks.filter(block => !block.isTrash && block.kind === 'task').toArray();
  const now = Date.now();
  const position = nextPosition(tasks, 'inbox');
  const block: Block = {
    id: `block-${crypto.randomUUID()}`,
    projectId,
    parentId,
    title,
    content: '<p></p>',
    plainText: '',
    order: await db.blocks.filter(block => !block.isTrash && block.projectId === projectId && block.parentId === parentId).count(),
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    tags: [],
    kind: 'task',
    task: createTaskMetadata(position),
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };
  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.add(block);
    if (parentId) await db.blocks.update(parentId, { childCount: await db.blocks.filter(item => !item.isTrash && item.parentId === parentId).count(), updatedAt: now });
  });
  await recordActivity({ projectId, blockId: block.id, action: 'task-created', summary: `Task “${title}” created` });
  return block;
}

export async function updateUserTaskStatus(block: Block, status: TaskStatus, position: number): Promise<void> {
  if (block.kind !== 'task' || !block.task) return;
  const now = Date.now();
  await db.blocks.update(block.id, {
    task: {
      ...block.task,
      status,
      position,
      claim: undefined,
      ...(status === 'ready' ? { readyAt: now } : {})
    },
    updatedAt: now
  });
  await recordActivity({ projectId: block.projectId, blockId: block.id, action: block.task.claim ? 'task-claim-released-by-user' : 'task-status-changed', summary: `Task “${block.title}” → ${status}` });
}

export async function updateUserTaskAgent(block: Block, agentTarget: TaskAgentTarget, customAgentName?: string): Promise<void> {
  if (block.kind !== 'task' || !block.task) return;
  if (block.task.claim) throw new Error('Release the active claim before changing the assigned agent.');
  const task = { ...block.task, agentTarget, ...(agentTarget === 'custom' ? { customAgentName: customAgentName?.trim() } : { customAgentName: undefined }) };
  await db.blocks.update(block.id, { task, updatedAt: Date.now() });
  await recordActivity({ projectId: block.projectId, blockId: block.id, action: 'task-agent-updated', summary: `Task “${block.title}” assigned to ${agentTarget}` });
}

export async function relocateUserTask(block: Block, projectId: string | null, parentId: string | null): Promise<void> {
  if (block.kind !== 'task' || !block.task) return;
  if (block.task.claim) throw new Error('Release the active claim before moving this task.');
  const destinationProjectId = projectId || TASK_INBOX_PROJECT_ID;
  const project = await db.projects.get(destinationProjectId);
  if (!project || project.isTrash) throw new Error('The selected project is unavailable.');
  if (parentId) {
    const parent = await db.blocks.get(parentId);
    if (!parent || parent.isTrash || parent.projectId !== destinationProjectId) throw new Error('The selected context block is unavailable.');
  }
  const allBlocks = await db.blocks.toArray();
  const descendants: Block[] = [];
  const visit = (id: string) => {
    for (const child of allBlocks.filter(candidate => candidate.parentId === id)) {
      descendants.push(child);
      visit(child.id);
    }
  };
  visit(block.id);
  const now = Date.now();
  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.update(block.id, {
      projectId: destinationProjectId,
      parentId,
      order: await db.blocks.filter(candidate => !candidate.isTrash && candidate.projectId === destinationProjectId && candidate.parentId === parentId && candidate.id !== block.id).count(),
      updatedAt: now
    });
    for (const child of descendants) await db.blocks.update(child.id, { projectId: destinationProjectId, updatedAt: now });
    for (const oldParentId of new Set([block.parentId, parentId])) {
      if (oldParentId) await db.blocks.update(oldParentId, { childCount: await db.blocks.filter(candidate => !candidate.isTrash && candidate.parentId === oldParentId).count(), updatedAt: now });
    }
  });
  await recordActivity({ projectId: destinationProjectId, blockId: block.id, action: 'task-relocated', summary: `Task “${block.title}” moved to ${project.systemKind === 'task-inbox' ? 'Workspace Inbox' : project.title}` });
}

export async function ensureArchiveParentBlock(projectId: string): Promise<Block> {
  const project = await db.projects.get(projectId);
  if (!project || project.isTrash || project.systemKind === 'task-inbox') {
    throw new Error('Select a valid destination project.');
  }

  const existing = await db.blocks
    .filter(b => !b.isTrash && b.projectId === projectId && b.parentId === null && b.kind !== 'task' && b.title.trim().toLowerCase() === 'archive')
    .first();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const rootOrder = await db.blocks
    .filter(b => !b.isTrash && b.projectId === projectId && b.parentId === null)
    .count();

  const archiveRoot: Block = {
    id: `block-${crypto.randomUUID()}`,
    projectId,
    parentId: null,
    title: 'Archive',
    content: '<p></p>',
    plainText: '',
    order: rootOrder,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    tags: ['archive'],
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };

  await db.blocks.add(archiveRoot);
  return archiveRoot;
}

export async function archiveUserTask(block: Block, targetProjectId?: string | null): Promise<Block> {
  if (block.kind !== 'task' && !block.task) {
    throw new Error('This item is not a task.');
  }
  if (block.task?.claim) {
    throw new Error('Release the active claim before archiving this task.');
  }

  const destinationProjectId = targetProjectId || (block.projectId !== TASK_INBOX_PROJECT_ID ? block.projectId : null);
  if (!destinationProjectId || destinationProjectId === TASK_INBOX_PROJECT_ID) {
    throw new Error('Select a destination project for the archived task.');
  }

  const project = await db.projects.get(destinationProjectId);
  if (!project || project.isTrash || project.systemKind === 'task-inbox') {
    throw new Error('The selected destination project is unavailable.');
  }

  const archiveParent = await ensureArchiveParentBlock(destinationProjectId);
  const now = Date.now();

  const allBlocks = await db.blocks.toArray();
  const descendants: Block[] = [];
  const visit = (id: string) => {
    for (const child of allBlocks.filter(candidate => candidate.parentId === id)) {
      descendants.push(child);
      visit(child.id);
    }
  };
  visit(block.id);

  const order = await db.blocks
    .filter(candidate => !candidate.isTrash && candidate.projectId === destinationProjectId && candidate.parentId === archiveParent.id && candidate.id !== block.id)
    .count();

  const oldParentId = block.parentId;
  const currentTags = Array.isArray(block.tags) ? block.tags : [];
  const updatedTags = sanitizeTags([...currentTags, 'archived']);

  const currentBlockInDb = await db.blocks.get(block.id);
  if (!currentBlockInDb) throw new Error('Task not found.');

  const updatedBlock: Block = {
    ...currentBlockInDb,
    projectId: destinationProjectId,
    parentId: archiveParent.id,
    order,
    tags: updatedTags,
    updatedAt: now
  };
  delete updatedBlock.kind;
  delete updatedBlock.task;

  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.put(updatedBlock);
    for (const child of descendants) {
      await db.blocks.update(child.id, { projectId: destinationProjectId, updatedAt: now });
    }
    const newParentChildCount = await db.blocks
      .filter(candidate => !candidate.isTrash && candidate.parentId === archiveParent.id)
      .count();
    await db.blocks.update(archiveParent.id, { childCount: newParentChildCount, updatedAt: now });

    if (oldParentId && oldParentId !== archiveParent.id) {
      const oldParentChildCount = await db.blocks
        .filter(candidate => !candidate.isTrash && candidate.parentId === oldParentId)
        .count();
      await db.blocks.update(oldParentId, { childCount: oldParentChildCount, updatedAt: now });
    }
  });

  await recordActivity({
    projectId: destinationProjectId,
    blockId: block.id,
    action: 'task-archived',
    summary: `Task “${block.title}” archived to ${project.title}`
  });

  return updatedBlock;
}

export async function archiveDoneTasks(
  tasks: Block[],
  defaultProjectId?: string | null
): Promise<{ archivedCount: number }> {
  let count = 0;
  for (const task of tasks) {
    if (task.kind !== 'task' || task.task?.status !== 'done') continue;
    const targetProject = task.projectId !== TASK_INBOX_PROJECT_ID ? task.projectId : (defaultProjectId || null);
    if (!targetProject) continue;
    try {
      await archiveUserTask(task, targetProject);
      count += 1;
    } catch {
      // Continue with other tasks if one fails
    }
  }
  return { archivedCount: count };
}
