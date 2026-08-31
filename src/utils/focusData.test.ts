import { describe, expect, it } from 'vitest';
import type { Block, Project, TaskStatus } from '../types';
import { TASK_INBOX_PROJECT_ID } from './taskBlocks';
import {
  CLAIM_EXPIRING_SOON_MS,
  LONG_REVIEW_MS,
  STALE_HEARTBEAT_MS,
  buildFocusData,
  formatDuration
} from './focusData';

const NOW = 1_700_000_000_000;

const project: Project = {
  id: 'proj-1',
  title: 'Acme',
  color: '#10B981',
  isTrash: false,
  order: 0,
  createdAt: NOW,
  updatedAt: NOW
} as Project;

function task(overrides: Partial<Block> & { status: TaskStatus; id: string }): Block {
  const { status, ...rest } = overrides;
  return {
    id: overrides.id,
    projectId: 'proj-1',
    parentId: null,
    title: 'A task',
    content: '',
    plainText: '',
    order: 0,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    isTrash: false,
    tags: [],
    kind: 'task',
    task: { status, agentTarget: 'claude', position: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    ...rest
  } as Block;
}

function claim(overrides: Partial<{ claimedAt: number; heartbeatAt: number; expiresAt: number }> = {}) {
  return {
    ownerId: 'agent-1',
    agentTarget: 'claude' as const,
    token: 't',
    requestId: 'r',
    claimedAt: NOW - 60_000,
    heartbeatAt: NOW - 60_000,
    expiresAt: NOW + 600_000,
    attempt: 1,
    ...overrides
  };
}

function sectionItems(blocks: Block[], id: string) {
  return buildFocusData([project], blocks, NOW).sections.find(section => section.id === id)!.items;
}

describe('buildFocusData grouping', () => {
  it('puts each task under the section for whose turn it is', () => {
    const blocks = [
      task({ id: 'a', status: 'in-progress', task: { status: 'in-progress', agentTarget: 'claude', position: 0, claim: claim() } } as Partial<Block> & { status: TaskStatus; id: string }),
      task({ id: 'b', status: 'review' }),
      task({ id: 'c', status: 'blocked' }),
      task({ id: 'd', status: 'ready' }),
      task({ id: 'e', status: 'inbox' }),
      task({ id: 'f', status: 'done' })
    ];
    const data = buildFocusData([project], blocks, NOW);

    expect(data.sections.map(section => section.items.map(item => item.blockId))).toEqual([
      ['a'], ['b'], ['c'], ['d']
    ]);
    // Inbox and done are nobody's turn, so they stay off the screen entirely.
    expect(data.totalCount).toBe(4);
  });

  it('leaves trashed tasks out', () => {
    expect(sectionItems([task({ id: 'a', status: 'ready', isTrash: true })], 'ready')).toHaveLength(0);
  });

  it('carries the project name and colour on every row, because it crosses projects', () => {
    const [item] = sectionItems([task({ id: 'a', status: 'ready' })], 'ready');
    expect(item.projectName).toBe('Acme');
    expect(item.projectColor).toBe('#10B981');
  });

  it('names the Workspace Inbox rather than showing it as unknown', () => {
    const [item] = sectionItems([task({ id: 'a', status: 'ready', projectId: TASK_INBOX_PROJECT_ID })], 'ready');
    expect(item.projectName).toBe('Workspace Inbox');
  });

  it('sorts the longest-waiting rows first', () => {
    const blocks = [
      task({ id: 'new', status: 'review', updatedAt: NOW - 1000 }),
      task({ id: 'old', status: 'review', updatedAt: NOW - 500_000 })
    ];
    expect(sectionItems(blocks, 'your-turn').map(item => item.blockId)).toEqual(['old', 'new']);
  });
});

describe('your turn also covers unread agent edits', () => {
  it('includes an ordinary block an agent changed that nobody has read', () => {
    const block = task({ id: 'note', status: 'inbox' });
    const plain = { ...block, kind: undefined, task: undefined, lastAgentEditAt: NOW - 1000, lastSeenAgentEditAt: 0 } as Block;
    const [item] = sectionItems([plain], 'your-turn');
    expect(item.blockId).toBe('note');
    expect(item.isTask).toBe(false);
  });

  it('leaves a block alone once its agent edit has been seen', () => {
    const block = task({ id: 'note', status: 'inbox' });
    const plain = { ...block, kind: undefined, task: undefined, lastAgentEditAt: NOW - 1000, lastSeenAgentEditAt: NOW } as Block;
    expect(sectionItems([plain], 'your-turn')).toHaveLength(0);
  });
});

describe('drift alerts', () => {
  it('flags a claim that has already run out', () => {
    const block = task({ id: 'a', status: 'in-progress' });
    block.task!.claim = claim({ expiresAt: NOW - 30_000 });
    const [item] = sectionItems([block], 'working');
    expect(item.alerts.map(alert => alert.kind)).toEqual(['claim-expired']);
  });

  it('flags a claim that is about to run out', () => {
    const block = task({ id: 'a', status: 'in-progress' });
    block.task!.claim = claim({ expiresAt: NOW + CLAIM_EXPIRING_SOON_MS - 1000 });
    const [item] = sectionItems([block], 'working');
    expect(item.alerts.map(alert => alert.kind)).toEqual(['claim-expiring']);
  });

  it('flags work that looks busy but has gone quiet', () => {
    const block = task({ id: 'a', status: 'in-progress' });
    block.task!.claim = claim({ heartbeatAt: NOW - STALE_HEARTBEAT_MS - 1000, expiresAt: NOW + 600_000 });
    const [item] = sectionItems([block], 'working');
    expect(item.alerts.map(alert => alert.kind)).toEqual(['stale-heartbeat']);
  });

  it('does not repeat silence on a claim that already expired', () => {
    const block = task({ id: 'a', status: 'in-progress' });
    block.task!.claim = claim({ heartbeatAt: NOW - STALE_HEARTBEAT_MS - 1000, expiresAt: NOW - 1000 });
    const [item] = sectionItems([block], 'working');
    expect(item.alerts.map(alert => alert.kind)).toEqual(['claim-expired']);
  });

  it('says so when a task is in progress with no claim behind it', () => {
    const [item] = sectionItems([task({ id: 'a', status: 'in-progress' })], 'working');
    expect(item.detail).toBe('In progress without an active claim');
  });

  it('flags review that has been waiting on you too long, and counts it', () => {
    const blocks = [
      task({ id: 'slow', status: 'review', updatedAt: NOW - LONG_REVIEW_MS - 1000 }),
      task({ id: 'fresh', status: 'review', updatedAt: NOW - 1000 })
    ];
    const data = buildFocusData([project], blocks, NOW);
    const items = data.sections.find(section => section.id === 'your-turn')!.items;
    expect(items.find(item => item.blockId === 'slow')!.alerts.map(a => a.kind)).toEqual(['long-review']);
    expect(items.find(item => item.blockId === 'fresh')!.alerts).toEqual([]);
    expect(data.alertCount).toBe(1);
  });
});

describe('stuck rows say what holds them up', () => {
  it('names the dependency that is not finished', () => {
    const blocker = task({ id: 'dep', status: 'ready', title: 'Await approval' });
    const blocked = task({ id: 'a', status: 'blocked', dependsOn: ['dep'] });
    const [item] = sectionItems([blocker, blocked], 'stuck');
    expect(item.detail).toBe('Waiting on Await approval');
  });

  it('is honest when a dependency has gone missing', () => {
    const blocked = task({ id: 'a', status: 'blocked', dependsOn: ['ghost'] });
    const [item] = sectionItems([blocked], 'stuck');
    expect(item.detail).toBe('Waiting on 1 dependency that no longer exists');
  });

  it('says so when nothing was recorded', () => {
    const [item] = sectionItems([task({ id: 'a', status: 'blocked' })], 'stuck');
    expect(item.detail).toBe('Blocked without a recorded dependency');
  });
});

describe('formatDuration', () => {
  it('rounds to whole units', () => {
    expect(formatDuration(30_000)).toBe('just now');
    expect(formatDuration(5 * 60_000)).toBe('5m');
    expect(formatDuration(3 * 60 * 60_000)).toBe('3h');
    expect(formatDuration(50 * 60 * 60_000)).toBe('2d');
  });
});
