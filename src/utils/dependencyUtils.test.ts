import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import {
  isBlockCompleted,
  sanitizeDependsOn,
  detectCircularDependency,
  getBlockDependencyStatus,
  formatDependencyMarkdown
} from './dependencyUtils';

function createMockBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    projectId: 'proj-1',
    parentId: null,
    title: 'Test Blok',
    content: '<p></p>',
    plainText: '',
    order: 0,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    isTrash: false,
    tags: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  };
}

describe('dependencyUtils', () => {
  describe('isBlockCompleted', () => {
    it('returns true if block has done or agent-done tags', () => {
      const blockWithDone = createMockBlock({ tags: ['feature', 'done'] });
      expect(isBlockCompleted(blockWithDone)).toBe(true);

      const blockWithAgentDone = createMockBlock({ tags: ['agent-done'] });
      expect(isBlockCompleted(blockWithAgentDone)).toBe(true);
    });

    it('returns true if all checklist tasks are completed', () => {
      const blockWithTasks = createMockBlock({ taskCount: 3, completedTaskCount: 3 });
      expect(isBlockCompleted(blockWithTasks)).toBe(true);
    });

    it('returns false if tasks are incomplete and no done tag', () => {
      const incomplete = createMockBlock({ taskCount: 3, completedTaskCount: 2 });
      expect(isBlockCompleted(incomplete)).toBe(false);
    });

    it('returns false if trashed even with done tag', () => {
      const trashed = createMockBlock({ isTrash: true, tags: ['done'] });
      expect(isBlockCompleted(trashed)).toBe(false);
    });
  });

  describe('sanitizeDependsOn', () => {
    it('deduplicates, trims and filters invalid entries', () => {
      expect(sanitizeDependsOn([' block-1 ', 'block-2', '', 'block-1'])).toEqual(['block-1', 'block-2']);
      expect(sanitizeDependsOn(null)).toEqual([]);
      expect(sanitizeDependsOn('not-an-array')).toEqual([]);
    });
  });

  describe('detectCircularDependency', () => {
    it('detects direct self-dependency', () => {
      const blockA = createMockBlock({ id: 'A' });
      expect(detectCircularDependency([blockA], 'A', 'A')).toBe(true);
    });

    it('detects indirect cycles: A -> B -> C -> A', () => {
      const blockA = createMockBlock({ id: 'A', dependsOn: ['B'] });
      const blockB = createMockBlock({ id: 'B', dependsOn: ['C'] });
      const blockC = createMockBlock({ id: 'C', dependsOn: [] });
      const allBlocks = [blockA, blockB, blockC];

      // Checking if C can depend on A: adding A as dep of C would create A -> B -> C -> A cycle
      expect(detectCircularDependency(allBlocks, 'C', 'A')).toBe(true);
      // Valid addition: C depending on an independent block D
      const blockD = createMockBlock({ id: 'D' });
      expect(detectCircularDependency([...allBlocks, blockD], 'C', 'D')).toBe(false);
    });
  });

  describe('getBlockDependencyStatus', () => {
    it('evaluates pending and completed dependencies accurately', () => {
      const dep1 = createMockBlock({ id: 'dep-1', title: 'Database Migratie', tags: ['done'] });
      const dep2 = createMockBlock({ id: 'dep-2', title: 'API Endpoint', taskCount: 2, completedTaskCount: 1 });
      const current = createMockBlock({ id: 'curr', title: 'Frontend Koppeling', dependsOn: ['dep-1', 'dep-2', 'missing-id'] });
      const dependentChild = createMockBlock({ id: 'child-task', title: 'E2E Tests', dependsOn: ['curr'] });

      const all = [dep1, dep2, current, dependentChild];
      const status = getBlockDependencyStatus(current, all);

      expect(status.isBlocked).toBe(true);
      expect(status.completedDependencies).toHaveLength(1);
      expect(status.completedDependencies[0].id).toBe('dep-1');
      expect(status.pendingDependencies).toHaveLength(1);
      expect(status.pendingDependencies[0].id).toBe('dep-2');
      expect(status.missingDependencyIds).toEqual(['missing-id']);
      expect(status.blocking).toHaveLength(1);
      expect(status.blocking[0].id).toBe('child-task');
    });

    it('unblocks when all dependencies are completed', () => {
      const dep1 = createMockBlock({ id: 'dep-1', tags: ['done'] });
      const current = createMockBlock({ id: 'curr', dependsOn: ['dep-1'] });

      const status = getBlockDependencyStatus(current, [dep1, current]);
      expect(status.isBlocked).toBe(false);
      expect(status.pendingDependencies).toHaveLength(0);
      expect(status.completedDependencies).toHaveLength(1);
    });
  });

  describe('formatDependencyMarkdown', () => {
    it('formats dependencies nicely into markdown', () => {
      const dep1 = createMockBlock({ id: 'dep-1', title: 'Database Schema', tags: ['done'] });
      const dep2 = createMockBlock({ id: 'dep-2', title: 'Auth API' });

      const md = formatDependencyMarkdown([dep1, dep2], [dep1, dep2]);
      expect(md).toContain('## Dependencies');
      expect(md).toContain('- [x] [[Database Schema]] (`dep-1`) — *Done*');
      expect(md).toContain('- [ ] [[Auth API]] (`dep-2`) — *Pending*');
    });
  });
});
