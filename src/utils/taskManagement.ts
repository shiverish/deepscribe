import { db } from '../db/db';
import { recordActivity } from '../db/activity';
import type { Block, TaskAgentTarget, TaskStatus } from '../types';
import { createTaskMetadata, TASK_INBOX_PROJECT_ID } from './taskBlocks';

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
