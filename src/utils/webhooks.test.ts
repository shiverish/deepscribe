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

  it('reports a task status change with both the old and the new status and assignment info', () => {
    const events = deriveWebhookEvents(task('ready'), task('in-progress', {
      task: {
        status: 'in-progress',
        agentTarget: 'custom',
        customAgentName: 'SeeScribe',
        position: 0,
        taskNumber: 7,
        creator: { type: 'agent', agentTarget: 'custom', customAgentName: 'SeeScribe', agentId: 'seescribe-1', requestId: 'req-1' }
      }
    }));
    const statusChange = events.find(event => event.event === 'task.status_changed');
    expect(statusChange).toMatchObject({
      oldStatus: 'ready',
      newStatus: 'in-progress',
      taskId: 'block-1',
      createdBy: 'SeeScribe',
      assignedTo: 'SeeScribe'
    });
    expect(statusChange?.metadata).toMatchObject({
      source: 'deepscribe',
      kind: 'task',
      taskNumber: 7,
      createdBy: 'SeeScribe',
      createdByType: 'agent',
      createdByAgentId: 'seescribe-1',
      assignedTo: 'SeeScribe'
    });
  });

  it('attributes a block with no recorded creator to the user', () => {
    const [event] = deriveWebhookEvents(undefined, block());
    expect(event).toMatchObject({ createdBy: 'user', createdByType: 'user', assignedTo: null });
    expect(event.metadata).toMatchObject({ kind: 'block', createdByAgentId: null });
  });

  it('reports the agent that created a plain block', () => {
    const [event] = deriveWebhookEvents(undefined, block({
      creator: { type: 'agent', agentTarget: 'claude', agentId: 'claude-7f2a' }
    }));
    expect(event).toMatchObject({ createdBy: 'claude', createdByType: 'agent' });
    expect(event.metadata).toMatchObject({ createdByAgentId: 'claude-7f2a' });
  });

  it('prefers the canonical creator over the legacy one on the task', () => {
    const [event] = deriveWebhookEvents(undefined, task('inbox', {
      creator: { type: 'user' },
      task: {
        status: 'inbox', agentTarget: 'any', position: 0, taskNumber: 7,
        creator: { type: 'agent', agentTarget: 'claude', agentId: 'c-1', requestId: 'r-1' }
      }
    }));
    expect(event).toMatchObject({ createdBy: 'user', createdByType: 'user' });
  });

  it('reports the agent pool as an assignment and none as no assignment', () => {
    expect(deriveWebhookEvents(undefined, task('inbox'))[0].assignedTo).toBe('any');
    expect(deriveWebhookEvents(undefined, task('inbox', {
      task: { status: 'inbox', agentTarget: 'none', position: 0, taskNumber: 7 }
    }))[0].assignedTo).toBeNull();
  });

  it('keeps an opaque claim owner out of assignedTo', () => {
    const claimed = task('in-progress', {
      task: {
        status: 'in-progress', agentTarget: 'gemini', position: 0, taskNumber: 7,
        claim: {
          ownerId: 'gemini-session-9', agentTarget: 'gemini', token: 't', requestId: 'r',
          claimedAt: 1, heartbeatAt: 1, expiresAt: 2, attempt: 1
        }
      }
    });
    const [event] = deriveWebhookEvents(task('ready'), claimed);
    expect(event.assignedTo).toBe('gemini');
    expect(event.metadata.claimOwner).toBe('gemini-session-9');
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
