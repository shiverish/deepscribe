import { describe, it, expect } from 'vitest';
import { calculateStatistics } from './statisticsData';
import type { Project, Block } from '../types';
import { TASK_INBOX_PROJECT_ID } from './taskBlocks';

describe('statisticsData utils', () => {
  it('calculates metrics, reading time, Kanban task progress and tag distributions correctly', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj-1',
        title: 'Project 1',
        description: '',
        color: '#3b82f6',
        order: 0,
        tags: [],
        isTrash: false,
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const mockBlocks: Block[] = [
      {
        id: 'b-1',
        projectId: 'proj-1',
        parentId: null,
        title: 'Block 1',
        content: '',
        plainText: 'Hello world this is a ten word sentence for testing purposes.',
        order: 0,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 2,
        isTrash: false,
        tags: ['focus', 'dev'],
        createdAt: 1000,
        updatedAt: 1000
      },
      {
        id: 'b-2',
        projectId: 'proj-1',
        parentId: null,
        title: 'Block 2',
        content: '',
        plainText: 'Another five great words here.',
        order: 1,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 1,
        isTrash: false,
        tags: ['dev'],
        createdAt: 1000,
        updatedAt: 1000
      },
      // Task 1: Done
      {
        id: 't-1',
        projectId: 'proj-1',
        parentId: 'b-1',
        title: 'Task Done 1',
        content: '',
        plainText: 'Finish writing unit test suite',
        order: 2,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: ['dev'],
        kind: 'task',
        task: {
          status: 'done',
          agentTarget: 'any',
          position: 1
        },
        createdAt: 1000,
        updatedAt: 1000
      },
      // Task 2: Done
      {
        id: 't-2',
        projectId: 'proj-1',
        parentId: 'b-1',
        title: 'Task Done 2',
        content: '',
        plainText: 'Documentation update done',
        order: 3,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: [],
        kind: 'task',
        task: {
          status: 'done',
          agentTarget: 'any',
          position: 2
        },
        createdAt: 1000,
        updatedAt: 1000
      },
      // Task 3: In Progress
      {
        id: 't-3',
        projectId: 'proj-1',
        parentId: 'b-1',
        title: 'Task In Progress',
        content: '',
        plainText: 'Working on feature',
        order: 4,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: [],
        kind: 'task',
        task: {
          status: 'in-progress',
          agentTarget: 'any',
          position: 3
        },
        createdAt: 1000,
        updatedAt: 1000
      },
      // Task 4: Ready
      {
        id: 't-4',
        projectId: 'proj-1',
        parentId: 'b-1',
        title: 'Task Ready',
        content: '',
        plainText: 'Ready to start',
        order: 5,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: [],
        kind: 'task',
        task: {
          status: 'ready',
          agentTarget: 'any',
          position: 4
        },
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const stats = calculateStatistics(mockProjects, mockBlocks, 'project', 'proj-1');

    expect(stats.totalBlocks).toBe(6);
    expect(stats.totalWords).toBe(30);
    expect(stats.totalAttachments).toBe(3);
    expect(stats.totalTasks).toBe(4);
    expect(stats.completedTasks).toBe(2);
    expect(stats.pendingTasks).toBe(2);
    expect(stats.taskCompletionPercentage).toBe(50);
    expect(stats.estimatedReadingTimeMinutes).toBe(1);

    expect(stats.statusCounts).toEqual({
      inbox: 0,
      ready: 1,
      'in-progress': 1,
      blocked: 0,
      review: 0,
      done: 2
    });

    // Tag distribution: 'dev' (count 3, 50%), 'focus' (count 1, 17%)
    expect(stats.tagDistribution).toHaveLength(2);
    expect(stats.tagDistribution[0].tag).toBe('dev');
    expect(stats.tagDistribution[0].count).toBe(3);
    expect(stats.tagDistribution[1].tag).toBe('focus');
    expect(stats.tagDistribution[1].count).toBe(1);
  });

  it('handles empty task counts gracefully without dividing by zero', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj-empty',
        title: 'Notes Project',
        description: '',
        color: '#10b981',
        order: 0,
        tags: [],
        isTrash: false,
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const mockBlocks: Block[] = [
      {
        id: 'b-note',
        projectId: 'proj-empty',
        parentId: null,
        title: 'Just a note',
        content: '',
        plainText: 'Just some text without any tasks.',
        order: 0,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: [],
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const stats = calculateStatistics(mockProjects, mockBlocks, 'project', 'proj-empty');
    expect(stats.totalTasks).toBe(0);
    expect(stats.completedTasks).toBe(0);
    expect(stats.pendingTasks).toBe(0);
    expect(stats.taskCompletionPercentage).toBe(0);
    expect(stats.projectBreakdown[0].taskCount).toBe(0);
    expect(stats.projectBreakdown[0].taskPercentage).toBe(0);
  });

  it('includes Workspace Inbox in workspace stats only when it has tasks or blocks', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj-1',
        title: 'Project 1',
        description: '',
        color: '#3b82f6',
        order: 0,
        tags: [],
        isTrash: false,
        createdAt: 1000,
        updatedAt: 1000
      },
      {
        id: TASK_INBOX_PROJECT_ID,
        title: 'Workspace Inbox',
        description: '',
        color: '#A78BFA',
        order: 999,
        tags: [],
        isTrash: false,
        systemKind: 'task-inbox',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const mockBlocksWithInboxTask: Block[] = [
      {
        id: 't-inbox-1',
        projectId: TASK_INBOX_PROJECT_ID,
        parentId: null,
        title: 'Inbox Task',
        content: '',
        plainText: 'Triage incoming idea',
        order: 0,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        tags: [],
        kind: 'task',
        task: {
          status: 'inbox',
          agentTarget: 'any',
          position: 1
        },
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const statsWithTasks = calculateStatistics(mockProjects, mockBlocksWithInboxTask, 'workspace', null);
    expect(statsWithTasks.totalTasks).toBe(1);
    expect(statsWithTasks.statusCounts.inbox).toBe(1);
    expect(statsWithTasks.projectBreakdown.some(p => p.projectId === TASK_INBOX_PROJECT_ID)).toBe(true);

    const statsEmptyInbox = calculateStatistics(mockProjects, [], 'workspace', null);
    expect(statsEmptyInbox.projectBreakdown.some(p => p.projectId === TASK_INBOX_PROJECT_ID)).toBe(false);
  });
});
