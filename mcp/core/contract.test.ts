import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import * as coreDependencies from './dependencies.mjs';
import * as coreHtml from './html.mjs';
import * as coreMarkdown from './markdown.mjs';
import * as coreRanking from './ranking.mjs';
import * as coreTags from './tags.mjs';
import * as coreTasks from './tasks.mjs';

import * as directStore from '../direct-store.mjs';
import * as bridge from '../../src/mcp/bridge';
import * as dependencyUtils from '../../src/utils/dependencyUtils';
import * as semanticSearch from '../../src/utils/semanticSearch';
import * as tagUtils from '../../src/utils/tagUtils';
import * as taskBlocks from '../../src/utils/taskBlocks';

import type { Block, TaskMetadata } from '../../src/types';

/**
 * The live bridge (Dexie) and the standalone MCP server (SQLite) are two
 * adapters over one domain core. These tests pin that down by identity: if a
 * rule is ever reimplemented on one side, the shared binding stops matching and
 * the drift is caught here rather than in production.
 */
describe('shared domain core', () => {
  it('serves tag rules to both adapters', () => {
    expect(tagUtils.sanitizeTags).toBe(coreTags.sanitizeTags);
    expect(directStore.sanitizeTags).toBe(coreTags.sanitizeTags);
    expect(tagUtils.normalizeTag).toBe(coreTags.normalizeTag);
    expect(directStore.normalizeTag).toBe(coreTags.normalizeTag);
  });

  it('serves Markdown conversion to both adapters', () => {
    expect(bridge.markdownToHtml).toBe(coreMarkdown.markdownToHtml);
    expect(directStore.markdownToHtml).toBe(coreMarkdown.markdownToHtml);
  });

  it('serves one content sniffer and one sanitiser to both adapters', () => {
    // Both adapters decide over Markdown-or-HTML with the same function, so an
    // agent cannot get its HTML through one path that the other would escape,
    // and cannot get past the allowlist on either.
    for (const name of ['contentToHtml', 'looksLikeHtml', 'sanitizeHtml'] as const) {
      expect(bridge[name]).toBe(coreHtml[name]);
      expect(directStore[name]).toBe(coreHtml[name]);
    }
  });

  it('serves dependency rules to both adapters', () => {
    for (const name of ['isBlockCompleted', 'sanitizeDependsOn', 'detectCircularDependency', 'getBlockDependencyStatus'] as const) {
      expect(dependencyUtils[name]).toBe(coreDependencies[name]);
      expect(directStore[name]).toBe(coreDependencies[name]);
    }
  });

  it('serves ranking to both adapters', () => {
    expect(semanticSearch.rankBlocksLocally).toBe(coreRanking.rankBlocksLocally);
    expect(directStore.rankBlocksLocally).toBe(coreRanking.rankBlocksLocally);
  });

  it('serves chunk-aware search to both adapters', () => {
    // Both search handlers score through this one function, so the live bridge
    // and the offline server cannot return a different ordering for one query.
    expect(semanticSearch.rankChunksLocally).toBe(coreRanking.rankChunksLocally);
    expect(directStore.rankChunksLocally).toBe(coreRanking.rankChunksLocally);
    expect(semanticSearch.invalidateChunks).toBe(coreRanking.invalidateChunks);
    expect(semanticSearch.rankProjectsLocally).toBe(coreRanking.rankProjectsLocally);
    expect(directStore.rankProjectsLocally).toBe(coreRanking.rankProjectsLocally);
  });

  it('serves task rules to both adapters', () => {
    expect(taskBlocks.parseTaskHumanId).toBe(coreTasks.parseTaskHumanId);
    expect(directStore.parseTaskHumanId).toBe(coreTasks.parseTaskHumanId);
    expect(taskBlocks.getNextTaskNumber).toBe(coreTasks.getNextTaskNumber);
    expect(directStore.getNextTaskNumber).toBe(coreTasks.getNextTaskNumber);
    expect(taskBlocks.canTransitionTask).toBe(coreTasks.canTransitionTask);
    expect(taskBlocks.isTaskClaimCandidate).toBe(coreTasks.isTaskClaimCandidate);
    expect(taskBlocks.normalizeLeaseSeconds).toBe(coreTasks.normalizeLeaseSeconds);
  });
});

function taskBlock(id: string, task: Partial<TaskMetadata>, dependsOn?: string[]): Block {
  const now = Date.now();
  return {
    id,
    projectId: 'proj-1',
    parentId: null,
    title: id,
    content: '<p></p>',
    plainText: '',
    order: 0,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    tags: [],
    dependsOn,
    kind: 'task',
    task: { status: 'ready', agentTarget: 'any', position: 0, ...task },
    isTrash: false,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * The rules below used to differ between the two implementations. Unifying them
 * is the point of the shared core, so each resolved difference is pinned here.
 */
describe('rules that previously diverged between the two paths', () => {
  it('never hands out a task that is assigned to nobody', () => {
    const block = taskBlock('task-none', { agentTarget: 'none' });
    expect(coreTasks.isTaskClaimCandidate(block, [block], 'claude', undefined, Date.now())).toBe(false);
  });

  it('does not release a task whose dependency no longer exists', () => {
    const block = taskBlock('task-orphan', {}, ['block-deleted']);
    expect(coreTasks.isTaskClaimCandidate(block, [block], 'claude', undefined, Date.now())).toBe(false);
  });

  it('does not release a task whose dependency sits in the trash', () => {
    const dependency = { ...taskBlock('task-dep', { status: 'done' }), isTrash: true };
    const block = taskBlock('task-blocked', {}, [dependency.id]);
    expect(coreTasks.isTaskClaimCandidate(block, [block, dependency], 'claude', undefined, Date.now())).toBe(false);
  });

  it('releases a task once its dependency is done', () => {
    const dependency = taskBlock('task-dep', { status: 'done' });
    const block = taskBlock('task-ready', {}, [dependency.id]);
    expect(coreTasks.isTaskClaimCandidate(block, [block, dependency], 'claude', undefined, Date.now())).toBe(true);
  });

  it('serves the task write rules to both adapters', () => {
    expect(taskBlocks.taskClaimWriteRefusal).toBe(coreTasks.taskClaimWriteRefusal);
    expect(taskBlocks.taskProtectedFieldRefusal).toBe(coreTasks.taskProtectedFieldRefusal);
  });

  it('rejects a lease length outside the range the tool schemas allow', () => {
    expect(coreTasks.normalizeLeaseSeconds(undefined)).toBe(coreTasks.DEFAULT_TASK_LEASE_SECONDS);
    expect(coreTasks.normalizeLeaseSeconds(120)).toBe(120);
    expect(() => coreTasks.normalizeLeaseSeconds(5)).toThrow(/between 60 and 3600/);
    expect(() => coreTasks.normalizeLeaseSeconds(99999)).toThrow(/between 60 and 3600/);
  });
});

describe('agent writes to task content', () => {
  const now = Date.now();
  const claim = {
    ownerId: 'codex-1',
    agentTarget: 'openai' as const,
    token: 'secret-token',
    requestId: 'request-1',
    claimedAt: now,
    heartbeatAt: now,
    expiresAt: now + 60_000,
    attempt: 1
  };

  it('allows a write to an unclaimed task', () => {
    const block = taskBlock('task-open', {});
    expect(coreTasks.taskClaimWriteRefusal(block, {}, now)).toBeNull();
  });

  it('refuses a write while another agent holds the lease', () => {
    const block = taskBlock('task-held', { status: 'in-progress', claim });
    expect(coreTasks.taskClaimWriteRefusal(block, {}, now)).toMatch(/claimed by another agent/i);
    expect(coreTasks.taskClaimWriteRefusal(block, { agentId: 'gemini-9', claimToken: 'guess' }, now)).toMatch(/claimed by another agent/i);
    expect(coreTasks.taskClaimWriteRefusal(block, { agentId: 'codex-1', claimToken: 'wrong' }, now)).toMatch(/claimed by another agent/i);
  });

  it('allows the lease holder to write with its own token', () => {
    const block = taskBlock('task-held', { status: 'in-progress', claim });
    expect(coreTasks.taskClaimWriteRefusal(block, { agentId: 'codex-1', claimToken: 'secret-token' }, now)).toBeNull();
  });

  it('allows a write again once the lease has expired', () => {
    const block = taskBlock('task-stale', { status: 'in-progress', claim });
    expect(coreTasks.taskClaimWriteRefusal(block, {}, claim.expiresAt + 1)).toBeNull();
  });

  it('leaves regular blocks untouched by the task rules', () => {
    const block = { ...taskBlock('block-plain', {}), kind: undefined, task: undefined };
    expect(coreTasks.taskClaimWriteRefusal(block, {}, now)).toBeNull();
    expect(coreTasks.taskProtectedFieldRefusal(block, { title: 'Renamed', status: 'done' })).toBeNull();
  });

  it('protects the parts of a task the user owns', () => {
    const block = taskBlock('task-owned', {}, ['dep-1']);
    expect(coreTasks.taskProtectedFieldRefusal(block, { content: 'Report' })).toBeNull();
    expect(coreTasks.taskProtectedFieldRefusal(block, { title: block.title })).toBeNull();
    expect(coreTasks.taskProtectedFieldRefusal(block, { dependsOn: ['dep-1'] })).toBeNull();

    expect(coreTasks.taskProtectedFieldRefusal(block, { title: 'Renamed' })).toMatch(/cannot rename a task/i);
    expect(coreTasks.taskProtectedFieldRefusal(block, { dependsOn: [] })).toMatch(/task dependencies/i);
    expect(coreTasks.taskProtectedFieldRefusal(block, { status: 'done' })).toMatch(/status, assignment or position/i);
    expect(coreTasks.taskProtectedFieldRefusal(block, { agentTarget: 'claude' })).toMatch(/status, assignment or position/i);
    expect(coreTasks.taskProtectedFieldRefusal(block, { position: 5 })).toMatch(/status, assignment or position/i);
  });
});
