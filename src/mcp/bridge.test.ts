import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import type { Block, Project } from '../types';
import { formatDailyPlanContent, formatWorkItemContent, handleMcpBridgeRequest, markdownToHtml } from './bridge';

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
    expect(content).toContain('## Doel\n\nMaak zoeken slimmer');
    expect(content).toContain('## Context\n\nGebruikers vinden');
    expect(content).toContain('## Acceptatiecriteria\n\n- Zoeken vindt');
    expect(content).toContain('- Alle verwerking blijft lokaal');
  });

  it('converts agent Markdown into readable TipTap HTML', () => {
    const html = markdownToHtml('Voorlopige rol.\nStatus: nog niet bevestigd.\n\n## Te bepalen\n\n- Naam en geschiedenis\n- Hoe dichtbij zij staat\n\n1. Eerste stap\n2. Tweede stap');
    expect(html).toContain('<p>Voorlopige rol.<br>Status: nog niet bevestigd.</p>');
    expect(html).toContain('<h2>Te bepalen</h2>');
    expect(html).toContain('<ul><li><p>Naam en geschiedenis</p></li><li><p>Hoe dichtbij zij staat</p></li></ul>');
    expect(html).toContain('<ol><li><p>Eerste stap</p></li><li><p>Tweede stap</p></li></ol>');
  });

  it('escapes raw HTML while supporting safe inline Markdown', () => {
    const html = markdownToHtml('**Status:** <script>alert(1)</script> en [bron](https://example.com).');
    expect(html).toContain('<strong>Status:</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<a href="https://example.com">bron</a>');
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

  it('automatically creates planning project and daily block with open tasks, and is idempotent', async () => {
    const gameProj = await handleMcpBridgeRequest('create_project', { title: 'Game Project' }) as Project;
    const workBlock = await handleMcpBridgeRequest('create_work_item', {
      projectId: gameProj.id,
      title: 'Puzzelmechaniek',
      goal: 'Bouw de puzzelmechaniek voor level 1',
      context: 'De speler moet experimenteren met regels',
      acceptanceCriteria: ['Level 1 werkt', 'Falsificatie toont feedback']
    }) as Block;
    expect(workBlock.title).toBe('Puzzelmechaniek');

    const plan = await handleMcpBridgeRequest('get_or_create_daily_plan', {
      date: '2026-08-17',
      focus: 'Eerste speelbare test'
    }) as Block & { path: Array<{ title: string }>; todos: Array<{ text: string }> };

    expect(plan.title).toBe('Dagplanning — 17 augustus 2026');
    expect(plan.tags).toContain('planning');
    expect(plan.tags).toContain('daily-log');
    expect(plan.tags).toContain('date-2026-08-17');
    expect(plan.content).toContain('Eerste speelbare test');
    expect(plan.content).toContain('Game Project');
    expect(plan.content).toContain('Puzzelmechaniek');

    // Calling it again retrieves the exact same block
    const retrieved = await handleMcpBridgeRequest('get_or_create_daily_plan', {
      date: '2026-08-17'
    }) as Block;
    expect(retrieved.id).toBe(plan.id);
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
