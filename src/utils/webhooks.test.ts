import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deriveWebhookEvents, normalizeWebhookEndpoints, WEBHOOK_EVENTS } from './webhooks';
import type { Block, TaskStatus } from '../types';

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1', projectId: 'project-1', parentId: null, title: 'Blok',
    content: '<p>Inhoud</p>', plainText: 'Inhoud', order: 0, childCount: 0,
    taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [],
    isTrash: false, createdAt: 1, updatedAt: 1, ...overrides
  };
}

function task(status: TaskStatus, overrides: Partial<Block> = {}): Block {
  return block({
    kind: 'task',
    task: { status, agentTarget: 'any', position: 0, taskNumber: 7 },
    ...overrides
  });
}

describe('webhook endpoint settings', () => {
  it('ignores anything that is not a list of endpoints', () => {
    expect(normalizeWebhookEndpoints(undefined)).toEqual([]);
    expect(normalizeWebhookEndpoints('nee')).toEqual([]);
    expect(normalizeWebhookEndpoints([null, 42, 'x'])).toEqual([]);
  });

  it('fills in defaults and keeps only known events', () => {
    const [endpoint] = normalizeWebhookEndpoints([
      { id: 'w1', url: 'https://example.com/hook', events: ['task.created', 'niet.bestaand', 'task.created'] }
    ]);
    expect(endpoint).toMatchObject({
      id: 'w1', url: 'https://example.com/hook', name: '', enabled: true, authMode: 'none', secret: ''
    });
    expect(endpoint.events).toEqual(['task.created']);
  });

  it('keeps an endpoint disabled when it was stored that way', () => {
    expect(normalizeWebhookEndpoints([{ id: 'w1', enabled: false }])[0].enabled).toBe(false);
    expect(normalizeWebhookEndpoints([{ id: 'w1' }])[0].enabled).toBe(true);
  });

  it('falls back to a safe auth mode for an unknown value', () => {
    expect(normalizeWebhookEndpoints([{ id: 'w1', authMode: 'basic' }])[0].authMode).toBe('none');
    expect(normalizeWebhookEndpoints([{ id: 'w1', authMode: 'hmac' }])[0].authMode).toBe('hmac');
  });
});

describe('deriving webhook events from a block change', () => {
  it('reports a new block and a new task under their own event', () => {
    expect(deriveWebhookEvents(undefined, block()).map(event => event.event)).toEqual(['block.created']);
    expect(deriveWebhookEvents(undefined, task('inbox')).map(event => event.event)).toEqual(['task.created']);
  });

  it('reports a task status change with both the old and the new status', () => {
    const events = deriveWebhookEvents(task('ready'), task('in-progress'));
    const statusChange = events.find(event => event.event === 'task.status_changed');
    expect(statusChange).toMatchObject({ oldStatus: 'ready', newStatus: 'in-progress', taskId: 'block-1' });
    expect(statusChange?.metadata).toMatchObject({ source: 'deepscribe', kind: 'task', taskNumber: 7 });
  });

  it('stays silent when nothing meaningful changed', () => {
    const unchanged = block();
    expect(deriveWebhookEvents(unchanged, { ...unchanged, updatedAt: 999 })).toEqual([]);
  });

  it('reports an edit to the content but not to bookkeeping fields', () => {
    expect(deriveWebhookEvents(block(), block({ content: '<p>Anders</p>' })).map(event => event.event)).toEqual(['block.updated']);
    expect(deriveWebhookEvents(block(), block({ order: 5, childCount: 3 }))).toEqual([]);
  });

  it('says nothing about a block that moved to the trash', () => {
    expect(deriveWebhookEvents(block(), block({ isTrash: true }))).toEqual([]);
    expect(deriveWebhookEvents(undefined, block({ isTrash: true }))).toEqual([]);
  });

  it('reports both events when a status change comes with an edit', () => {
    const events = deriveWebhookEvents(task('ready'), task('done', { title: 'Andere titel' }));
    expect(events.map(event => event.event)).toEqual(['task.status_changed', 'block.updated']);
  });

  it('carries the fields an external automation needs', () => {
    const [event] = deriveWebhookEvents(undefined, block({ tags: ['app', 'webhook'] }));
    expect(event).toMatchObject({
      event: 'block.created', projectId: 'project-1', blockId: 'block-1',
      taskId: null, title: 'Blok', tags: ['app', 'webhook']
    });
    expect(Date.parse(event.timestamp)).not.toBeNaN();
  });

  it('offers every documented event for selection in settings', () => {
    expect(WEBHOOK_EVENTS.map(event => event.id)).toEqual([
      'task.status_changed', 'task.created', 'block.created', 'block.updated'
    ]);
  });
});
