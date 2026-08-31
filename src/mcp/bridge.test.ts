import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import type { Block, Project } from '../types';
import { formatDailyPlanContent, formatWorkItemContent, handleMcpBridgeRequest, markdownToHtml } from './bridge';
import { createTaskMetadata, taskCreatorLabel, TASK_INBOX_PROJECT_ID } from '../utils/taskBlocks';

async function insertUserTask(projectId: string, parentId: string | null, title: string, task: Block['task'], dependsOn?: string[]) {
  const now = Date.now();
  const block: Block = { id: `task-${crypto.randomUUID()}`, projectId, parentId, title, content: '<p>Free task notes</p>', plainText: 'Free task notes', order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], dependsOn, kind: 'task', task, isTrash: false, createdAt: now, updatedAt: now };
  await db.blocks.add(block);
  return block;
}

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe('DeepScribe MCP project tags', () => {
  it('creates and updates normalized project tags', async () => {
    const created = await handleMcpBridgeRequest('create_project', {
      title: 'Getagd project',
      tags: [' App ', '#app', 'DESKTOP', 'ongeldige tag']
    }) as Project;
    expect(created.tags).toEqual(['app', 'desktop']);

    const updated = await handleMcpBridgeRequest('update_project', {
      projectId: created.id,
      tags: ['Concept', '#idee']
    }) as Project;
    expect(updated.tags).toEqual(['concept', 'idee']);
  });
});

describe('DeepScribe MCP work items', () => {
  it('formats goal, context and acceptance criteria instead of a title-only placeholder', () => {
    const content = formatWorkItemContent(
      'Maak zoeken slimmer en relevanter.',
      'Gebruikers vinden verwante begrippen nu niet zonder een exacte woordmatch.',
      ['Zoeken vindt ook verwante Nederlandse begrippen', 'Alle verwerking blijft lokaal']
    );
    expect(content).toContain('## Goal\n\nMaak zoeken slimmer');
    expect(content).toContain('## Context\n\nGebruikers vinden');
    expect(content).toContain('## Acceptance Criteria\n\n- Zoeken vindt');
    expect(content).toContain('- Alle verwerking blijft lokaal');
  });

  it('converts agent Markdown into readable TipTap HTML', () => {
    const html = markdownToHtml('Voorlopige rol.\nStatus: nog niet bevestigd.\n\n## Te bepalen\n\n- Naam en geschiedenis\n- Hoe dichtbij zij staat\n\n1. Eerste stap\n2. Tweede stap');
    expect(html).toContain('<p>Voorlopige rol.<br>Status: nog niet bevestigd.</p>');
    expect(html).toContain('<h2>Te bepalen</h2>');
    expect(html).toContain('<ul><li><p>Naam en geschiedenis</p></li><li><p>Hoe dichtbij zij staat</p></li></ul>');
    expect(html).toContain('<ol><li><p>Eerste stap</p></li><li><p>Tweede stap</p></li></ol>');
  });

  it('preserves intentional empty editor paragraphs without changing normal paragraph spacing', () => {
    expect(markdownToHtml('Eerste alinea.\n\nTweede alinea.'))
      .toBe('<p>Eerste alinea.</p><p>Tweede alinea.</p>');
    expect(markdownToHtml('Beschrijving.\n\n\n‘Gesproken tekst.’'))
      .toBe('<p>Beschrijving.</p><p></p><p>‘Gesproken tekst.’</p>');
    expect(markdownToHtml('\n\nBeschrijving.\n\n\n\nDialoog.\n\n'))
      .toBe('<p>Beschrijving.</p><p></p><p></p><p>Dialoog.</p>');
  });

  it('escapes raw HTML while supporting safe inline Markdown', () => {
    const html = markdownToHtml('**Status:** <script>alert(1)</script> en [bron](https://example.com).');
    expect(html).toContain('<strong>Status:</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<a href="https://example.com">bron</a>');
  });
});

describe('DeepScribe MCP HTML content entry', () => {
  it('accepts the HTML it hands back without showing the tags to the user', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'HTML invoer' }) as Project;
    const created = await handleMcpBridgeRequest('create_block', {
      projectId: project.id,
      title: 'Blok',
      content: '<h2>Doel</h2><p>Inhoud</p>'
    }) as Block;
    expect(created.content).toBe('<h2>Doel</h2><p>Inhoud</p>');
    expect(created.content).not.toContain('&lt;');

    const updated = await handleMcpBridgeRequest('update_block', {
      blockId: created.id,
      content: '<p>Bijgewerkt<script>alert(1)</script></p>'
    }) as Block;
    expect(updated.content).toBe('<p>Bijgewerkt</p>');
  });

  it('refuses an inline todo whether it arrives as Markdown or as HTML', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Todo invoer' }) as Project;
    await expect(handleMcpBridgeRequest('create_block', {
      projectId: project.id, title: 'Markdown todo', content: '- [ ] koop melk'
    })).rejects.toThrow(/inline todos/i);

    const created = await handleMcpBridgeRequest('create_block', {
      projectId: project.id,
      title: 'HTML todo',
      content: '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>koop melk</p></div></li></ul>'
    }) as Block;
    expect(created.content).not.toContain('taskItem');
    expect(created.taskCount).toBe(0);
  });
});

describe('DeepScribe MCP knowledge graph', () => {
  it('links across projects and reports direction, type and distance', async () => {
    const research = await handleMcpBridgeRequest('create_project', { title: 'Onderzoek' }) as Project;
    const product = await handleMcpBridgeRequest('create_project', { title: 'Product' }) as Project;
    const finding = await handleMcpBridgeRequest('create_block', { projectId: research.id, title: 'Bevinding' }) as Block;
    const decision = await handleMcpBridgeRequest('create_block', { projectId: product.id, title: 'Besluit' }) as Block;

    const link = await handleMcpBridgeRequest('link_blocks', {
      sourceBlockId: decision.id, targetBlockId: finding.id, type: 'supports'
    }) as { created: boolean; id: string };
    expect(link.created).toBe(true);

    const replay = await handleMcpBridgeRequest('link_blocks', {
      sourceBlockId: decision.id, targetBlockId: finding.id, type: 'supports'
    }) as { created: boolean; id: string };
    expect(replay).toMatchObject({ created: false, id: link.id });

    const related = await handleMcpBridgeRequest('get_related', { blockId: finding.id }) as {
      related: Array<{ id: string; direction: string; type: string; distance: number; crossProject: boolean; projectTitle: string }>;
    };
    expect(related.related).toHaveLength(1);
    expect(related.related[0]).toMatchObject({
      id: decision.id, direction: 'incoming', type: 'supports', distance: 1, crossProject: true, projectTitle: 'Product'
    });
  });

  it('turns an agent wiki link into a stored relation that survives a rename', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Wiki' }) as Project;
    const target = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Doelblok' }) as Block;
    const source = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Bron' }) as Block;

    await handleMcpBridgeRequest('update_block', { blockId: source.id, content: 'Zie [[Doelblok]] voor details.' });
    expect(await db.links.count()).toBe(1);

    await db.blocks.update(target.id, { title: 'Heel andere titel' });
    const related = await handleMcpBridgeRequest('get_related', { blockId: source.id }) as { related: Array<{ id: string; title: string }> };
    expect(related.related[0]).toMatchObject({ id: target.id, title: 'Heel andere titel' });
  });

  it('drops the relation again when the wiki link is removed from the text', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Wiki' }) as Project;
    await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Doelblok' });
    const source = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Bron' }) as Block;

    await handleMcpBridgeRequest('update_block', { blockId: source.id, content: 'Zie [[Doelblok]].' });
    expect(await db.links.count()).toBe(1);

    await handleMcpBridgeRequest('update_block', { blockId: source.id, content: 'Geen verwijzing meer.' });
    expect(await db.links.count()).toBe(0);
  });
});

describe('DeepScribe MCP task blocks', () => {
  it('creates attributed tasks idempotently in Workspace Inbox or in specified project', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Target Project' }) as Project;
    const parent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Parent Block' }) as Block;
    const providers = [
      { agentTarget: 'openai', agentId: 'codex-1', requestId: 'create-1', label: 'Codex/ChatGPT' },
      { agentTarget: 'claude', agentId: 'claude-1', requestId: 'create-1', label: 'Claude' },
      { agentTarget: 'gemini', agentId: 'gemini-1', requestId: 'create-1', label: 'Gemini' },
      { agentTarget: 'custom', customAgentName: 'Local Agent', agentId: 'local-1', requestId: 'create-1', label: 'Local Agent' }
    ] as const;
    const created: Block[] = [];
    for (const [index, provider] of providers.entries()) {
      const task = await handleMcpBridgeRequest('create_task', {
        ...provider,
        title: `Agent task ${index + 1}`,
        content: index === 0 ? 'Free **task** notes.' : undefined
      }) as Block;
      const stored = await db.blocks.get(task.id);
      expect(task.projectId).toBeNull();
      expect(stored).toMatchObject({ projectId: TASK_INBOX_PROJECT_ID, parentId: null, kind: 'task', task: { status: 'inbox', agentTarget: 'any', position: index, creator: { type: 'agent', agentTarget: provider.agentTarget, agentId: provider.agentId, requestId: provider.requestId } } });
      expect(taskCreatorLabel(stored?.task)).toBe(provider.label);
      created.push(task);
    }
    expect((await db.blocks.get(created[0].id))?.content).toContain('<strong>task</strong>');
    const replay = await handleMcpBridgeRequest('create_task', { ...providers[0], title: 'Changed retry title' }) as Block;
    expect(replay.id).toBe(created[0].id);
    expect((await db.blocks.get(created[0].id))?.title).toBe('Agent task 1');
    const edited = await handleMcpBridgeRequest('update_block', { blockId: created[0].id, content: 'Agent report' }) as Block;
    expect(edited.content).toContain('Agent report');
    await expect(handleMcpBridgeRequest('update_block', { blockId: created[0].id, title: 'Renamed by agent' })).rejects.toThrow(/cannot rename a task/i);
    const completed = await handleMcpBridgeRequest('update_task_status', { blockId: created[0].id, status: 'done' }) as Block;
    expect(completed.task?.creator).toMatchObject({ type: 'agent', agentTarget: 'openai', agentId: 'codex-1', requestId: 'create-1' });
    expect(await db.activities.where('action').equals('task-created').count()).toBe(4);
    await expect(handleMcpBridgeRequest('create_task', { ...providers[0], requestId: 'inline', title: 'No checklist', content: '- [ ] hidden todo' })).rejects.toThrow(/inline todos/i);
    await expect(handleMcpBridgeRequest('create_block', { projectId: TASK_INBOX_PROJECT_ID, title: 'No regular block' })).rejects.toThrow(/Workspace Inbox/i);

    // Test creating task directly attached to a project and parent
    const projectTask = await handleMcpBridgeRequest('create_task', {
      agentTarget: 'openai',
      agentId: 'codex-1',
      requestId: 'project-task-1',
      projectId: project.id,
      parentId: parent.id,
      title: 'Direct project task'
    }) as Block;
    expect(projectTask.projectId).toBe(project.id);
    expect(projectTask.parentId).toBe(parent.id);
    const storedProjectTask = await db.blocks.get(projectTask.id);
    expect(storedProjectTask).toMatchObject({
      projectId: project.id,
      parentId: parent.id,
      kind: 'task',
      task: { status: 'inbox', agentTarget: 'any' }
    });

    // Test creating task directly attached to a project and parent with explicit assigneeTarget
    const assignedTask = await handleMcpBridgeRequest('create_task', {
      agentTarget: 'openai',
      agentId: 'codex-1',
      requestId: 'assigned-task-1',
      assigneeTarget: 'claude',
      projectId: project.id,
      parentId: parent.id,
      title: 'Assigned Claude task'
    }) as Block;
    expect(assignedTask.task?.agentTarget).toBe('claude');
    const storedAssignedTask = await db.blocks.get(assignedTask.id);
    expect(storedAssignedTask?.task?.agentTarget).toBe('claude');
    expect(storedAssignedTask?.task?.creator).toMatchObject({
      type: 'agent',
      agentTarget: 'openai',
      agentId: 'codex-1',
      requestId: 'assigned-task-1'
    });

    // Test custom assignee target with custom name
    const customAssignedTask = await handleMcpBridgeRequest('create_task', {
      agentTarget: 'gemini',
      agentId: 'gemini-1',
      requestId: 'custom-assigned-1',
      assigneeTarget: 'custom',
      assigneeCustomAgentName: 'ReviewerBot',
      title: 'Custom assigned task'
    }) as Block;
    expect(customAssignedTask.task?.agentTarget).toBe('custom');
    expect(customAssignedTask.task?.customAgentName).toBe('ReviewerBot');

    // Test custom assignee without name fails
    await expect(handleMcpBridgeRequest('create_task', {
      agentTarget: 'gemini',
      agentId: 'gemini-1',
      requestId: 'custom-fail-1',
      assigneeTarget: 'custom',
      title: 'No name'
    })).rejects.toThrow(/assigneeCustomAgentName is required/i);

    // Test invalid assigneeTarget
    await expect(handleMcpBridgeRequest('create_task', {
      agentTarget: 'openai',
      agentId: 'codex-1',
      requestId: 'invalid-assignee-req',
      assigneeTarget: 'invalid_target',
      title: 'Task'
    })).rejects.toThrow(/assigneeTarget is invalid/i);

    // Test error when projectId or parentId is invalid
    await expect(handleMcpBridgeRequest('create_task', {
      agentTarget: 'openai',
      agentId: 'codex-1',
      requestId: 'invalid-proj-req',
      projectId: 'non-existent-proj',
      title: 'Task'
    })).rejects.toThrow(/Project niet gevonden/i);

    await expect(handleMcpBridgeRequest('create_task', {
      agentTarget: 'openai',
      agentId: 'codex-1',
      requestId: 'invalid-parent-req',
      projectId: project.id,
      parentId: 'non-existent-parent',
      title: 'Task'
    })).rejects.toThrow(/Bovenliggend blok niet gevonden/i);
  });

  it('lets agents write task content while identity, assignment and status stay user-owned', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Taken' }) as Project;
    const parent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Planning' }) as Block;
    await expect(handleMcpBridgeRequest('create_task_block', { projectId: project.id, parentId: parent.id, title: 'No' })).rejects.toThrow(/cannot create or edit tasks/i);
    await expect(handleMcpBridgeRequest('create_work_item', { projectId: project.id, title: 'No' })).rejects.toThrow(/cannot create or edit tasks/i);
    const task = await insertUserTask(project.id, parent.id, 'Bouw taakflow', { ...createTaskMetadata(), agentTarget: 'openai' });
    const listed = await handleMcpBridgeRequest('list_tasks', { projectId: project.id }) as Block[];
    expect(listed[0]).toMatchObject({ id: task.id, content: '<p>Free task notes</p>' });
    const changed = await handleMcpBridgeRequest('update_block', { blockId: task.id, content: 'Changed' }) as Block;
    expect(changed.content).toContain('Changed');
    const appended = await handleMcpBridgeRequest('append_to_block', { blockId: task.id, text: 'Delivery report' }) as Block;
    expect(appended.content).toContain('Changed');
    expect(appended.content).toContain('Delivery report');
    await expect(handleMcpBridgeRequest('update_block', { blockId: task.id, title: 'Renamed' })).rejects.toThrow(/cannot rename a task/i);
    await expect(handleMcpBridgeRequest('update_block', { blockId: task.id, status: 'done' })).rejects.toThrow(/status, assignment or position/i);
    await expect(handleMcpBridgeRequest('update_block', { blockId: task.id, dependsOn: ['block-other'] })).rejects.toThrow(/task dependencies/i);
    expect((await db.blocks.get(task.id))?.title).toBe('Bouw taakflow');
    const ready = await handleMcpBridgeRequest('update_task_status', { blockId: task.id, status: 'ready' }) as Block;
    expect(ready.task?.status).toBe('ready');
    const done = await handleMcpBridgeRequest('update_task_status', { blockId: task.id, status: 'done' }) as Block;
    expect(done.task?.status).toBe('done');
  });

  it('claims typed tasks atomically, idempotently and without leaking tokens', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Pickup' }) as Project;
    const parent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Planning' }) as Block;
    const task = await insertUserTask(project.id, parent.id, 'Eerste taak', { ...createTaskMetadata(), status: 'ready', agentTarget: 'openai', readyAt: Date.now() });

    const claim = await handleMcpBridgeRequest('claim_next_work_item', {
      projectId: project.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'request-1', leaseSeconds: 60
    }) as { block: Block; claimToken: string; replayed: boolean };
    expect(claim.block.id).toBe(task.id);
    expect(claim.block.task?.claim?.token).toBe('[redacted]');
    expect(claim.replayed).toBe(false);

    const replay = await handleMcpBridgeRequest('claim_next_work_item', {
      projectId: project.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'request-1'
    }) as { claimToken: string; replayed: boolean };
    expect(replay).toMatchObject({ claimToken: claim.claimToken, replayed: true });
    expect(JSON.stringify(await handleMcpBridgeRequest('get_block', { blockId: task.id }))).not.toContain(claim.claimToken);

    await expect(handleMcpBridgeRequest('append_to_block', { blockId: task.id, text: 'Sneaky note' }))
      .rejects.toThrow(/claimed by another agent/i);
    await expect(handleMcpBridgeRequest('append_to_block', { blockId: task.id, text: 'Sneaky note', agentId: 'gemini-9', claimToken: 'guess' }))
      .rejects.toThrow(/claimed by another agent/i);
    const reported = await handleMcpBridgeRequest('append_to_block', {
      blockId: task.id, text: '## Delivery report', agentId: 'codex-1', claimToken: claim.claimToken
    }) as Block;
    expect(reported.content).toContain('Delivery report');
    expect(JSON.stringify(reported)).not.toContain(claim.claimToken);

    const done = await handleMcpBridgeRequest('transition_work_item', {
      blockId: task.id, agentId: 'codex-1', claimToken: claim.claimToken, status: 'done', acceptanceChecksPassed: true
    }) as Block;
    expect(done.task?.status).toBe('done');
    expect(done.task?.claim).toBeUndefined();
  });

  it('claims a selected available task without allowing manual in-progress status changes', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Selected claim' }) as Project;
    const parent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Planning' }) as Block;
    const first = await insertUserTask(project.id, parent.id, 'First task', { ...createTaskMetadata(), status: 'ready', agentTarget: 'openai', readyAt: Date.now() });
    const selected = await insertUserTask(project.id, parent.id, 'Selected task', { ...createTaskMetadata(), status: 'ready', agentTarget: 'openai', readyAt: Date.now() + 1 });

    await expect(handleMcpBridgeRequest('update_task_status', { blockId: selected.id, status: 'in-progress' })).rejects.toThrow(/claim_work_item/i);
    const claim = await handleMcpBridgeRequest('claim_work_item', {
      blockId: selected.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'selected-claim', leaseSeconds: 60
    }) as { block: Block; claimToken: string; replayed: boolean };
    expect(claim).toMatchObject({ block: { id: selected.id, task: { status: 'in-progress', claim: { token: '[redacted]' } } }, replayed: false });
    expect((await db.blocks.get(first.id))?.task?.status).toBe('ready');

    const replay = await handleMcpBridgeRequest('claim_work_item', {
      blockId: selected.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'selected-claim'
    }) as { claimToken: string; replayed: boolean };
    expect(replay).toMatchObject({ claimToken: claim.claimToken, replayed: true });
    await expect(handleMcpBridgeRequest('claim_work_item', {
      blockId: first.id, agentId: 'codex-1', agentTarget: 'openai', requestId: 'selected-claim'
    })).rejects.toThrow(/different task/i);
  });

  it('rechecks dependencies, has one concurrent winner and takes over expired leases', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Concurrent pickup' }) as Project;
    const parent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Planning' }) as Block;
    const dependency = await insertUserTask(project.id, parent.id, 'Voorwaarde', createTaskMetadata());
    const dependent = await insertUserTask(project.id, parent.id, 'Afhankelijke taak', { ...createTaskMetadata(), status: 'ready', agentTarget: 'any', readyAt: Date.now() }, [dependency.id]);
    expect(await handleMcpBridgeRequest('list_claimable_work_items', { agentId: 'one', agentTarget: 'openai', projectId: project.id })).toEqual([]);
    await handleMcpBridgeRequest('update_task_status', { blockId: dependency.id, status: 'done' });

    const claims = await Promise.all([
      handleMcpBridgeRequest('claim_next_work_item', { agentId: 'one', agentTarget: 'openai', projectId: project.id, requestId: 'race-one', leaseSeconds: 60 }),
      handleMcpBridgeRequest('claim_next_work_item', { agentId: 'two', agentTarget: 'claude', projectId: project.id, requestId: 'race-two', leaseSeconds: 60 })
    ]) as Array<{ block: Block; claimToken: string } | null>;
    const winner = claims.find(Boolean)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(winner.block.id).toBe(dependent.id);
    await expect(handleMcpBridgeRequest('renew_work_item_claim', { blockId: dependent.id, agentId: winner.block.task?.claim?.ownerId, claimToken: 'wrong' })).rejects.toThrow(/ongeldig/);

    const stored = await db.blocks.get(dependent.id);
    await db.blocks.update(dependent.id, { task: { ...stored!.task!, claim: { ...stored!.task!.claim!, expiresAt: Date.now() - 1 } } });
    const takeover = await handleMcpBridgeRequest('claim_next_work_item', {
      agentId: 'three', agentTarget: 'gemini', projectId: project.id, requestId: 'takeover', leaseSeconds: 60
    }) as { block: Block; claimToken: string };
    expect(takeover.block.task?.claim).toMatchObject({ ownerId: 'three', attempt: 2, token: '[redacted]' });
    await expect(handleMcpBridgeRequest('transition_work_item', {
      blockId: dependent.id, agentId: 'one', claimToken: winner.claimToken, status: 'review'
    })).rejects.toThrow(/ongeldig/);
  });
});

describe('DeepScribe MCP block relocation', () => {
  it('moves a complete subtree and refuses unsafe or cross-project destinations', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Herorganisatie' }) as Project;
    const sourceParent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Bronmap' }) as Block;
    const moved = await handleMcpBridgeRequest('create_block', { projectId: project.id, parentId: sourceParent.id, title: 'Verplaats mij' }) as Block;
    const descendant = await handleMcpBridgeRequest('create_block', { projectId: project.id, parentId: moved.id, title: 'Blijft gekoppeld' }) as Block;
    const targetParent = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Doelmap' }) as Block;
    const target = await handleMcpBridgeRequest('create_block', { projectId: project.id, parentId: targetParent.id, title: 'Bestaand kind' }) as Block;

    const result = await handleMcpBridgeRequest('move_block', {
      blockId: moved.id,
      targetBlockId: target.id,
      position: 'above'
    }) as Block & { path: Array<{ title: string }> };

    expect(result.parentId).toBe(targetParent.id);
    expect(result.order).toBe(0);
    expect(result.path.map(part => part.title)).toEqual(['Doelmap', 'Verplaats mij']);
    expect((await db.blocks.get(descendant.id))?.parentId).toBe(moved.id);
    expect((await db.blocks.get(sourceParent.id))?.childCount).toBe(0);
    expect((await db.blocks.get(targetParent.id))?.childCount).toBe(2);
    expect((await db.blocks.get(target.id))?.order).toBe(1);

    await expect(handleMcpBridgeRequest('move_block', {
      blockId: moved.id,
      targetBlockId: descendant.id,
      position: 'inside'
    })).rejects.toThrow(/eigen onderliggende boom/);

    const otherProject = await handleMcpBridgeRequest('create_project', { title: 'Ander project' }) as Project;
    const foreignTarget = await handleMcpBridgeRequest('create_block', { projectId: otherProject.id, title: 'Vreemd doel' }) as Block;
    await expect(handleMcpBridgeRequest('move_block', {
      blockId: moved.id,
      targetBlockId: foreignTarget.id,
      position: 'below'
    })).rejects.toThrow(/zelfde project/);
  });
});

describe('DeepScribe MCP daily planner', () => {
  it('formats daily plan content with focus and open tasks', () => {
    const content = formatDailyPlanContent(
      'Focus op Core Hypothesis vertical slice.',
      [{ projectTitle: 'Core Hypothesis', blockTitle: 'Vertical Slice', text: 'Bouw 2D prototype' }]
    );
    expect(content).toContain('## Focus van de dag\n\nFocus op Core Hypothesis vertical slice.');
    expect(content).toContain('## Taken voor Developer (Solo Dev)');
    expect(content).toContain('## Taken voor AI-Agent(s)');
    expect(content).toContain('- [ ] **Core Hypothesis** (Vertical Slice): Bouw 2D prototype');
    expect(content).toContain('## Dagrecap & Notities');
  });

  it('does not automatically create planning projects or task lists', async () => {
    await expect(handleMcpBridgeRequest('get_or_create_daily_plan', {
      date: '2026-08-17',
      focus: 'Eerste speelbare test'
    })).rejects.toThrow(/cannot create or edit tasks/i);
  });
});

describe('DeepScribe MCP attachments', () => {
  it('lists attachment metadata on blocks and reads imported attachment data without exposing storage fields', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Bijlagenproject' }) as Project;
    const block = {
      id: 'block-attachments', projectId: project.id, parentId: null, title: 'Bronnen', content: '<p></p>', plainText: '',
      order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 1, tags: [], isTrash: false,
      createdAt: 1, updatedAt: 1
    };
    await db.blocks.add(block);
    await db.attachments.add({
      id: 'attachment-test',
      blockId: block.id,
      fileName: 'context.txt',
      fileType: 'text/plain',
      fileSize: 5,
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
      createdAt: 10
    });
    const fullBlock = await handleMcpBridgeRequest('get_block', { blockId: block.id }) as { attachments: Array<Record<string, unknown>> };
    expect(fullBlock.attachments).toEqual([expect.objectContaining({
      id: 'attachment-test',
      fileName: 'context.txt',
      uri: 'deepscribe://attachment/attachment-test'
    })]);
    expect(fullBlock.attachments[0]).not.toHaveProperty('dataUrl');
    expect(fullBlock.attachments[0]).not.toHaveProperty('localPath');

    const read = await handleMcpBridgeRequest('read_attachment', { attachmentId: 'attachment-test' }) as Record<string, unknown>;
    expect(read.dataBase64).toBe('aGVsbG8=');
    expect(read).not.toHaveProperty('dataUrl');
    expect(read).not.toHaveProperty('localPath');
  });
});

/**
 * The upload route never touches the file system itself: it hands the bytes to
 * the same guarded Electron IPC the Attachments panel uses. The stub here stands
 * in for that IPC so the bridge rules can be tested on their own.
 */
describe('DeepScribe MCP attachment uploads', () => {
  const written = new Map<string, string>();
  const removed: string[] = [];

  beforeEach(() => {
    written.clear();
    removed.length = 0;
    vi.stubGlobal('window', {
      electronAPI: {
        importAttachment: async ({ projectId, fileName, base64 }: { projectId: string; fileName: string; base64: string }) => {
          const localPath = `attachments\\${projectId}\\${fileName}`;
          if (written.has(localPath)) throw new Error('EEXIST');
          written.set(localPath, base64);
          return { localPath };
        },
        readAttachment: async (localPath: string) => written.get(localPath) ?? '',
        removeAttachment: async (localPath: string) => { removed.push(localPath); written.delete(localPath); }
      }
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function uploadTarget() {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Upload project' }) as Project;
    const block = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Design' }) as Block;
    return { project, block };
  }

  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('stores an upload as a real attachment and reads the same bytes back', async () => {
    const { block } = await uploadTarget();
    const uploaded = await handleMcpBridgeRequest('upload_attachment', {
      blockId: block.id,
      data: PNG,
      fileName: 'design/approved landing pàge.png',
      agentId: 'claude-code',
      requestId: 'upload-1'
    }) as Record<string, unknown>;

    expect(uploaded.fileName).toBe('approved landing pàge.png');
    expect(uploaded.fileType).toBe('image/png');
    expect(uploaded.fileSize).toBe(70);
    expect(uploaded.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(uploaded.replayed).toBe(false);
    expect(uploaded).not.toHaveProperty('localPath');

    expect((await db.blocks.get(block.id))?.attachmentCount).toBe(1);
    const listed = await handleMcpBridgeRequest('list_attachments', { blockId: block.id }) as Array<Record<string, unknown>>;
    expect(listed.map(item => item.id)).toEqual([uploaded.id]);

    const read = await handleMcpBridgeRequest('read_attachment', { attachmentId: uploaded.id }) as Record<string, unknown>;
    expect(read.dataBase64).toBe(PNG);
  });

  it('replays the same requestId and refuses a different payload under it', async () => {
    const { block } = await uploadTarget();
    const request = { blockId: block.id, data: PNG, fileName: 'render.png', agentId: 'claude-code', requestId: 'upload-1' };

    const first = await handleMcpBridgeRequest('upload_attachment', request) as Record<string, unknown>;
    const second = await handleMcpBridgeRequest('upload_attachment', request) as Record<string, unknown>;
    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
    expect(await db.attachments.where('blockId').equals(block.id).count()).toBe(1);
    expect((await db.blocks.get(block.id))?.attachmentCount).toBe(1);

    await expect(handleMcpBridgeRequest('upload_attachment', { ...request, data: btoa('other bytes') }))
      .rejects.toThrow(/new requestId/);
    expect(await db.attachments.where('blockId').equals(block.id).count()).toBe(1);
  });

  it('refuses an invalid upload without leaving a file or a row behind', async () => {
    const { block } = await uploadTarget();
    const valid = { blockId: block.id, data: PNG, fileName: 'render.png', agentId: 'claude-code', requestId: 'upload-1' };

    await expect(handleMcpBridgeRequest('upload_attachment', { ...valid, blockId: 'block-missing' })).rejects.toThrow();
    await expect(handleMcpBridgeRequest('upload_attachment', { ...valid, requestId: '' })).rejects.toThrow(/requestId/);
    await expect(handleMcpBridgeRequest('upload_attachment', { ...valid, data: 'not base64!!' })).rejects.toThrow(/valid base64/);
    await expect(handleMcpBridgeRequest('upload_attachment', { ...valid, fileName: 'NUL.png' })).rejects.toThrow(/reserved/);

    expect(written.size).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    expect((await db.blocks.get(block.id))?.attachmentCount).toBe(0);
  });

  it('refuses an upload onto a task another agent holds a claim on', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Claimed uploads' }) as Project;
    const task = await insertUserTask(project.id, null, 'Claimed task', { ...createTaskMetadata(0), status: 'ready', agentTarget: 'claude', readyAt: Date.now() });
    await handleMcpBridgeRequest('claim_work_item', { blockId: task.id, agentId: 'other-agent', agentTarget: 'claude', requestId: 'claim-1' });

    await expect(handleMcpBridgeRequest('upload_attachment', {
      blockId: task.id, data: PNG, fileName: 'render.png', agentId: 'claude-code', requestId: 'upload-1'
    })).rejects.toThrow();
    expect(written.size).toBe(0);
    expect(await db.attachments.count()).toBe(0);
  });
});

describe('DeepScribe MCP block revisions & diff history', () => {
  it('records revisions across agent edits and supports listing and restoring', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Revision Project' }) as Project;
    const block = await handleMcpBridgeRequest('create_block', {
      projectId: project.id,
      title: 'Origineel Blok',
      content: 'Eerste inhoud',
      tags: ['v1']
    }) as Block;

    // Initial creation should have 1 revision
    const revs1 = await handleMcpBridgeRequest('list_block_revisions', { blockId: block.id }) as Array<{ id: string; title: string; source: string }>;
    expect(revs1.length).toBe(1);
    expect(revs1[0].source).toBe('agent');
    expect(revs1[0].title).toBe('Origineel Blok');

    // Agent modifies block
    const updated = await handleMcpBridgeRequest('update_block', {
      blockId: block.id,
      title: 'Aangepast Blok',
      content: 'Gewijzigde inhoud door agent',
      tags: ['v2']
    }) as Block;
    expect(updated.title).toBe('Aangepast Blok');

    const revs2 = await handleMcpBridgeRequest('list_block_revisions', { blockId: block.id }) as Array<{ id: string; title: string; source: string }>;
    expect(revs2.length).toBe(2);
    expect(revs2[0].title).toBe('Aangepast Blok');

    // Get specific revision
    const revDetail = await handleMcpBridgeRequest('get_block_revision', { revisionId: revs1[0].id }) as { title: string; content: string };
    expect(revDetail.title).toBe('Origineel Blok');

    // Restore to v1
    const restored = await handleMcpBridgeRequest('restore_block_revision', { revisionId: revs1[0].id }) as Block;
    expect(restored.title).toBe('Origineel Blok');

    const checkBlock = await handleMcpBridgeRequest('get_block', { blockId: block.id }) as Block;
    expect(checkBlock.title).toBe('Origineel Blok');
  });
});

describe('DeepScribe MCP task dependencies (Feature A)', () => {
  it('supports dependencies on regular blocks without creating agent work items', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Dependency Project' }) as Project;

    // 1. Create prerequisite task (Taak A)
    const taskA = await handleMcpBridgeRequest('create_block', { projectId: project.id, title: 'Database Migratie' }) as Block;

    // 2. Create dependent task (Taak B) depending on Taak A
    const taskB = await handleMcpBridgeRequest('create_block', {
      projectId: project.id,
      title: 'OAuth Integratie',
      dependsOn: [taskA.id]
    }) as Block;

    expect(taskB.dependsOn).toEqual([taskA.id]);

    // 3. Inspect dependency status for Task B (should be blocked by Task A)
    const statusB = await handleMcpBridgeRequest('get_block_dependencies', {
      blockId: taskB.id
    }) as { isBlocked: boolean; pendingDependencies: Array<{ id: string; title: string }>; blocking: Array<{ id: string }> };

    expect(statusB.isBlocked).toBe(true);
    expect(statusB.pendingDependencies.length).toBe(1);
    expect(statusB.pendingDependencies[0].id).toBe(taskA.id);

    // 4. Inspect dependency status for Task A (should block Task B)
    const statusA = await handleMcpBridgeRequest('get_block_dependencies', {
      blockId: taskA.id
    }) as { isBlocked: boolean; blocking: Array<{ id: string; title: string }> };

    expect(statusA.isBlocked).toBe(false);
    expect(statusA.blocking.length).toBe(1);
    expect(statusA.blocking[0].id).toBe(taskB.id);

    // 5. Circular dependency prevention: Task A cannot depend on Task B
    await expect(handleMcpBridgeRequest('update_block', {
      blockId: taskA.id,
      dependsOn: [taskB.id]
    })).rejects.toThrow(/Circulaire afhankelijkheid/);

    // 6. Completing Task A unblocks Task B
    await handleMcpBridgeRequest('update_block', {
      blockId: taskA.id,
      tags: ['done']
    });

    const statusBAfter = await handleMcpBridgeRequest('get_block_dependencies', {
      blockId: taskB.id
    }) as { isBlocked: boolean; pendingDependencies: Array<unknown> };

    expect(statusBAfter.isBlocked).toBe(false);
    expect(statusBAfter.pendingDependencies.length).toBe(0);
  });

  it('does not expose the removed daily plan mutation', async () => {
    const proj = await handleMcpBridgeRequest('create_project', { title: 'Release Plan' }) as Project;
    const prereq = await handleMcpBridgeRequest('create_block', {
      projectId: proj.id,
      title: 'Backend API',
      content: 'API endpoints'
    }) as Block;

    const blockedTask = await handleMcpBridgeRequest('create_block', {
      projectId: proj.id,
      title: 'Frontend Dashboard',
      content: 'Dashboard UI',
      tags: ['todo'],
      dependsOn: [prereq.id]
    }) as Block;
    expect(blockedTask.id).toBeDefined();

    await expect(handleMcpBridgeRequest('get_or_create_daily_plan', {
      date: '2026-08-18'
    })).rejects.toThrow(/cannot create or edit tasks/i);
  });
});

describe('DeepScribe MCP project context & scratchpad (Feature C)', () => {
  it('reads project context, updates scratchpad and appends memory chunks', async () => {
    const project = await handleMcpBridgeRequest('create_project', {
      title: 'Context Engine Project',
      description: 'Test project voor agent context state',
      scratchpad: '# Initial Architecture\n\n- React + TypeScript frontend\n- Local-first Dexie storage'
    }) as Project;

    expect(project.scratchpad).toContain('React + TypeScript frontend');
    expect(project.scratchpadUpdatedAt).toBeDefined();

    await insertUserTask(project.id, null, 'Setup State Machine', createTaskMetadata());

    // 1. Get project context in single call
    const context1 = await handleMcpBridgeRequest('get_project_context', {
      projectId: project.id
    }) as {
      projectId: string;
      title: string;
      scratchpad: string;
      totalBlocks: number;
      openTaskCount: number;
      openTasks: Array<{ blockTitle: string }>;
    };

    expect(context1.title).toBe('Context Engine Project');
    expect(context1.scratchpad).toContain('Initial Architecture');
    expect(context1.totalBlocks).toBe(1);
    expect(context1.openTaskCount).toBe(1);
    expect(context1.openTasks[0].blockTitle).toBe('Setup State Machine');

    // 2. Append new decision to scratchpad
    const updatedScratchpad = await handleMcpBridgeRequest('update_project_scratchpad', {
      projectId: project.id,
      content: '## Besluit 17 Augustus\n\nWe kiezen voor gestandaardiseerde JSON schemas over MCP.',
      append: true
    }) as { scratchpad: string; scratchpadUpdatedAt: number };

    expect(updatedScratchpad.scratchpad).toContain('Initial Architecture');
    expect(updatedScratchpad.scratchpad).toContain('Besluit 17 Augustus');
    expect(updatedScratchpad.scratchpadUpdatedAt).toBeDefined();

    // 3. Verify via get_project_context
    const context2 = await handleMcpBridgeRequest('get_project_context', {
      projectId: project.id
    }) as { scratchpad: string };

    expect(context2.scratchpad).toContain('Besluit 17 Augustus');

    // 4. Overwrite scratchpad completely
    await handleMcpBridgeRequest('update_project_scratchpad', {
      projectId: project.id,
      content: '# Geherstructureerde architectuur\n\n- Schone lei',
      append: false
    });

    const context3 = await handleMcpBridgeRequest('get_project_context', {
      projectId: project.id
    }) as { scratchpad: string };

    expect(context3.scratchpad).toBe('# Geherstructureerde architectuur\n\n- Schone lei');
    expect(context3.scratchpad).not.toContain('Initial Architecture');
  });
});

describe('DeepScribe MCP Activity Stream & Live Feed (Feature E)', () => {
  it('records activities and lists them with various filters', async () => {
    const timestampBefore = Date.now();
    const projA = await handleMcpBridgeRequest('create_project', { title: 'Activity Project A' }) as Project;
    const projB = await handleMcpBridgeRequest('create_project', { title: 'Activity Project B' }) as Project;

    // 1. Record specific agent activities
    await handleMcpBridgeRequest('record_activity', {
      projectId: projA.id,
      action: 'agent-benchmark',
      summary: 'Agent voltooide benchmark suite',
      source: 'agent'
    });

    await handleMcpBridgeRequest('record_activity', {
      projectId: projB.id,
      action: 'agent-refactor',
      summary: 'Agent herschreef data hooks',
      source: 'agent'
    });

    await handleMcpBridgeRequest('record_activity', {
      projectId: projA.id,
      action: 'user-review',
      summary: 'Ontwikkelaar heeft PR geaccepteerd',
      source: 'user'
    });

    // 2. Query all activities
    const allActivities = await handleMcpBridgeRequest('list_activities', { limit: 50 }) as Array<{ action: string; source: string; summary: string }>;
    expect(allActivities.length).toBeGreaterThanOrEqual(3);

    // 3. Filter by projectId
    const projAActivities = await handleMcpBridgeRequest('list_activities', {
      projectId: projA.id
    }) as Array<{ projectId: string; summary: string }>;
    expect(projAActivities.every(a => a.projectId === projA.id)).toBe(true);
    expect(projAActivities.some(a => a.summary.includes('benchmark'))).toBe(true);
    expect(projAActivities.some(a => a.summary.includes('herschreef'))).toBe(false);

    // 4. Filter by source (agent only)
    const agentActivities = await handleMcpBridgeRequest('list_activities', {
      projectId: projA.id,
      source: 'agent'
    }) as Array<{ source: string; summary: string }>;
    expect(agentActivities.every(a => a.source === 'agent')).toBe(true);
    expect(agentActivities.some(a => a.summary.includes('benchmark'))).toBe(true);
    expect(agentActivities.some(a => a.summary.includes('Ontwikkelaar'))).toBe(false);

    // 5. Filter by since timestamp
    const recent = await handleMcpBridgeRequest('list_activities', {
      since: timestampBefore
    }) as Array<{ createdAt: number }>;
    expect(recent.every(a => a.createdAt >= timestampBefore)).toBe(true);
  });
});

describe('DeepScribe MCP export_block', () => {
  it('exports a block and children as markdown, text, and html', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Export Test Project' }) as Project;
    const parent = await handleMcpBridgeRequest('create_block', {
      projectId: project.id,
      title: 'Chapter 1',
      content: '## Heading\n\nParagraph with **bold** text.'
    }) as Block;
    await handleMcpBridgeRequest('create_block', {
      projectId: project.id,
      parentId: parent.id,
      title: 'Section 1.1',
      content: 'Nested details.'
    });

    const mdExport = await handleMcpBridgeRequest('export_block', {
      blockId: parent.id,
      format: 'markdown',
      includeChildren: true
    }) as { status: string; format: string; content: string; title: string };

    expect(mdExport.status).toBe('exported');
    expect(mdExport.format).toBe('markdown');
    expect(mdExport.content).toContain('# Chapter 1');
    expect(mdExport.content).toContain('## Section 1.1');
    expect(mdExport.content).toContain('**bold**');

    const textExport = await handleMcpBridgeRequest('export_block', {
      blockId: parent.id,
      format: 'text',
      includeChildren: true
    }) as { status: string; format: string; content: string };

    expect(textExport.status).toBe('exported');
    expect(textExport.content).toContain('Chapter 1');
    expect(textExport.content).toContain('Section 1.1');

    const htmlExport = await handleMcpBridgeRequest('export_block', {
      blockId: parent.id,
      format: 'html'
    }) as { status: string; format: string; content: string };

    expect(htmlExport.status).toBe('exported');
    expect(htmlExport.content).toContain('<!doctype html>');
    expect(htmlExport.content).toContain('Chapter 1');

    const pdfFallback = await handleMcpBridgeRequest('export_block', {
      blockId: parent.id,
      format: 'pdf'
    }) as { status: string; format: string };

    expect(pdfFallback.status).toBe('exported');
  });

  it('rejects export on invalid blockId', async () => {
    await expect(handleMcpBridgeRequest('export_block', { blockId: 'missing-id' }))
      .rejects.toThrow(/Block not found/i);
  });

  it('reads and updates export settings via MCP bridge', async () => {
    const initial = await handleMcpBridgeRequest('get_export_settings', {}) as { settings: { pageSize: string; margin: string }; presets: Record<string, unknown> };
    expect(initial.settings.pageSize).toBe('A4');
    expect(initial.presets.a5Book).toBeDefined();

    const updated = await handleMcpBridgeRequest('update_export_settings', {
      preset: 'a5Book',
      font: 'sans'
    }) as { status: string; settings: { pageSize: string; margin: string; font: string } };

    expect(updated.status).toBe('updated');
    expect(updated.settings.pageSize).toBe('A5');
    expect(updated.settings.margin).toBe('compact');
    expect(updated.settings.font).toBe('sans');

    const reloaded = await handleMcpBridgeRequest('get_export_settings', {}) as { settings: { pageSize: string; font: string } };
    expect(reloaded.settings.pageSize).toBe('A5');
    expect(reloaded.settings.font).toBe('sans');
  });

  it('retrieves and claims tasks using human task IDs in bridge (TSK-187, #187, bare numbers)', async () => {
    const project = await handleMcpBridgeRequest('create_project', { title: 'Bridge Task ID Project' }) as Project;
    const task = await insertUserTask(project.id, null, 'Bridge task', { status: 'ready', agentTarget: 'openai', position: 1, taskNumber: 187 });

    const fetchedByTsk = await handleMcpBridgeRequest('get_task', { taskId: 'TSK-187' }) as Block;
    expect(fetchedByTsk.id).toBe(task.id);

    const fetchedByHash = await handleMcpBridgeRequest('get_task', { taskId: '#187' }) as Block;
    expect(fetchedByHash.id).toBe(task.id);

    const fetchedByNum = await handleMcpBridgeRequest('get_task', { taskId: '187' }) as Block;
    expect(fetchedByNum.id).toBe(task.id);

    const claim = await handleMcpBridgeRequest('claim_work_item', {
      blockId: 'TSK-187',
      agentId: 'codex-1',
      agentTarget: 'openai',
      requestId: 'bridge-claim-tsk-187',
      leaseSeconds: 120
    }) as { block: Block; claimToken: string };
    expect(claim.block.id).toBe(task.id);
    expect(claim.block.task?.status).toBe('in-progress');
  });
});
