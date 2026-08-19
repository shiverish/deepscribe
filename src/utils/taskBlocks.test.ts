import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { canTransitionTask, createTaskMetadata, isTaskAutoPickupEligible, taskContentFromParts, taskTargetMatches, taskWithoutActiveClaim, validateTaskReady } from './taskBlocks';

describe('task blocks', () => {
  it('requires structured task content before ready', () => {
    const task = { ...createTaskMetadata(), agentTarget: 'openai' as const, status: 'ready' as const };
    expect(validateTaskReady('Taak', '<h2>Doel</h2><p></p><h2>Context</h2><p></p><h2>Acceptatiecriteria</h2><ul><li><p></p></li></ul>', task))
      .toEqual(['Enter a Goal.', 'Enter Context.', 'Add at least one acceptance criterion.']);
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
    expect(canTransitionTask('draft', 'ready')).toBe(true);
    expect(canTransitionTask('draft', 'review')).toBe(false);
    expect(canTransitionTask('claimed', 'review')).toBe(true);
  });

  it('matches provider targets strictly and clears runtime claims from copies', () => {
    expect(taskTargetMatches({ ...createTaskMetadata(), agentTarget: 'any' }, 'gemini')).toBe(true);
    expect(taskTargetMatches({ ...createTaskMetadata(), agentTarget: 'openai' }, 'claude')).toBe(false);
    expect(taskTargetMatches({ ...createTaskMetadata(), agentTarget: 'custom', customAgentName: 'Local Agent' }, 'custom', 'local agent')).toBe(true);
    const copied = taskWithoutActiveClaim({
      ...createTaskMetadata(), status: 'claimed', agentTarget: 'openai', claim: {
        ownerId: 'agent', agentTarget: 'openai', token: 'secret', requestId: 'request', claimedAt: 1, heartbeatAt: 1, expiresAt: 2, attempt: 3
      }
    }, 'draft');
    expect(copied).toMatchObject({ status: 'draft' });
    expect(copied.claim).toBeUndefined();
  });
});
