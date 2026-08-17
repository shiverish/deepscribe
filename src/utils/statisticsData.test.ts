import { describe, it, expect } from 'vitest';
import { calculateStatistics } from './statisticsData';
import type { Project, Block } from '../types';

describe('statisticsData utils', () => {
  it('calculates metrics, reading time, tasks and tag distributions correctly', () => {
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
        taskCount: 5,
        completedTaskCount: 3,
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
        taskCount: 5,
        completedTaskCount: 5,
        attachmentCount: 1,
        isTrash: false,
        tags: ['dev'],
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    const stats = calculateStatistics(mockProjects, mockBlocks, 'project', 'proj-1');

    expect(stats.totalBlocks).toBe(2);
    expect(stats.totalWords).toBe(16);
    expect(stats.totalAttachments).toBe(3);
    expect(stats.totalTasks).toBe(10);
    expect(stats.completedTasks).toBe(8);
    expect(stats.pendingTasks).toBe(2);
    expect(stats.taskCompletionPercentage).toBe(80);
    expect(stats.estimatedReadingTimeMinutes).toBe(1);

    // Tag distribution: 'dev' (count 2, 100%), 'focus' (count 1, 50%)
    expect(stats.tagDistribution).toHaveLength(2);
    expect(stats.tagDistribution[0].tag).toBe('dev');
    expect(stats.tagDistribution[0].count).toBe(2);
    expect(stats.tagDistribution[0].percentage).toBe(100);
    expect(stats.tagDistribution[1].tag).toBe('focus');
    expect(stats.tagDistribution[1].count).toBe(1);
    expect(stats.tagDistribution[1].percentage).toBe(50);
  });
});
