import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DirectWorkspaceStore, markdownToHtml } from './direct-store.mjs';

const roots: string[] = [];

function temporaryWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-direct-store-test-'));
  roots.push(root);
  return root;
}

function insertUserTask(store: DirectWorkspaceStore, projectId: string, parentId: string | null, title: string, options: { status?: string; agentTarget?: string; dependsOn?: string[]; taskNumber?: number } = {}) {
  const now = Date.now();
  const block = { id: `task-${crypto.randomUUID()}`, projectId, parentId, title, content: '<p>Free task notes</p>', plainText: 'Free task notes', order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], dependsOn: options.dependsOn, kind: 'task', task: { status: options.status ?? 'inbox', agentTarget: options.agentTarget ?? 'none', position: now, ...(options.status === 'ready' ? { readyAt: now } : {}), ...(options.taskNumber ? { taskNumber: options.taskNumber } : {}) }, isTrash: false, createdAt: now, updatedAt: now };
  store.saveBlock(block);
  return block;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('DirectWorkspaceStore Markdown formatting', () => {
  it('preserves an intentional empty editor paragraph after two blank lines', () => {
    expect(markdownToHtml('Beschrijving.\n\nDialoog.'))
      .toBe('<p>Beschrijving.</p><p>Dialoog.</p>');
    expect(markdownToHtml('Beschrijving.\n\n\nDialoog.'))
      .toBe('<p>Beschrijving.</p><p></p><p>Dialoog.</p>');
  });
});

describe('DirectWorkspaceStore HTML content entry', () => {
  it('stores agent HTML as real nodes and keeps injected markup out', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'HTML invoer' });
      const created = await store.handleRequest('create_block', {
        projectId: project.id,
        title: 'Blok',
        content: '<h2>Doel</h2><p>Inhoud</p>'
      });
      expect(created.content).toBe('<h2>Doel</h2><p>Inhoud</p>');
      expect(created.content).not.toContain('&lt;');

      const updated = await store.handleRequest('update_block', {
        blockId: created.id,
        content: '<p>Bijgewerkt<script>alert(1)</script></p>'
      });
      expect(updated.content).toBe('<p>Bijgewerkt</p>');
      expect(updated.taskCount).toBe(0);

      const appended = await store.handleRequest('append_to_block', {
        blockId: created.id,
        text: '<p>Nagekomen <a href="javascript:alert(1)">link</a></p>'
      });
      expect(appended.content).toBe('<p>Bijgewerkt</p><p>Nagekomen <a>link</a></p>');
    } finally {
      store.close?.();
    }
  });

  it('creates a task from HTML without showing the tags to the user', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Taken' });
      const task = await store.handleRequest('create_task', {
        projectId: project.id,
        title: 'Taak uit HTML',
        content: '<h2>Doel</h2><p>Inhoud</p>',
        agentId: 'claude-1',
        agentTarget: 'claude',
        requestId: 'html-task-1'
      });
      expect(task.content).toBe('<h2>Doel</h2><p>Inhoud</p>');
      expect(task.plainText).toBe('Doel Inhoud');
      expect(task.taskCount).toBe(0);
    } finally {
      store.close?.();
    }
  });

  it('still escapes Markdown that only mentions a tag', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Markdown invoer' });
      const created = await store.handleRequest('create_block', {
        projectId: project.id,
        title: 'Blok',
        content: '**Status:** <script>alert(1)</script> klaar.'
      });
      expect(created.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    } finally {
      store.close?.();
    }
  });
});

describe('DirectWorkspaceStore search over projects and blocks', () => {
  it('finds a decision recorded only in a project scratchpad', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', {
        title: 'From Inside',
        scratchpad: '## Aanbevolen boekuitvoering\n\nCremekleurig papier en een serif zoals Garamond.'
      });
      await store.handleRequest('create_block', { projectId: project.id, title: 'Hoofdstuk 1', content: 'Zij liep de kamer in.' });

      const results = await store.handleRequest('search', { query: 'garamond' });
      const hit = results.find((result: { resultType: string }) => result.resultType === 'project');
      expect(hit).toMatchObject({ resultType: 'project', id: project.id, title: 'From Inside', heading: 'Aanbevolen boekuitvoering' });
      expect(hit.snippet.toLowerCase()).toContain('garamond');
      expect(typeof hit.score).toBe('number');
      expect(hit.matchReasons).toContain('body');
    } finally {
      store.close();
    }
  });

  it('marks block hits as blocks and honours the project filter', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const wanted = await store.handleRequest('create_project', { title: 'Gewenst', scratchpad: 'Zoekterm alpha.' });
      const other = await store.handleRequest('create_project', { title: 'Ander', scratchpad: 'Zoekterm alpha.' });
      await store.handleRequest('create_block', { projectId: wanted.id, title: 'Blok', content: 'Zoekterm alpha in een blok.' });

      const all = await store.handleRequest('search', { query: 'alpha' });
      expect(all.filter((result: { resultType: string }) => result.resultType === 'project')).toHaveLength(2);
      expect(all.some((result: { resultType: string }) => result.resultType === 'block')).toBe(true);

      const scoped = await store.handleRequest('search', { query: 'alpha', projectId: wanted.id });
      expect(scoped.every((result: { id: string; projectId?: string }) => result.id === wanted.id || result.projectId === wanted.id)).toBe(true);
      expect(scoped.some((result: { id: string }) => result.id === other.id)).toBe(false);
    } finally {
      store.close();
    }
  });
});

describe('DirectWorkspaceStore knowledge graph', () => {
  it('links blocks across projects and traverses the graph in both directions', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const research = await store.handleRequest('create_project', { title: 'Onderzoek' });
      const product = await store.handleRequest('create_project', { title: 'Product' });
      const finding = await store.handleRequest('create_block', { projectId: research.id, title: 'Bevinding' });
      const decision = await store.handleRequest('create_block', { projectId: product.id, title: 'Besluit' });
      const followUp = await store.handleRequest('create_block', { projectId: product.id, title: 'Vervolg' });

      const link = await store.handleRequest('link_blocks', {
        sourceBlockId: decision.id, targetBlockId: finding.id, type: 'derived-from'
      });
      expect(link).toMatchObject({ created: true, type: 'derived-from' });

      // Repeating the same relation is idempotent.
      const again = await store.handleRequest('link_blocks', {
        sourceBlockId: decision.id, targetBlockId: finding.id, type: 'derived-from'
      });
      expect(again).toMatchObject({ created: false, id: link.id });

      await store.handleRequest('link_blocks', { sourceBlockId: followUp.id, targetBlockId: decision.id });

      // A backlink counts as a step, so the finding reaches the decision.
      const direct = await store.handleRequest('get_related', { blockId: finding.id });
      expect(direct.related).toHaveLength(1);
      expect(direct.related[0]).toMatchObject({
        id: decision.id, direction: 'incoming', type: 'derived-from', distance: 1, crossProject: true, projectTitle: 'Product'
      });

      const deeper = await store.handleRequest('get_related', { blockId: finding.id, depth: 2 });
      expect(deeper.related.map((entry: { id: string }) => entry.id)).toEqual([decision.id, followUp.id]);
      expect(deeper.related[1]).toMatchObject({ distance: 2, crossProject: true });

      const filtered = await store.handleRequest('get_related', { blockId: finding.id, depth: 2, types: ['derived-from'] });
      expect(filtered.related.map((entry: { id: string }) => entry.id)).toEqual([decision.id]);
    } finally {
      store.close();
    }
  });

  it('keeps a relation intact when the target block is renamed', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Hernoemen' });
      const target = await store.handleRequest('create_block', { projectId: project.id, title: 'Oude titel' });
      const source = await store.handleRequest('create_block', { projectId: project.id, title: 'Bron' });
      await store.handleRequest('link_blocks', { sourceBlockId: source.id, targetBlockId: target.id });

      const renamed = { ...store.getBlock(target.id), title: 'Heel andere titel', updatedAt: Date.now() };
      store.saveBlock(renamed);

      const related = await store.handleRequest('get_related', { blockId: source.id });
      expect(related.related[0]).toMatchObject({ id: target.id, title: 'Heel andere titel' });
    } finally {
      store.close();
    }
  });

  it('refuses a link to itself or to a block that does not exist', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Weigeringen' });
      const block = await store.handleRequest('create_block', { projectId: project.id, title: 'Blok' });

      await expect(store.handleRequest('link_blocks', { sourceBlockId: block.id, targetBlockId: block.id }))
        .rejects.toThrow(/cannot be linked to itself/i);
      await expect(store.handleRequest('link_blocks', { sourceBlockId: block.id, targetBlockId: 'block-bestaat-niet' }))
        .rejects.toThrow(/not found/i);
    } finally {
      store.close();
    }
  });

  it('creates a relation from a wiki link written by an agent', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Wiki' });
      const target = await store.handleRequest('create_block', { projectId: project.id, title: 'Doelblok' });
      const source = await store.handleRequest('create_block', { projectId: project.id, title: 'Bron' });

      await store.handleRequest('update_block', { blockId: source.id, content: 'Zie [[Doelblok]] voor details.' });

      const related = await store.handleRequest('get_related', { blockId: source.id });
      expect(related.related.map((entry: { id: string }) => entry.id)).toEqual([target.id]);
      expect(related.related[0]).toMatchObject({ direction: 'outgoing', type: 'relates-to' });
    } finally {
      store.close();
    }
  });
});

describe('DirectWorkspaceStore offline MCP engine', () => {
  it('uses the same leased claim and idempotency rules offline', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Offline pickup' });
      const parent = await store.handleRequest('create_block', { projectId: project.id, title: 'Planning' });
      const task = insertUserTask(store, project.id, parent.id, 'Offline taak', { status: 'ready', agentTarget: 'any' });
      const claim = await store.handleRequest('claim_next_work_item', {
        projectId: project.id, agentId: 'claude-1', agentTarget: 'claude', requestId: 'offline-request', leaseSeconds: 60
      });
      expect(claim.block.id).toBe(task.id);
      expect(claim.block.task.claim.token).toBe('[redacted]');
      const replay = await store.handleRequest('claim_next_work_item', {
        projectId: project.id, agentId: 'claude-1', agentTarget: 'claude', requestId: 'offline-request'
      });
      expect(replay).toMatchObject({ claimToken: claim.claimToken, replayed: true });
      await expect(store.handleRequest('renew_work_item_claim', {
        blockId: task.id, agentId: 'claude-1', claimToken: 'wrong'
      })).rejects.toThrow(/ongeldig/);
      const stored = store.getBlock(task.id);
      store.saveBlock({ ...stored, task: { ...stored.task, claim: { ...stored.task.claim, expiresAt: Date.now() - 1 } } });
      const takeover = await store.handleRequest('claim_next_work_item', {
        projectId: project.id, agentId: 'gemini-1', agentTarget: 'gemini', requestId: 'takeover-request', leaseSeconds: 60
      });
      expect(takeover.block.task.claim).toMatchObject({ ownerId: 'gemini-1', attempt: 2, token: '[redacted]' });
      await expect(store.handleRequest('transition_work_item', {
        blockId: task.id, agentId: 'claude-1', claimToken: claim.claimToken, status: 'review'
      })).rejects.toThrow(/ongeldig/);
      const done = await store.handleRequest('transition_work_item', {
        blockId: task.id, agentId: 'gemini-1', claimToken: takeover.claimToken, status: 'done', acceptanceChecksPassed: true
      });
      expect(done.task.status).toBe('done');
      expect(done.task.claim).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it('claims a selected task without claiming an earlier task', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Selected offline claim' });
      const parent = await store.handleRequest('create_block', { projectId: project.id, title: 'Planning' });
      const first = insertUserTask(store, project.id, parent.id, 'First task', { status: 'ready', agentTarget: 'openai' });
      const selected = insertUserTask(store, project.id, parent.id, 'Selected task', { status: 'ready', agentTarget: 'openai' });
      const claim = await store.handleRequest('claim_work_item', {
        blockId: selected.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'selected-offline', leaseSeconds: 60
      });
      expect(claim).toMatchObject({ block: { id: selected.id, task: { status: 'in-progress', claim: { token: '[redacted]' } } }, replayed: false });
      expect(store.getBlock(first.id).task.status).toBe('ready');
      const replay = await store.handleRequest('claim_work_item', {
        blockId: selected.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'selected-offline'
      });
      expect(replay).toMatchObject({ claimToken: claim.claimToken, replayed: true });
      await expect(store.handleRequest('claim_work_item', {
        blockId: first.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'selected-offline'
      })).rejects.toThrow(/different task/i);
    } finally {
      store.close();
    }
  });

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

      const now = Date.now();
      store.saveProject({
        id: 'proj-system-task-inbox',
        title: 'Workspace Inbox',
        description: 'Internal workspace container for unassigned tasks.',
        color: '#A78BFA',
        order: Number.MAX_SAFE_INTEGER,
        tags: [],
        systemKind: 'task-inbox',
        isTrash: false,
        createdAt: now,
        updatedAt: now
      });
      const visibleProjects = await store.handleRequest('list_projects', {});
      expect(visibleProjects.map((item: { id: string }) => item.id)).toEqual([project.id]);
      expect((await store.handleRequest('status', {})).projects).toBe(1);

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

  it('moves complete block trees safely and normalizes both parent branches offline', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Boomproject' });
      const sourceParent = await store.handleRequest('create_block', { projectId: project.id, title: 'Bronmap' });
      const moved = await store.handleRequest('create_block', { projectId: project.id, parentId: sourceParent.id, title: 'Te verplaatsen' });
      const descendant = await store.handleRequest('create_block', { projectId: project.id, parentId: moved.id, title: 'Onderliggend blok' });
      const targetParent = await store.handleRequest('create_block', { projectId: project.id, title: 'Doelmap' });
      const target = await store.handleRequest('create_block', { projectId: project.id, parentId: targetParent.id, title: 'Bestaand kind' });

      const result = await store.handleRequest('move_block', {
        blockId: moved.id,
        targetBlockId: target.id,
        position: 'below'
      });

      expect(result.parentId).toBe(targetParent.id);
      expect(result.order).toBe(1);
      expect(result.path.map((part: { title: string }) => part.title)).toEqual(['Doelmap', 'Te verplaatsen']);
      expect((await store.handleRequest('get_block', { blockId: descendant.id })).path).toHaveLength(3);
      expect((await store.handleRequest('get_block', { blockId: sourceParent.id })).childCount).toBe(0);
      expect((await store.handleRequest('get_block', { blockId: targetParent.id })).childCount).toBe(2);

      await expect(store.handleRequest('move_block', {
        blockId: moved.id,
        targetBlockId: descendant.id,
        position: 'inside'
      })).rejects.toThrow(/eigen onderliggende boom/);
    } finally {
      store.close();
    }
  });

  it('allows only create_task to create agent tasks offline', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Todo Project' });
      const regular = await store.handleRequest('create_block', { projectId: project.id, title: 'Knowledge' });
      await expect(store.handleRequest('create_work_item', { projectId: project.id, title: 'No' })).rejects.toThrow(/cannot create tasks/i);
      await expect(store.handleRequest('create_task_block', { projectId: project.id, title: 'No' })).rejects.toThrow(/cannot create tasks/i);
      await expect(store.handleRequest('add_todo', { blockId: regular.id, text: 'No' })).rejects.toThrow(/cannot create|Unknown/i);
      await expect(store.handleRequest('create_block', { projectId: project.id, title: 'No todo', content: '- [ ] Hidden task' })).rejects.toThrow(/inline todos/i);
    } finally {
      store.close();
    }
  });

  it('creates attributed Inbox tasks idempotently in direct SQLite mode', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Direct Target' });
      const parent = await store.handleRequest('create_block', { projectId: project.id, title: 'Parent' });
      const providers = [
        { agentTarget: 'openai', agentId: 'codex-1', requestId: 'same-request' },
        { agentTarget: 'claude', agentId: 'claude-1', requestId: 'same-request' },
        { agentTarget: 'gemini', agentId: 'gemini-1', requestId: 'same-request' },
        { agentTarget: 'custom', customAgentName: 'Local Agent', agentId: 'local-1', requestId: 'same-request' }
      ];
      const created = [];
      for (const [index, provider] of providers.entries()) {
        const task = await store.handleRequest('create_task', { ...provider, title: `Offline agent task ${index + 1}`, content: index === 0 ? 'Free **notes**.' : undefined });
        const stored = store.getBlock(task.id);
        expect(task.projectId).toBeNull();
        expect(stored).toMatchObject({ projectId: 'proj-system-task-inbox', parentId: null, kind: 'task', task: { status: 'inbox', agentTarget: 'any', position: index, creator: { type: 'agent', agentTarget: provider.agentTarget, agentId: provider.agentId, requestId: provider.requestId } } });
        created.push(task);
      }
      const replay = await store.handleRequest('create_task', { ...providers[0], title: 'Changed retry title' });
      expect(replay.id).toBe(created[0].id);
      expect(store.getBlock(created[0].id).title).toBe('Offline agent task 1');
      expect(store.getBlock(created[0].id).content).toContain('<strong>notes</strong>');
      const edited = await store.handleRequest('update_block', { blockId: created[0].id, content: 'Agent report' });
      expect(edited.content).toContain('Agent report');
      await expect(store.handleRequest('update_block', { blockId: created[0].id, title: 'Renamed by agent' })).rejects.toThrow(/cannot rename a task/i);
      const completed = await store.handleRequest('update_task_status', { blockId: created[0].id, status: 'done' });
      expect(completed.task.creator).toMatchObject({ type: 'agent', agentTarget: 'openai', agentId: 'codex-1', requestId: 'same-request' });
      expect((await store.handleRequest('list_projects', {})).some(project => project.id === 'proj-system-task-inbox')).toBe(false);
      await expect(store.handleRequest('create_task', { agentTarget: 'custom', agentId: 'local', requestId: 'missing-name', title: 'No' })).rejects.toThrow(/customAgentName/);
      await expect(store.handleRequest('create_task', { ...providers[0], requestId: 'inline', title: 'No checklist', content: '- [ ] hidden' })).rejects.toThrow(/inline todos/i);
      await expect(store.handleRequest('create_block', { projectId: 'proj-system-task-inbox', title: 'No regular block' })).rejects.toThrow(/Workspace Inbox/i);

      // Direct project task creation
      const projectTask = await store.handleRequest('create_task', {
        agentTarget: 'openai',
        agentId: 'codex-1',
        requestId: 'project-req-1',
        projectId: project.id,
        parentId: parent.id,
        title: 'Project Offline Task'
      });
      expect(projectTask.projectId).toBe(project.id);
      expect(projectTask.parentId).toBe(parent.id);
      expect(store.getBlock(projectTask.id)).toMatchObject({
        projectId: project.id,
        parentId: parent.id,
        kind: 'task',
        task: { status: 'inbox', agentTarget: 'any' }
      });

      // Direct project task creation with explicit assigneeTarget
      const assignedTask = await store.handleRequest('create_task', {
        agentTarget: 'openai',
        agentId: 'codex-1',
        requestId: 'assigned-offline-1',
        assigneeTarget: 'gemini',
        projectId: project.id,
        parentId: parent.id,
        title: 'Assigned Gemini Task'
      });
      expect(assignedTask.task.agentTarget).toBe('gemini');
      expect(store.getBlock(assignedTask.id).task.agentTarget).toBe('gemini');
      expect(store.getBlock(assignedTask.id).task.creator).toMatchObject({
        type: 'agent',
        agentTarget: 'openai',
        agentId: 'codex-1',
        requestId: 'assigned-offline-1'
      });

      // Custom assignee with custom name
      const customAssigned = await store.handleRequest('create_task', {
        agentTarget: 'claude',
        agentId: 'claude-1',
        requestId: 'custom-offline-1',
        assigneeTarget: 'custom',
        assigneeCustomAgentName: 'OfflineBot',
        title: 'Custom Offline Task'
      });
      expect(customAssigned.task.agentTarget).toBe('custom');
      expect(customAssigned.task.customAgentName).toBe('OfflineBot');

      // Custom assignee without name
      await expect(store.handleRequest('create_task', {
        agentTarget: 'claude',
        agentId: 'claude-1',
        requestId: 'custom-offline-fail',
        assigneeTarget: 'custom',
        title: 'Fail'
      })).rejects.toThrow(/assigneeCustomAgentName is required/i);

      // Invalid assigneeTarget
      await expect(store.handleRequest('create_task', {
        agentTarget: 'openai',
        agentId: 'codex-1',
        requestId: 'invalid-assignee-req',
        assigneeTarget: 'invalid_target',
        title: 'Task'
      })).rejects.toThrow(/assigneeTarget is invalid/i);

      // Error checks
      await expect(store.handleRequest('create_task', {
        agentTarget: 'openai',
        agentId: 'codex-1',
        requestId: 'invalid-proj-req',
        projectId: 'non-existent-proj',
        title: 'Task'
      })).rejects.toThrow(/Project niet gevonden/i);

      await expect(store.handleRequest('create_task', {
        agentTarget: 'openai',
        agentId: 'codex-1',
        requestId: 'invalid-parent-req',
        projectId: project.id,
        parentId: 'non-existent-parent',
        title: 'Task'
      })).rejects.toThrow(/Bovenliggend blok niet gevonden/i);
    } finally {
      store.close();
    }
  });

  it('keeps typed task behavior equal in direct SQLite mode', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Taken' });
      const parent = await store.handleRequest('create_block', { projectId: project.id, title: 'Planning' });
      const task = insertUserTask(store, project.id, parent.id, 'Offline taak', { agentTarget: 'any' });
      expect(task.kind).toBe('task');
      expect(task.task).toMatchObject({ status: 'inbox', agentTarget: 'any' });
      const ready = await store.handleRequest('update_task_status', { blockId: task.id, status: 'ready' });
      expect(ready.task.status).toBe('ready');
      const done = await store.handleRequest('update_task_status', { blockId: task.id, status: 'done' });
      expect(done.task.status).toBe('done');
      const changed = await store.handleRequest('update_block', { blockId: task.id, content: 'Agent notes' });
      expect(changed.content).toContain('Agent notes');
      const appended = await store.handleRequest('append_to_block', { blockId: task.id, text: 'Delivery report' });
      expect(appended.content).toContain('Agent notes');
      expect(appended.content).toContain('Delivery report');
      await expect(store.handleRequest('update_block', { blockId: task.id, title: 'Renamed' })).rejects.toThrow(/cannot rename a task/i);
      await expect(store.handleRequest('update_block', { blockId: task.id, status: 'ready' })).rejects.toThrow(/status, assignment or position/i);
      expect(store.getBlock(task.id).title).toBe('Offline taak');
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

  it('does not generate automatic task plans', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const projA = await store.handleRequest('create_project', { title: 'Project A' });
      await expect(store.handleRequest('get_or_create_daily_plan', {
        date: '2026-08-17',
        focus: 'Offline agent architectuur afronden'
      })).rejects.toThrow(/cannot create task plans/i);
      expect(projA.title).toBe('Project A');
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

  it('uploads a file, stores it under the project and reads the same bytes back', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Project with uploads' });
      const block = await store.handleRequest('create_block', { projectId: project.id, title: 'Design block' });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

      const uploaded = await store.handleRequest('upload_attachment', {
        blockId: block.id,
        data: png.toString('base64'),
        fileName: 'approved landing pàge.png',
        agentId: 'claude-code',
        requestId: 'upload-1'
      });
      expect(uploaded.fileName).toBe('approved landing pàge.png');
      expect(uploaded.fileType).toBe('image/png');
      expect(uploaded.fileSize).toBe(png.length);
      expect(uploaded.sha256).toBe(createHash('sha256').update(png).digest('hex'));
      expect(uploaded.uri).toBe(`deepscribe://attachment/${encodeURIComponent(uploaded.id)}`);
      expect(uploaded.localPath).toBeUndefined();

      // The bytes land in the ordinary attachments folder for the project.
      expect(fs.existsSync(path.join(wsPath, 'attachments', project.id, 'approved landing pàge.png'))).toBe(true);

      const listed = await store.handleRequest('list_attachments', { blockId: block.id });
      expect(listed.map(item => item.id)).toEqual([uploaded.id]);
      expect((await store.handleRequest('get_block', { blockId: block.id })).attachmentCount).toBe(1);

      const readBack = await store.handleRequest('read_attachment', { attachmentId: uploaded.id });
      expect(Buffer.from(readBack.dataBase64, 'base64').equals(png)).toBe(true);

      const activity = store.getAllActivities().find(entry => entry.action === 'attachment-added');
      expect(activity?.summary).toContain('approved landing pàge.png');
    } finally {
      store.close();
    }
  });

  it('makes a repeated requestId a replay and a changed payload an error', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Idempotent uploads' });
      const block = await store.handleRequest('create_block', { projectId: project.id, title: 'Block' });
      const request = {
        blockId: block.id,
        data: Buffer.from('report body').toString('base64'),
        fileName: 'report.txt',
        agentId: 'claude-code',
        requestId: 'upload-1'
      };

      const first = await store.handleRequest('upload_attachment', request);
      expect(first.replayed).toBe(false);
      const second = await store.handleRequest('upload_attachment', request);
      expect(second.replayed).toBe(true);
      expect(second.id).toBe(first.id);
      expect(await store.handleRequest('list_attachments', { blockId: block.id })).toHaveLength(1);

      await expect(store.handleRequest('upload_attachment', { ...request, data: Buffer.from('other body').toString('base64') }))
        .rejects.toThrow(/new requestId/);
      expect(await store.handleRequest('list_attachments', { blockId: block.id })).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('refuses an upload that is invalid, misdirected or covered by another claim', async () => {
    const store = new DirectWorkspaceStore({ workspacePath: temporaryWorkspace() });
    try {
      const project = await store.handleRequest('create_project', { title: 'Upload guards' });
      const block = await store.handleRequest('create_block', { projectId: project.id, title: 'Block' });
      const valid = { blockId: block.id, data: Buffer.from('x').toString('base64'), fileName: 'a.txt', agentId: 'claude-code', requestId: 'r1' };

      await expect(store.handleRequest('upload_attachment', { ...valid, blockId: 'block-does-not-exist' })).rejects.toThrow(/niet gevonden/);
      await expect(store.handleRequest('upload_attachment', { ...valid, requestId: '' })).rejects.toThrow(/requestId/);
      await expect(store.handleRequest('upload_attachment', { ...valid, agentId: '' })).rejects.toThrow(/agentId/);
      await expect(store.handleRequest('upload_attachment', { ...valid, data: 'not base64!!' })).rejects.toThrow(/valid base64/);
      await expect(store.handleRequest('upload_attachment', { ...valid, fileName: '../../escape.txt', requestId: 'r2' }))
        .resolves.toMatchObject({ fileName: 'escape.txt' });
      expect(fs.existsSync(path.join(store.workspacePath, 'attachments', project.id, 'escape.txt'))).toBe(true);

      // Nothing invalid left a file or a row behind.
      expect(await store.handleRequest('list_attachments', { blockId: block.id })).toHaveLength(1);

      const task = insertUserTask(store, project.id, null, 'Claimed task', { status: 'ready', agentTarget: 'claude' });
      await store.handleRequest('claim_work_item', { blockId: task.id, agentId: 'other-agent', agentTarget: 'claude', requestId: 'claim-1' });
      await expect(store.handleRequest('upload_attachment', { ...valid, blockId: task.id, requestId: 'r3' }))
        .rejects.toThrow();
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
      const taskA = await store.handleRequest('create_block', { projectId: project.id, title: 'Taak A: Basis API' });
      const taskB = await store.handleRequest('create_block', { projectId: project.id, title: 'Taak B: Frontend Client', dependsOn: [taskA.id] });

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

      insertUserTask(store, project.id, null, 'Direct Task 1');

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

  it('exports block to markdown, text, html and file in offline direct SQLite mode', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const proj = await store.handleRequest('create_project', { title: 'Direct Export Project' });
      const parent = await store.handleRequest('create_block', {
        projectId: proj.id,
        title: 'Main Specification',
        content: '## Architecture\n\nHere is the **spec**.'
      });
      await store.handleRequest('create_block', {
        projectId: proj.id,
        parentId: parent.id,
        title: 'Child Module',
        content: 'Nested details.'
      });

      const md = await store.handleRequest('export_block', {
        blockId: parent.id,
        format: 'markdown',
        includeChildren: true
      });
      expect(md.status).toBe('exported');
      expect(md.format).toBe('markdown');
      expect(md.content).toContain('# Main Specification');
      expect(md.content).toContain('## Child Module');
      expect(md.content).toContain('**spec**');

      const outFilePath = path.join(wsPath, 'exports', 'spec.md');
      const mdWithFile = await store.handleRequest('export_block', {
        blockId: parent.id,
        format: 'markdown',
        outputPath: outFilePath
      });
      expect(mdWithFile.filePath).toBe(path.resolve(outFilePath));
      expect(fs.existsSync(outFilePath)).toBe(true);
      expect(fs.readFileSync(outFilePath, 'utf8')).toContain('# Main Specification');

      const html = await store.handleRequest('export_block', {
        blockId: parent.id,
        format: 'html'
      });
      expect(html.status).toBe('exported');
      expect(html.format).toBe('html');
      expect(html.content).toContain('<!doctype html>');
    } finally {
      store.close();
    }
  });

  it('reads and updates export settings in offline direct SQLite mode', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const initial = await store.handleRequest('get_export_settings', {});
      expect(initial.settings.pageSize).toBe('A4');
      expect(initial.presets.a5Book).toBeDefined();

      const updated = await store.handleRequest('update_export_settings', {
        preset: 'largeText',
        headerDivider: true
      });
      expect(updated.status).toBe('updated');
      expect(updated.settings.fontSize).toBe(13);
      expect(updated.settings.margin).toBe('compact');
      expect(updated.settings.headerDivider).toBe(true);

      const reloaded = await store.handleRequest('get_export_settings', {});
      expect(reloaded.settings.fontSize).toBe(13);
      expect(reloaded.settings.headerDivider).toBe(true);
    } finally {
      store.close();
    }
  });

  it('searches, retrieves and claims tasks using human task IDs (TSK-187, #187, bare numbers)', async () => {
    const wsPath = temporaryWorkspace();
    const store = new DirectWorkspaceStore({ workspacePath: wsPath });
    try {
      const project = await store.handleRequest('create_project', { title: 'Task Search Project' });
      const parent = await store.handleRequest('create_block', { projectId: project.id, title: 'Roadmap' });
      const task = insertUserTask(store, project.id, parent.id, 'Implement Auth Middleware', { status: 'ready', agentTarget: 'openai', taskNumber: 187 });

      // Search by TSK-187, #187, 187
      const searchResults1 = await store.handleRequest('search', { query: 'TSK-187' });
      expect(searchResults1.length).toBeGreaterThan(0);
      expect(searchResults1[0].id).toBe(task.id);

      const searchResults2 = await store.handleRequest('search', { query: '#187' });
      expect(searchResults2.length).toBeGreaterThan(0);
      expect(searchResults2[0].id).toBe(task.id);

      const searchResults3 = await store.handleRequest('search', { query: '187' });
      expect(searchResults3.length).toBeGreaterThan(0);
      expect(searchResults3[0].id).toBe(task.id);

      // get_task by TSK-187, #187, 187
      const fetchedByTsk = await store.handleRequest('get_task', { taskId: 'TSK-187' });
      expect(fetchedByTsk.id).toBe(task.id);

      const fetchedByHash = await store.handleRequest('get_task', { taskId: '#187' });
      expect(fetchedByHash.id).toBe(task.id);

      const fetchedByNum = await store.handleRequest('get_task', { taskId: '187' });
      expect(fetchedByNum.id).toBe(task.id);

      // claim_work_item by TSK-187
      const claim = await store.handleRequest('claim_work_item', {
        blockId: 'TSK-187',
        agentId: 'codex-1',
        agentTarget: 'openai',
        requestId: 'claim-tsk-187',
        leaseSeconds: 120
      });
      expect(claim.block.id).toBe(task.id);
      expect(claim.block.task.status).toBe('in-progress');

      // transition_work_item by TSK-187
      const done = await store.handleRequest('transition_work_item', {
        blockId: 'TSK-187',
        agentId: 'codex-1',
        claimToken: claim.claimToken,
        status: 'done'
      });
      expect(done.id).toBe(task.id);
      expect(done.task.status).toBe('done');
    } finally {
      store.close();
    }
  });
});
