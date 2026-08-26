import type { Block, Project, TaskStatus } from '../types';
import { countWords } from './graphData';
import { TASK_INBOX_PROJECT_ID, TASK_STATUSES } from './taskBlocks';

export interface ProjectStatsSummary {
  projectId: string;
  title: string;
  color: string;
  blockCount: number;
  wordCount: number;
  taskCount: number;
  completedTaskCount: number;
  taskPercentage: number;
  statusCounts: Record<TaskStatus, number>;
}

export interface TagStatsSummary {
  tag: string;
  count: number;
  percentage: number;
}

export interface TaskItemSummary {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
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
  statusCounts: Record<TaskStatus, number>;
  tagDistribution: TagStatsSummary[];
  projectBreakdown: ProjectStatsSummary[];
  tasks: TaskItemSummary[];
}

function createEmptyStatusCounts(): Record<TaskStatus, number> {
  return {
    inbox: 0,
    ready: 0,
    'in-progress': 0,
    blocked: 0,
    review: 0,
    done: 0
  };
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
  const effectiveScope = activeProject ? scope : 'workspace';

  const targetBlocks = effectiveScope === 'project' && activeProject
    ? nonTrashBlocks.filter(b => b.projectId === activeProject.id)
    : nonTrashBlocks;

  const targetProjects = effectiveScope === 'project' && activeProject
    ? [activeProject]
    : nonTrashProjects;

  let totalWords = 0;
  let totalCharacters = 0;
  let totalAttachments = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  const workspaceStatusCounts = createEmptyStatusCounts();
  const tagCounts = new Map<string, number>();
  const taskList: TaskItemSummary[] = [];

  // Project map for quick lookup
  const projectStatsMap = new Map<string, {
    projectId: string;
    title: string;
    color: string;
    blockCount: number;
    wordCount: number;
    taskCount: number;
    completedTaskCount: number;
    statusCounts: Record<TaskStatus, number>;
    isSystemInbox: boolean;
  }>();

  for (const proj of targetProjects) {
    const isSystemInbox = proj.id === TASK_INBOX_PROJECT_ID || proj.systemKind === 'task-inbox';
    projectStatsMap.set(proj.id, {
      projectId: proj.id,
      title: proj.title || (isSystemInbox ? 'Workspace Inbox' : 'Untitled Project'),
      color: proj.color || (isSystemInbox ? '#A78BFA' : '#3b82f6'),
      blockCount: 0,
      wordCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      statusCounts: createEmptyStatusCounts(),
      isSystemInbox
    });
  }

  for (const block of targetBlocks) {
    const text = block.plainText || '';
    const words = countWords(text);
    const chars = text.length;

    totalWords += words;
    totalCharacters += chars;
    totalAttachments += block.attachmentCount || 0;

    // Track Kanban task blocks
    const isTask = block.kind === 'task' && Boolean(block.task);
    if (isTask && block.task) {
      const rawStatus = block.task.status;
      const status: TaskStatus = TASK_STATUSES.includes(rawStatus) ? rawStatus : 'inbox';
      totalTasks += 1;
      workspaceStatusCounts[status] = (workspaceStatusCounts[status] || 0) + 1;
      if (status === 'done') {
        completedTasks += 1;
      }
      taskList.push({
        id: block.id,
        title: block.title || 'Untitled task',
        status,
        projectId: block.projectId
      });
    }

    // Track tags
    for (const tag of block.tags || []) {
      const cleanTag = tag.trim().toLowerCase();
      if (!cleanTag) continue;
      tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
    }

    // Track per project stats
    let pStats = projectStatsMap.get(block.projectId);
    if (!pStats && block.projectId === TASK_INBOX_PROJECT_ID) {
      // Lazy initialize Workspace Inbox project if blocks exist for it but project was omitted
      pStats = {
        projectId: TASK_INBOX_PROJECT_ID,
        title: 'Workspace Inbox',
        color: '#A78BFA',
        blockCount: 0,
        wordCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        statusCounts: createEmptyStatusCounts(),
        isSystemInbox: true
      };
      projectStatsMap.set(TASK_INBOX_PROJECT_ID, pStats);
    }

    if (pStats) {
      pStats.blockCount += 1;
      pStats.wordCount += words;
      if (isTask && block.task) {
        const rawStatus = block.task.status;
        const status: TaskStatus = TASK_STATUSES.includes(rawStatus) ? rawStatus : 'inbox';
        pStats.taskCount += 1;
        pStats.statusCounts[status] = (pStats.statusCounts[status] || 0) + 1;
        if (status === 'done') {
          pStats.completedTaskCount += 1;
        }
      }
    }
  }

  const tagDistribution: TagStatsSummary[] = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: targetBlocks.length > 0 ? Math.round((count / targetBlocks.length) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // Filter out empty Workspace Inbox from projectBreakdown
  const projectBreakdown: ProjectStatsSummary[] = Array.from(projectStatsMap.values())
    .filter(p => !p.isSystemInbox || p.taskCount > 0 || p.blockCount > 0)
    .map(p => ({
      projectId: p.projectId,
      title: p.title,
      color: p.color,
      blockCount: p.blockCount,
      wordCount: p.wordCount,
      taskCount: p.taskCount,
      completedTaskCount: p.completedTaskCount,
      taskPercentage: p.taskCount > 0 ? Math.round((p.completedTaskCount / p.taskCount) * 100) : 0,
      statusCounts: p.statusCounts
    }))
    .sort((a, b) => {
      // Place active task counts or word counts at top
      if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount;
      return b.wordCount - a.wordCount;
    });

  const taskCompletionPercentage = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const estimatedReadingTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));

  return {
    scope: effectiveScope,
    activeProjectTitle: activeProject?.title,
    totalProjects: targetProjects.filter(p => p.id !== TASK_INBOX_PROJECT_ID && p.systemKind !== 'task-inbox').length,
    totalBlocks: targetBlocks.length,
    totalWords,
    totalCharacters,
    estimatedReadingTimeMinutes: totalWords === 0 ? 0 : estimatedReadingTimeMinutes,
    totalAttachments,
    totalTasks,
    completedTasks,
    pendingTasks: Math.max(0, totalTasks - completedTasks),
    taskCompletionPercentage,
    statusCounts: workspaceStatusCounts,
    tagDistribution,
    projectBreakdown,
    tasks: taskList
  };
}
