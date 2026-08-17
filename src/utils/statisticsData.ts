import type { Block, Project } from '../types';
import { countWords } from './graphData';

export interface ProjectStatsSummary {
  projectId: string;
  title: string;
  color: string;
  blockCount: number;
  wordCount: number;
  taskCount: number;
  completedTaskCount: number;
  taskPercentage: number;
}

export interface TagStatsSummary {
  tag: string;
  count: number;
  percentage: number;
}

export interface WorkspaceStatistics {
  scope: 'project' | 'workspace';
  activeProjectTitle?: string;
  totalProjects: number;
  totalBlocks: number;
  totalWords: number;
  totalCharacters: number;
  estimatedReadingTimeMinutes: number;
  totalAttachments: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  taskCompletionPercentage: number;
  tagDistribution: TagStatsSummary[];
  projectBreakdown: ProjectStatsSummary[];
}

export function calculateStatistics(
  projects: Project[],
  blocks: Block[],
  scope: 'project' | 'workspace',
  activeProjectId: string | null
): WorkspaceStatistics {
  const nonTrashProjects = projects.filter(p => !p.isTrash);
  const nonTrashBlocks = blocks.filter(b => !b.isTrash);

  const activeProject = activeProjectId ? nonTrashProjects.find(p => p.id === activeProjectId) : null;

  const targetBlocks = scope === 'project' && activeProjectId
    ? nonTrashBlocks.filter(b => b.projectId === activeProjectId)
    : nonTrashBlocks;

  const targetProjects = scope === 'project' && activeProjectId
    ? (activeProject ? [activeProject] : [])
    : nonTrashProjects;

  let totalWords = 0;
  let totalCharacters = 0;
  let totalAttachments = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  const tagCounts = new Map<string, number>();

  // Project map for quick lookup
  const projectStatsMap = new Map<string, {
    projectId: string;
    title: string;
    color: string;
    blockCount: number;
    wordCount: number;
    taskCount: number;
    completedTaskCount: number;
  }>();

  for (const proj of targetProjects) {
    projectStatsMap.set(proj.id, {
      projectId: proj.id,
      title: proj.title || 'Untitled Project',
      color: proj.color || '#3b82f6',
      blockCount: 0,
      wordCount: 0,
      taskCount: 0,
      completedTaskCount: 0
    });
  }

  for (const block of targetBlocks) {
    const text = block.plainText || '';
    const words = countWords(text);
    const chars = text.length;

    totalWords += words;
    totalCharacters += chars;
    totalAttachments += block.attachmentCount || 0;
    totalTasks += block.taskCount || 0;
    completedTasks += block.completedTaskCount || 0;

    // Track tags
    for (const tag of block.tags || []) {
      const cleanTag = tag.trim().toLowerCase();
      if (!cleanTag) continue;
      tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
    }

    // Track per project stats
    const pStats = projectStatsMap.get(block.projectId);
    if (pStats) {
      pStats.blockCount += 1;
      pStats.wordCount += words;
      pStats.taskCount += block.taskCount || 0;
      pStats.completedTaskCount += block.completedTaskCount || 0;
    }
  }

  const tagDistribution: TagStatsSummary[] = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: targetBlocks.length > 0 ? Math.round((count / targetBlocks.length) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const projectBreakdown: ProjectStatsSummary[] = Array.from(projectStatsMap.values())
    .map(p => ({
      ...p,
      taskPercentage: p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0
    }))
    .sort((a, b) => b.wordCount - a.wordCount);

  const taskCompletionPercentage = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const estimatedReadingTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));

  return {
    scope,
    activeProjectTitle: activeProject?.title,
    totalProjects: targetProjects.length,
    totalBlocks: targetBlocks.length,
    totalWords,
    totalCharacters,
    estimatedReadingTimeMinutes: totalWords === 0 ? 0 : estimatedReadingTimeMinutes,
    totalAttachments,
    totalTasks,
    completedTasks,
    pendingTasks: Math.max(0, totalTasks - completedTasks),
    taskCompletionPercentage,
    tagDistribution,
    projectBreakdown
  };
}
