import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { canTransitionTask, createTaskMetadata, isTaskAutoPickupEligible, normalizeTaskMetadata, taskContentFromParts, taskCreatorLabel, taskTargetMatches, taskWithoutActiveClaim, validateTaskReady } from './taskBlocks';

describe('task blocks', () => {
  it('allows free-form task content before ready', () => {
    const task = { ...createTaskMetadata(), agentTarget: 'openai' as const, status: 'ready' as const };
    expect(validateTaskReady('Taak', '<h2>Doel</h2><p></p><h2>Context</h2><p></p><h2>Acceptatiecriteria</h2><ul><li><p></p></li></ul>', task))
      .toEqual([]);
    expect(validateTaskReady('Taak', taskContentFromParts('Werkend doel', 'Voldoende context', ['Tests slagen']), task)).toEqual([]);
  });

  it('requires a custom agent name and separates assignment from readiness', () => {
    const base = { id: 'task', projectId: 'project', parentId: 'parent', title: 'Taak', content: '', plainText: '', order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [], isTrash: false, createdAt: 1, updatedAt: 1, kind: 'task' as const };
    const manual = { ...base, task: { ...createTaskMetadata(), status: 'ready' as const } } satisfies Block;
    const automatic = { ...base, task: { ...createTaskMetadata(), status: 'ready' as const, agentTarget: 'any' as const } } satisfies Block;
    expect(isTaskAutoPickupEligible(manual)).toBe(false);
    expect(isTaskAutoPickupEligible(automatic)).toBe(true);
    expect(validateTaskReady('Task', taskContentFromParts('Goal', 'Context', ['Done']), { ...automatic.task, agentTarget: 'custom', customAgentName: '' })).toContain('Enter a name for the other agent.');
  });

  it('allows only explicit status transitions', () => {
    expect(canTransitionTask('inbox', 'ready')).toBe(true);
    expect(canTransitionTask('inbox', 'review')).toBe(true);
    expect(canTransitionTask('in-progress', 'review')).toBe(true);
  });

  it('matches provider targets strictly and clears runtime claims from copies', () => {
    expect(taskTargetMatches({ ...createTaskMetadata(), agentTarget: 'any' }, 'gemini')).toBe(true);
    expect(taskTargetMatches({ ...createTaskMetadata(), agentTarget: 'openai' }, 'claude')).toBe(false);
    expect(taskTargetMatches({ ...createTaskMetadata(), agentTarget: 'custom', customAgentName: 'Local Agent' }, 'custom', 'local agent')).toBe(true);
    const copied = taskWithoutActiveClaim({
      ...createTaskMetadata(), status: 'in-progress', agentTarget: 'openai', claim: {
        ownerId: 'agent', agentTarget: 'openai', token: 'secret', requestId: 'request', claimedAt: 1, heartbeatAt: 1, expiresAt: 2, attempt: 3
      }
    }, 'inbox');
    expect(copied).toMatchObject({ status: 'inbox' });
    expect(copied.claim).toBeUndefined();
  });

  it('normalizes immutable creator provenance and labels only agent creators', () => {
    expect(taskCreatorLabel(createTaskMetadata())).toBeNull();
    const normalized = normalizeTaskMetadata({ status: 'inbox', agentTarget: 'none', position: 1, creator: { type: 'agent', agentTarget: 'openai', agentId: ' codex-1 ', requestId: ' request-1 ' } });
    expect(normalized.creator).toEqual({ type: 'agent', agentTarget: 'openai', agentId: 'codex-1', requestId: 'request-1' });
    expect(taskCreatorLabel(normalized)).toBe('Codex/ChatGPT');
    expect(taskCreatorLabel(normalizeTaskMetadata({ status: 'inbox', agentTarget: 'none', position: 1, creator: { type: 'agent', agentTarget: 'custom', agentId: 'local', requestId: 'request', customAgentName: 'Local Agent' } }))).toBe('Local Agent');
    expect(normalizeTaskMetadata({ status: 'inbox', agentTarget: 'none', position: 1, creator: { type: 'agent', agentTarget: 'custom', agentId: 'local', requestId: 'request' } }).creator).toBeUndefined();
  });
});
