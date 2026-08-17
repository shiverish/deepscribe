import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DirectWorkspaceStore } from './direct-store.mjs';

const roots: string[] = [];

function temporaryWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-direct-store-test-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('DirectWorkspaceStore offline MCP engine', () => {
  it('handles status and returns direct-sqlite mode', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const status = await store.handleRequest('status', {});
      expect(status).toMatchObject({
        app: 'DeepScribe',
        projects: 0,
        blocks: 0,
        workspacePath: wsPath,
        mode: 'direct-sqlite'
      });
    } finally {
      store.close();
    }
  });

  it('creates, lists and reads projects and blocks offline', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', {
        title: 'Offline Project',
        description: 'Created by offline agent',
        tags: ['offline', 'agent-test']
      });
      expect(project.id).toMatch(/^proj-/);
      expect(project.title).toBe('Offline Project');

      const rootBlock = await store.handleRequest('create_block', {
        projectId: project.id,
        title: 'Hoofdblok',
        content: '# Welkom\n\nDit is een offline blok met markdown.',
        tags: ['intro']
      });
      expect(rootBlock.id).toMatch(/^block-/);
      expect(rootBlock.plainText).toContain('Welkom Dit is een offline blok');

      const childBlock = await store.handleRequest('create_block', {
        projectId: project.id,
        parentId: rootBlock.id,
        title: 'Kindblok',
        content: 'Subcontext hier.'
      });

      const blockDetail = await store.handleRequest('get_block', { blockId: childBlock.id });
      expect(blockDetail.path).toHaveLength(2);
      expect(blockDetail.path[0].title).toBe('Hoofdblok');
      expect(blockDetail.path[1].title).toBe('Kindblok');

      const list = await store.handleRequest('list_blocks', { projectId: project.id, recursive: true });
      expect(list).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it('creates structured work items and manages todos offline', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Todo Project' });
      const workItem = await store.handleRequest('create_work_item', {
        projectId: project.id,
        title: 'Implementeer offline modus',
        goal: 'Directe SQLite toegang toevoegen',
        context: 'Zodat agents 24/7 kunnen werken zonder open venster',
        acceptanceCriteria: ['Tests slagen', 'Smoke test werkt']
      });

      expect(workItem.tags).toContain('todo');
      expect(workItem.tags).toContain('agent-ready');
      expect(workItem.content).toContain('<h2>Doel</h2>');
      expect(workItem.content).toContain('<h2>Context</h2>');

      const todos = await store.handleRequest('add_todo', {
        blockId: workItem.id,
        text: 'Nieuwe subtaak toevoegen'
      });
      expect(todos).toHaveLength(1);
      expect(todos[0].text).toBe('Nieuwe subtaak toevoegen');
      expect(todos[0].completed).toBe(false);

      const toggled = await store.handleRequest('set_todo_status', {
        blockId: workItem.id,
        taskIndex: 0,
        completed: true
      });
      expect(toggled.completed).toBe(true);

      const openTodos = await store.handleRequest('list_todos', { blockId: workItem.id, completed: false });
      expect(openTodos).toHaveLength(0);

      const doneTodos = await store.handleRequest('list_todos', { blockId: workItem.id, completed: true });
      expect(doneTodos).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('performs local search and semantic ranking on blocks', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Game Development' });
      await store.handleRequest('create_block', {
        projectId: project.id,
        title: 'Kwantum fysica puzzel gameplay',
        content: 'Systemische puzzels met quantum mechanics en experimenten.',
        tags: ['puzzle', 'gameplay']
      });
      await store.handleRequest('create_block', {
        projectId: project.id,
        title: 'Recepten en maaltijden app',
        content: 'Koken, ingrediënten en weekplanning.',
        tags: ['food', 'moxxi']
      });

      const results = await store.handleRequest('search', { query: 'quantum puzzel' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toContain('Kwantum');

      const tagResults = await store.handleRequest('search', { tags: ['moxxi'] });
      expect(tagResults).toHaveLength(1);
      expect(tagResults[0].title).toContain('Recepten');
    } finally {
      store.close();
    }
  });

  it('generates and updates daily plans aggregating open tasks', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const projA = await store.handleRequest('create_project', { title: 'Project A' });
      const blockA = await store.handleRequest('create_block', {
        projectId: projA.id,
        title: 'Features',
        content: 'Open werk'
      });
      await store.handleRequest('add_todo', { blockId: blockA.id, text: 'Fix bug 101' });

      const plan = await store.handleRequest('get_or_create_daily_plan', {
        date: '2026-08-17',
        focus: 'Offline agent architectuur afronden'
      });

      expect(plan.title).toContain('Dagplanning');
      expect(plan.content).toContain('Offline agent architectuur afronden');
      expect(plan.content).toContain('Fix bug 101');
      expect(plan.tags).toContain('date-2026-08-17');
    } finally {
      store.close();
    }
  });

  it('reads attachments stored on disk', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Project with Attachments' });
      const block = await store.handleRequest('create_block', { projectId: project.id, title: 'Document Block' });

      const projectAttachDir = path.join(wsPath, 'attachments', project.id);
      fs.mkdirSync(projectAttachDir, { recursive: true });
      const testFilePath = path.join(projectAttachDir, 'document.txt');
      fs.writeFileSync(testFilePath, 'Geheime offline document inhoud', 'utf8');

      const attachment = {
        id: 'att-test-1',
        blockId: block.id,
        fileName: 'document.txt',
        fileType: 'text/plain',
        fileSize: 32,
        localPath: path.relative(wsPath, testFilePath),
        createdAt: Date.now()
      };

      store.database.prepare('INSERT INTO attachments (id, block_id, json) VALUES (?, ?, ?)')
        .run(attachment.id, block.id, JSON.stringify(attachment));

      const list = await store.handleRequest('list_attachments', { blockId: block.id });
      expect(list).toHaveLength(1);
      expect(list[0].fileName).toBe('document.txt');

      const readResult = await store.handleRequest('read_attachment', { attachmentId: attachment.id });
      expect(readResult.fileName).toBe('document.txt');
      const text = Buffer.from(readResult.dataBase64, 'base64').toString('utf8');
      expect(text).toBe('Geheime offline document inhoud');
    } finally {
      store.close();
    }
  });

  it('manages block revisions and snapshot history in direct SQLite mode', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Direct Revisions Project' });
      const block = await store.handleRequest('create_block', {
        projectId: project.id,
        title: 'Versie 1 Titel',
        content: 'Tekst versie 1',
        tags: ['v1']
      });

      const initialRevs = await store.handleRequest('list_block_revisions', { blockId: block.id });
      expect(initialRevs).toHaveLength(1);
      expect(initialRevs[0].title).toBe('Versie 1 Titel');
      expect(initialRevs[0].source).toBe('agent');

      // Update block
      await store.handleRequest('update_block', {
        blockId: block.id,
        title: 'Versie 2 Titel',
        content: 'Tekst versie 2'
      });

      const updatedRevs = await store.handleRequest('list_block_revisions', { blockId: block.id });
      expect(updatedRevs.length).toBeGreaterThanOrEqual(2);
      expect(updatedRevs[0].title).toBe('Versie 2 Titel');

      // Get single revision
      const rev1 = await store.handleRequest('get_block_revision', { revisionId: initialRevs[0].id });
      expect(rev1.title).toBe('Versie 1 Titel');

      // Restore to initial revision
      const restored = await store.handleRequest('restore_block_revision', { revisionId: initialRevs[0].id });
      expect(restored.title).toBe('Versie 1 Titel');
      expect(restored.content).toContain('Tekst versie 1');

      const currentBlock = await store.handleRequest('get_block', { blockId: block.id });
      expect(currentBlock.title).toBe('Versie 1 Titel');
    } finally {
      store.close();
    }
  });

  it('handles task dependencies (dependsOn) and prevents cycles in direct SQLite mode', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Direct Dependency Project' });
      const taskA = await store.handleRequest('create_work_item', {
        projectId: project.id,
        title: 'Taak A: Basis API',
        goal: 'Bouw de API endpoint',
        context: 'Nodig voor de frontend client',
        acceptanceCriteria: ['API reageert']
      });

      const taskB = await store.handleRequest('create_work_item', {
        projectId: project.id,
        title: 'Taak B: Frontend Client',
        goal: 'Bouw de UI componenten',
        context: 'Wacht op de Basis API',
        acceptanceCriteria: ['UI toont data'],
        dependsOn: [taskA.id]
      });

      expect(taskB.dependsOn).toEqual([taskA.id]);

      // Check dependencies of Task B
      const depsB = await store.handleRequest('get_block_dependencies', { blockId: taskB.id });
      expect(depsB.isBlocked).toBe(true);
      expect(depsB.pendingDependencies).toHaveLength(1);
      expect(depsB.pendingDependencies[0].id).toBe(taskA.id);

      // Check circular dependency prevention
      await expect(store.handleRequest('update_block', {
        blockId: taskA.id,
        dependsOn: [taskB.id]
      })).rejects.toThrow(/Circulaire afhankelijkheid/);

      // Complete Task A and verify Task B unblocked
      await store.handleRequest('update_block', {
        blockId: taskA.id,
        tags: ['done']
      });

      const depsBAfter = await store.handleRequest('get_block_dependencies', { blockId: taskB.id });
      expect(depsBAfter.isBlocked).toBe(false);
      expect(depsBAfter.pendingDependencies).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it('supports get_project_context and update_project_scratchpad in direct SQLite mode (Feature C)', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', {
        title: 'SQLite Scratchpad Project',
        description: 'Direct mode scratchpad test',
        scratchpad: '# Initial Context\n\n- SQLite direct storage active'
      });

      expect(project.scratchpad).toContain('SQLite direct storage active');

      await store.handleRequest('create_work_item', {
        projectId: project.id,
        title: 'Direct Task 1',
        goal: 'Uitvoeren van offline taak',
        context: 'Nodig voor validatie',
        acceptanceCriteria: ['Taak is aangemaakt']
      });

      const context = await store.handleRequest('get_project_context', { projectId: project.id });
      expect(context.title).toBe('SQLite Scratchpad Project');
      expect(context.scratchpad).toContain('SQLite direct storage active');
      expect(context.totalBlocks).toBe(1);
      expect(context.openTaskCount).toBe(1);
      expect(context.openTasks[0].blockTitle).toBe('Direct Task 1');

      // Append
      const updated = await store.handleRequest('update_project_scratchpad', {
        projectId: project.id,
        content: '## Besluit Offline\n\n- Direct SQLite engine is stabiel',
        append: true
      });

      expect(updated.scratchpad).toContain('Initial Context');
      expect(updated.scratchpad).toContain('Besluit Offline');

      const reloadedContext = await store.handleRequest('get_project_context', { projectId: project.id });
      expect(reloadedContext.scratchpad).toBe(updated.scratchpad);
    } finally {
      store.close();
    }
  });

  it('records and queries activity stream with filters in direct SQLite mode (Feature E)', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const proj = await store.handleRequest('create_project', { title: 'Direct Activity Project' });

      await store.handleRequest('record_activity', {
        projectId: proj.id,
        action: 'agent-build',
        summary: 'Agent startte automatische build',
        source: 'agent'
      });

      await store.handleRequest('record_activity', {
        projectId: proj.id,
        action: 'user-note',
        summary: 'Gebruiker voegde notitie toe',
        source: 'user'
      });

      const all = await store.handleRequest('list_activities', {});
      expect(all.length).toBeGreaterThanOrEqual(3);

      const agentOnly = await store.handleRequest('list_activities', { source: 'agent' });
      expect(agentOnly.every(a => a.source === 'agent')).toBe(true);
      expect(agentOnly.some(a => a.summary.includes('automatische build'))).toBe(true);

      const projOnly = await store.handleRequest('list_activities', { projectId: proj.id });
      expect(projOnly.every(a => a.projectId === proj.id)).toBe(true);
    } finally {
      store.close();
    }
  });
});

