import { db } from '../db/db';
import type { Block, Project } from '../types';
import { sanitizeTags } from '../utils/tagUtils';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function requiredString(params: JsonObject, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is verplicht.`);
  return value.trim();
}

function optionalString(params: JsonObject, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function clampLimit(value: unknown, fallback = 50): number {
  return Math.max(1, Math.min(100, typeof value === 'number' ? Math.floor(value) : fallback));
}

function htmlDocument(content: string): Document {
  return new DOMParser().parseFromString(content || '<p></p>', 'text/html');
}

function htmlFromPlainText(text: string): string {
  const document = htmlDocument('');
  document.body.replaceChildren();
  for (const paragraphText of text.split(/\n{2,}/)) {
    const paragraph = document.createElement('p');
    paragraph.textContent = paragraphText || '';
    document.body.appendChild(paragraph);
  }
  return document.body.innerHTML || '<p></p>';
}

function plainTextFromDocument(document: Document): string {
  const parts: string[] = [];
  const blockElements = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR']);
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue || '');
      return;
    }
    node.childNodes.forEach(visit);
    if (node instanceof HTMLElement && blockElements.has(node.tagName)) parts.push(' ');
  };
  document.body.childNodes.forEach(visit);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function contentStats(content: string) {
  const document = htmlDocument(content);
  const tasks = [...document.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')];
  return {
    content: document.body.innerHTML,
    plainText: plainTextFromDocument(document),
    taskCount: tasks.length,
    completedTaskCount: tasks.filter(task => task.dataset.checked === 'true' || task.querySelector('input')?.checked).length
  };
}

function blockSummary(block: Block) {
  return {
    id: block.id,
    projectId: block.projectId,
    parentId: block.parentId,
    title: block.title,
    plainText: block.plainText,
    tags: block.tags,
    order: block.order,
    childCount: block.childCount,
    taskCount: block.taskCount,
    completedTaskCount: block.completedTaskCount,
    updatedAt: block.updatedAt
  };
}

async function projectWithCounts(project: Project) {
  const blocks = await db.blocks.where('projectId').equals(project.id).filter(block => !block.isTrash).toArray();
  return {
    ...project,
    blockCount: blocks.length,
    openTaskCount: blocks.reduce((count, block) => count + Math.max(0, block.taskCount - block.completedTaskCount), 0)
  };
}

async function createProject(params: JsonObject) {
  const now = Date.now();
  const projects = await db.projects.filter(project => !project.isTrash).toArray();
  const project: Project = {
    id: `proj-${crypto.randomUUID()}`,
    title: requiredString(params, 'title'),
    description: optionalString(params, 'description')?.trim() || '',
    color: optionalString(params, 'color') || '#3b82f6',
    order: projects.reduce((highest, current) => Math.max(highest, current.order ?? -1), -1) + 1,
    tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []),
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };
  await db.projects.add(project);
  return project;
}

async function createBlock(params: JsonObject) {
  const projectId = requiredString(params, 'projectId');
  const project = await db.projects.get(projectId);
  if (!project || project.isTrash) throw new Error('Project niet gevonden.');

  const parentId = typeof params.parentId === 'string' && params.parentId ? params.parentId : null;
  if (parentId) {
    const parent = await db.blocks.get(parentId);
    if (!parent || parent.projectId !== projectId || parent.isTrash) throw new Error('Bovenliggend blok niet gevonden.');
  }

  const rawContent = optionalString(params, 'content') || '';
  const stats = contentStats(htmlFromPlainText(rawContent));
  const siblingCount = await db.blocks.filter(block => block.projectId === projectId && block.parentId === parentId && !block.isTrash).count();
  const now = Date.now();
  const block: Block = {
    id: `block-${crypto.randomUUID()}`,
    projectId,
    parentId,
    title: requiredString(params, 'title'),
    ...stats,
    order: siblingCount,
    childCount: 0,
    attachmentCount: 0,
    tags: sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []),
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };

  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.add(block);
    if (parentId) await db.blocks.update(parentId, { childCount: await db.blocks.filter(item => item.parentId === parentId && !item.isTrash).count(), updatedAt: now });
  });
  return block;
}

async function updateBlock(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

  const update: Partial<Block> = { updatedAt: Date.now() };
  if (typeof params.title === 'string' && params.title.trim()) update.title = params.title.trim();
  if (typeof params.content === 'string') Object.assign(update, contentStats(htmlFromPlainText(params.content)));
  if (Array.isArray(params.tags)) update.tags = sanitizeTags(params.tags.filter((tag): tag is string => typeof tag === 'string'));
  await db.blocks.update(blockId, update);
  return await db.blocks.get(blockId);
}

async function appendToBlock(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const text = requiredString(params, 'text');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

  const document = htmlDocument(block.content);
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  document.body.appendChild(paragraph);
  const stats = contentStats(document.body.innerHTML);
  await db.blocks.update(blockId, { ...stats, updatedAt: Date.now() });
  return await db.blocks.get(blockId);
}

function todosFromBlock(block: Block) {
  const document = htmlDocument(block.content);
  return [...document.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')].map((task, index) => ({
    blockId: block.id,
    blockTitle: block.title,
    taskIndex: index,
    text: task.textContent?.replace(/\s+/g, ' ').trim() || '',
    completed: task.dataset.checked === 'true' || Boolean(task.querySelector('input')?.checked)
  }));
}

async function addTodo(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const text = requiredString(params, 'text');
  const completed = params.completed === true;
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

  const document = htmlDocument(block.content);
  let taskList = document.querySelector<HTMLUListElement>('ul[data-type="taskList"]');
  if (!taskList) {
    taskList = document.createElement('ul');
    taskList.dataset.type = 'taskList';
    document.body.appendChild(taskList);
  }
  const item = document.createElement('li');
  item.dataset.type = 'taskItem';
  item.dataset.checked = String(completed);
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = completed;
  label.append(input, document.createElement('span'));
  const wrapper = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  wrapper.appendChild(paragraph);
  item.append(label, wrapper);
  taskList.appendChild(item);

  const stats = contentStats(document.body.innerHTML);
  await db.blocks.update(blockId, { ...stats, updatedAt: Date.now() });
  return todosFromBlock((await db.blocks.get(blockId))!);
}

async function setTodoStatus(params: JsonObject) {
  const blockId = requiredString(params, 'blockId');
  const taskIndex = typeof params.taskIndex === 'number' ? Math.floor(params.taskIndex) : -1;
  if (taskIndex < 0) throw new Error('taskIndex moet nul of hoger zijn.');
  if (typeof params.completed !== 'boolean') throw new Error('completed is verplicht.');
  const block = await db.blocks.get(blockId);
  if (!block || block.isTrash) throw new Error('Blok niet gevonden.');

  const document = htmlDocument(block.content);
  const item = [...document.querySelectorAll<HTMLElement>('li[data-type="taskItem"]')][taskIndex];
  if (!item) throw new Error('Todo niet gevonden.');
  item.dataset.checked = String(params.completed);
  const input = item.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (input) input.checked = params.completed;
  const stats = contentStats(document.body.innerHTML);
  await db.blocks.update(blockId, { ...stats, updatedAt: Date.now() });
  return todosFromBlock((await db.blocks.get(blockId))!)[taskIndex];
}

export async function handleMcpBridgeRequest(method: string, rawParams: unknown): Promise<unknown> {
  const params = asObject(rawParams);

  switch (method) {
    case 'status':
      return {
        app: 'DeepScribe',
        projects: await db.projects.filter(project => !project.isTrash).count(),
        blocks: await db.blocks.filter(block => !block.isTrash).count()
      };
    case 'list_projects': {
      const projects = await db.projects.filter(project => !project.isTrash).sortBy('updatedAt');
      return await Promise.all(projects.reverse().map(projectWithCounts));
    }
    case 'get_project': {
      const project = await db.projects.get(requiredString(params, 'projectId'));
      if (!project || project.isTrash) throw new Error('Project niet gevonden.');
      return await projectWithCounts(project);
    }
    case 'list_blocks': {
      const projectId = requiredString(params, 'projectId');
      const recursive = params.recursive === true;
      const parentId = typeof params.parentId === 'string' ? params.parentId : null;
      const blocks = await db.blocks.where('projectId').equals(projectId).filter(block => !block.isTrash && (recursive || block.parentId === parentId)).sortBy('order');
      return blocks.slice(0, clampLimit(params.limit, 100)).map(blockSummary);
    }
    case 'get_block': {
      const block = await db.blocks.get(requiredString(params, 'blockId'));
      if (!block || block.isTrash) throw new Error('Blok niet gevonden.');
      const allBlocks = await db.blocks.where('projectId').equals(block.projectId).toArray();
      const byId = new Map(allBlocks.map(item => [item.id, item]));
      const path: Array<{ id: string; title: string }> = [];
      let current: Block | undefined = block;
      while (current) {
        path.unshift({ id: current.id, title: current.title });
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return { ...block, path };
    }
    case 'search': {
      const query = optionalString(params, 'query')?.trim().toLocaleLowerCase() || '';
      const projectId = optionalString(params, 'projectId');
      const tags = sanitizeTags(Array.isArray(params.tags) ? params.tags.filter((tag): tag is string => typeof tag === 'string') : []);
      const blocks = await db.blocks.filter(block => !block.isTrash
        && (!projectId || block.projectId === projectId)
        && (!query || `${block.title} ${block.plainText}`.toLocaleLowerCase().includes(query))
        && tags.every(tag => block.tags.includes(tag))).toArray();
      return blocks.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, clampLimit(params.limit)).map(blockSummary);
    }
    case 'create_project':
      return await createProject(params);
    case 'create_block':
      return await createBlock(params);
    case 'update_project': {
      const projectId = requiredString(params, 'projectId');
      const project = await db.projects.get(projectId);
      if (!project || project.isTrash) throw new Error('Project niet gevonden.');
      const update: Partial<Project> = { updatedAt: Date.now() };
      if (typeof params.title === 'string' && params.title.trim()) update.title = params.title.trim();
      if (typeof params.description === 'string') update.description = params.description;
      if (typeof params.color === 'string') update.color = params.color;
      if (Array.isArray(params.tags)) update.tags = sanitizeTags(params.tags.filter((tag): tag is string => typeof tag === 'string'));
      await db.projects.update(projectId, update);
      return await db.projects.get(projectId);
    }
    case 'update_block':
      return await updateBlock(params);
    case 'append_to_block':
      return await appendToBlock(params);
    case 'list_todos': {
      const projectId = optionalString(params, 'projectId');
      const blockId = optionalString(params, 'blockId');
      const blocks = blockId
        ? [await db.blocks.get(blockId)].filter((block): block is Block => Boolean(block && !block.isTrash))
        : await db.blocks.filter(block => !block.isTrash && (!projectId || block.projectId === projectId)).toArray();
      return blocks.flatMap(todosFromBlock).filter(todo => params.completed === undefined || todo.completed === params.completed).slice(0, clampLimit(params.limit, 100));
    }
    case 'add_todo':
      return await addTodo(params);
    case 'set_todo_status':
      return await setTodoStatus(params);
    default:
      throw new Error(`Onbekende DeepScribe-methode: ${method}`);
  }
}
