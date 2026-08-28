import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Archive, ArrowRight, Bot, Camera, Check, CheckCheck, ChevronDown, ChevronRight, Columns3, Copy, FolderArchive, Layers, List, PanelRightClose, PanelRightOpen, Plus, Search, Trash2, User } from 'lucide-react';
import type { Block, Project, TaskAgentTarget, TaskStatus } from '../../types';
import { formatTaskHumanId, taskCreatorLabel, TASK_AGENT_LABELS, TASK_AGENT_TARGETS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import { copyAgentReference } from '../../utils/agentReferences';
import { archiveDoneTasks, archiveUserTask, createUserTask, relocateUserTask, updateUserTaskAgent, updateUserTaskStatus, bulkUpdateTaskStatus, bulkRelocateTasks, bulkUpdateTaskAgent, bulkDeleteTasks, bulkMarkTasksRead } from '../../utils/taskManagement';
import { hasUnseenAgentEdits } from '../../utils/agentEdits';
import { getProjectColor, INBOX_PROJECT_COLOR, DEFAULT_PROJECT_COLOR } from '../../utils/projectColors';
import { markBlockSubtreeAsRead } from '../../db/operations';
import { ProjectFilterDropdown } from './ProjectFilterDropdown';
import { FloatingBulkActionBar } from './FloatingBulkActionBar';
import './Tasks.css';

interface TasksViewProps {
  projects: Project[];
  blocks: Block[];
  onOpenTask: (blockId: string) => void;
  onDeleteTask: (task: Block) => Promise<void>;
}

interface ArchiveModalState {
  type: 'single' | 'all';
  task?: Block;
}

export type GroupByOption = 'none' | 'project' | 'creator';

interface TaskGroup {
  id: string;
  title: string;
  color?: string;
  icon?: 'project' | 'seescribe' | 'user' | 'agent' | 'inbox';
  tasks: Block[];
}

export const TasksView: React.FC<TasksViewProps> = ({ projects, blocks, onOpenTask, onDeleteTask }) => {
  const [mode, setMode] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [groupBy, setGroupByState] = useState<GroupByOption>(() => {
    try {
      const saved = localStorage.getItem('deepscribe:tasks:group-by');
      if (saved === 'none' || saved === 'project' || saved === 'creator') {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'project';
  });

  const setGroupBy = (option: GroupByOption) => {
    setGroupByState(option);
    try {
      localStorage.setItem('deepscribe:tasks:group-by', option);
    } catch {
      // Ignore localStorage errors
    }
  };

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('deepscribe:tasks:collapsed-groups');
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage errors
    }
    return new Set();
  });

  const saveCollapsedGroups = (next: Set<string>) => {
    setCollapsedGroups(next);
    try {
      localStorage.setItem('deepscribe:tasks:collapsed-groups', JSON.stringify(Array.from(next)));
    } catch {
      // Ignore localStorage errors
    }
  };

  // Multi-selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isDoneCollapsed, setIsDoneCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('deepscribe:tasks:done-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [archiveModal, setArchiveModal] = useState<ArchiveModalState | null>(null);
  const [archiveProjectId, setArchiveProjectId] = useState<string>('');

  // Clear selection on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTaskIds.size > 0) {
        setSelectedTaskIds(new Set());
        setLastSelectedTaskId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds.size]);

  const byId = useMemo(() => new Map(blocks.map(block => [block.id, block])), [blocks]);
  const userProjects = useMemo(() => projects.filter(p => !p.isTrash && p.id !== TASK_INBOX_PROJECT_ID && p.systemKind !== 'task-inbox'), [projects]);

  const taskCountsByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const block of blocks) {
      if (!block.isTrash && block.kind === 'task' && block.task) {
        const pid = block.projectId;
        counts[pid] = (counts[pid] || 0) + 1;
      }
    }
    return counts;
  }, [blocks]);

  const tasks = useMemo(() => blocks
    .filter(block => !block.isTrash && block.kind === 'task' && block.task)
    .filter(block => selectedProjectIds.length === 0 || selectedProjectIds.includes(block.projectId))
    .filter(block => {
      const q = query.trim().toLocaleLowerCase('en-US');
      if (!q) return true;
      const titleAndText = `${block.title} ${block.plainText}`.toLocaleLowerCase('en-US');
      if (titleAndText.includes(q)) return true;

      const taskNum = block.task?.taskNumber;
      if (typeof taskNum === 'number') {
        const humanId = formatTaskHumanId(taskNum)?.toLocaleLowerCase('en-US') ?? '';
        const plainTsk = `tsk-${taskNum}`;
        const numStr = `${taskNum}`;
        const hashNumStr = `#${taskNum}`;
        if (
          humanId.includes(q) ||
          plainTsk.includes(q) ||
          numStr === q ||
          hashNumStr === q
        ) {
          return true;
        }
      }
      return false;
    })
    .sort((left, right) => (left.task?.position ?? left.order) - (right.task?.position ?? right.order) || left.createdAt - right.createdAt),
    [blocks, selectedProjectIds, query, statusFilter]
  );

  const selectedTasks = useMemo(() => {
    return tasks.filter(t => selectedTaskIds.has(t.id));
  }, [tasks, selectedTaskIds]);

  const doneTasksCount = useMemo(() => tasks.filter(task => task.task?.status === 'done').length, [tasks]);
  const unreadTasksCount = useMemo(() => tasks.filter(task => hasUnseenAgentEdits(task)).length, [tasks]);
  const projectBlocks = blocks.filter(block => !block.isTrash && block.projectId === newProjectId && block.kind !== 'task');

  const toggleDoneCollapse = () => {
    setIsDoneCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('deepscribe:tasks:done-collapsed', String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  const handleGroupHeaderClick = (
    e: React.MouseEvent,
    groupKey: string,
    allColumnGroupKeys: string[]
  ) => {
    e.preventDefault();
    const isCtrlClick = e.ctrlKey || e.metaKey || e.altKey;
    const isCurrentlyCollapsed = collapsedGroups.has(groupKey);

    if (isCtrlClick) {
      // If clicked group was open -> Collapse All in column
      // If clicked group was closed -> Expand All in column
      const next = new Set(collapsedGroups);
      if (isCurrentlyCollapsed) {
        allColumnGroupKeys.forEach(k => next.delete(k));
      } else {
        allColumnGroupKeys.forEach(k => next.add(k));
      }
      saveCollapsedGroups(next);
      return;
    }

    // Normal click: toggle just this group
    const next = new Set(collapsedGroups);
    if (isCurrentlyCollapsed) {
      next.delete(groupKey);
    } else {
      next.add(groupKey);
    }
    saveCollapsedGroups(next);
  };

  const projectLabel = (task: Block) => {
    if (task.projectId === TASK_INBOX_PROJECT_ID) return 'Workspace Inbox';
    return projects.find(project => project.id === task.projectId)?.title ?? 'Unknown project';
  };
  const getTaskProjectColor = (task: Block) => {
    if (task.projectId === TASK_INBOX_PROJECT_ID) return INBOX_PROJECT_COLOR;
    const proj = projects.find(project => project.id === task.projectId);
    return getProjectColor(proj?.color);
  };
  const contextLabel = (task: Block) => task.parentId ? byId.get(task.parentId)?.title : null;
  const nextPosition = (status: TaskStatus) => blocks.reduce((highest, block) => block.task?.status === status ? Math.max(highest, block.task.position) : highest, -1) + 1;

  const moveTask = async (task: Block, status: TaskStatus) => {
    try {
      if (task.task?.claim && !window.confirm('This task has an active claim. Move it and release the claim?')) return;
      await updateUserTaskStatus(task, status, nextPosition(status));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not move the task.'); }
  };

  const deleteTask = async (task: Block) => {
    if (!window.confirm(`Move task “${task.title}” to Trash?`)) return;
    try { await onDeleteTask(task); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete the task.'); }
  };

  const handleMarkTaskAsRead = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      await markBlockSubtreeAsRead(taskId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark task as read.');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadTasks = tasks.filter(t => hasUnseenAgentEdits(t));
      for (const t of unreadTasks) {
        await markBlockSubtreeAsRead(t.id);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark tasks as read.');
    }
  };

  const handleArchiveTask = async (task: Block) => {
    if (task.task?.claim) {
      setError('Release the active claim before archiving this task.');
      return;
    }
    if (task.projectId === TASK_INBOX_PROJECT_ID) {
      setArchiveProjectId(userProjects[0]?.id || '');
      setArchiveModal({ type: 'single', task });
      return;
    }
    try {
      await archiveUserTask(task, task.projectId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive the task.');
    }
  };

  const handleArchiveAll = async () => {
    const doneTasks = blocks.filter(b => !b.isTrash && b.kind === 'task' && b.task?.status === 'done');
    if (doneTasks.length === 0) return;

    const hasInboxDoneTasks = doneTasks.some(t => t.projectId === TASK_INBOX_PROJECT_ID);
    if (hasInboxDoneTasks) {
      setArchiveProjectId(userProjects[0]?.id || '');
      setArchiveModal({ type: 'all' });
      return;
    }

    if (!window.confirm(`Archive ${doneTasks.length} completed task${doneTasks.length === 1 ? '' : 's'} to their project Archive sections?`)) return;
    try {
      await archiveDoneTasks(doneTasks);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive tasks.');
    }
  };

  const confirmArchiveModal = async () => {
    if (!archiveModal || !archiveProjectId) return;
    try {
      if (archiveModal.type === 'single' && archiveModal.task) {
        await archiveUserTask(archiveModal.task, archiveProjectId);
      } else {
        const doneTasks = blocks.filter(b => !b.isTrash && b.kind === 'task' && b.task?.status === 'done');
        await archiveDoneTasks(doneTasks, archiveProjectId);
      }
      setArchiveModal(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not archive task.');
    }
  };

  // Multi-select click handler
  const handleTaskClick = (e: React.MouseEvent, task: Block, listScope: Block[]) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(task.id)) {
          next.delete(task.id);
        } else {
          next.add(task.id);
        }
        return next;
      });
      setLastSelectedTaskId(task.id);
      return;
    }

    if (e.shiftKey && lastSelectedTaskId) {
      e.preventDefault();
      const lastIndex = listScope.findIndex(t => t.id === lastSelectedTaskId);
      const currentIndex = listScope.findIndex(t => t.id === task.id);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = listScope.slice(start, end + 1).map(t => t.id);
        setSelectedTaskIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(id => next.add(id));
          return next;
        });
        return;
      }
    }

    // Normal click without modifiers: clear multi-selection and open task
    if (selectedTaskIds.size > 0) {
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
    }
    onOpenTask(task.id);
  };

  // Grouping helpers
  const groupTasks = useCallback((taskList: Block[], option: GroupByOption): TaskGroup[] => {
    if (option === 'none') {
      return [{ id: 'all', title: 'All Tasks', tasks: taskList }];
    }

    if (option === 'project') {
      const groupsMap = new Map<string, Block[]>();
      for (const t of taskList) {
        const key = t.projectId || TASK_INBOX_PROJECT_ID;
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key)!.push(t);
      }

      const groups: TaskGroup[] = [];
      if (groupsMap.has(TASK_INBOX_PROJECT_ID)) {
        groups.push({
          id: TASK_INBOX_PROJECT_ID,
          title: 'Workspace Inbox',
          color: INBOX_PROJECT_COLOR,
          icon: 'inbox',
          tasks: groupsMap.get(TASK_INBOX_PROJECT_ID)!
        });
      }

      for (const p of userProjects) {
        if (groupsMap.has(p.id)) {
          groups.push({
            id: p.id,
            title: p.title,
            color: getProjectColor(p.color),
            icon: 'project',
            tasks: groupsMap.get(p.id)!
          });
        }
      }

      // Add any orphaned/unknown project tasks
      for (const [pid, ptasks] of groupsMap.entries()) {
        if (pid !== TASK_INBOX_PROJECT_ID && !userProjects.some(p => p.id === pid)) {
          groups.push({
            id: pid,
            title: 'Other Project',
            color: INBOX_PROJECT_COLOR,
            icon: 'project',
            tasks: ptasks
          });
        }
      }

      return groups;
    }

    if (option === 'creator') {
      const groupsMap = new Map<string, { title: string; icon: TaskGroup['icon']; color: string; tasks: Block[] }>();

      for (const t of taskList) {
        const creator = t.task?.creator;
        let key = 'user';
        let title = 'User';
        let icon: TaskGroup['icon'] = 'user';
        let color = 'var(--text-secondary)';

        if (creator?.type === 'agent' && (creator.agentId === 'seescribe' || creator.customAgentName === 'SeeScribe')) {
          key = 'seescribe';
          title = 'SeeScribe';
          icon = 'seescribe';
          color = '#38bdf8';
        } else if (creator?.type === 'agent') {
          const label = taskCreatorLabel(t.task) || 'Agent';
          key = `agent-${label.toLowerCase()}`;
          title = label;
          icon = 'agent';
          color = 'var(--atmosphere-secondary)';
        }

        if (!groupsMap.has(key)) {
          groupsMap.set(key, { title, icon, color, tasks: [] });
        }
        groupsMap.get(key)!.tasks.push(t);
      }

      return Array.from(groupsMap.entries()).map(([id, g]) => ({
        id,
        title: g.title,
        icon: g.icon,
        color: g.color,
        tasks: g.tasks
      }));
    }

    return [{ id: 'all', title: 'All Tasks', tasks: taskList }];
  }, [userProjects]);

  const renderTaskCard = (task: Block, listScope: Block[]) => {
    const isNew = hasUnseenAgentEdits(task);
    const humanId = formatTaskHumanId(task.task?.taskNumber);
    const isSelected = selectedTaskIds.has(task.id);

    return (
      <article
        key={task.id}
        className={`task-card ${isNew ? 'has-agent-updates' : ''} ${isSelected ? 'is-selected' : ''}`}
        draggable
        onDragStart={event => event.dataTransfer.setData('text/deepscribe-task', task.id)}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault(); event.stopPropagation();
          const source = byId.get(event.dataTransfer.getData('text/deepscribe-task'));
          if (!source || source.id === task.id || !task.task) return;
          if (source.task?.claim && !window.confirm('This task has an active claim. Move it and release the claim?')) return;
          void updateUserTaskStatus(source, task.task.status, task.task.position - 0.5).catch(cause => setError(cause.message));
        }}
      >
        <button
          className="task-card-open"
          onClick={(e) => handleTaskClick(e, task, listScope)}
        >
          {(humanId || isNew) && (
            <div className="task-card-header-row">
              {humanId ? (
                <span
                  className="task-human-id clickable"
                  title="Click to copy task reference"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyAgentReference(task, 'block');
                    setCopiedTaskId(task.id);
                    setTimeout(() => setCopiedTaskId(null), 2000);
                  }}
                >
                  {copiedTaskId === task.id ? <CheckCheck size={11} color="#22C55E" /> : humanId}
                </span>
              ) : <span />}
              {isNew && (
                <span className="task-badge agent-update" title="This task contains unread agent updates">
                  <Bot size={11} /> New
                </span>
              )}
            </div>
          )}
          <div className="task-card-title-row">
            <strong>{task.title}</strong>
          </div>
          <div className="task-project-meta">
            <span className="project-color-pip" style={{ backgroundColor: getTaskProjectColor(task) }} title={projectLabel(task)} />
            <span>{projectLabel(task)}{contextLabel(task) ? ` · ${contextLabel(task)}` : ''}</span>
          </div>
          {taskCreatorLabel(task.task) && <span className="task-creator"><Bot size={11} /> Created by {taskCreatorLabel(task.task)}</span>}
        </button>
        <div className="task-card-meta">
          <select
            aria-label={`Agent for ${task.title}`}
            disabled={Boolean(task.task?.claim)}
            value={task.task?.agentTarget ?? 'none'}
            onChange={event => {
              const target = event.target.value as TaskAgentTarget;
              const customName = target === 'custom' ? window.prompt('Agent/provider name', task.task?.customAgentName ?? '') : undefined;
              if (target === 'custom' && !customName?.trim()) return;
              void updateUserTaskAgent(task, target, customName ?? undefined).catch(cause => setError(cause.message));
            }}
          >
            {TASK_AGENT_TARGETS.map(target => <option key={target} value={target}>{TASK_AGENT_LABELS[target]}</option>)}
          </select>
          {task.task?.claim && <span className="task-claim"><Bot size={11} /> {task.task.claim.ownerId}</span>}
          <div className="task-card-actions">
            {task.task?.status === 'inbox' && (
              <button
                type="button"
                className="task-card-advance task-card-advance-ready"
                title="Mark as Ready"
                aria-label={`Mark ${task.title} as Ready`}
                onClick={(e) => {
                  e.stopPropagation();
                  void moveTask(task, 'ready');
                }}
              >
                <ArrowRight size={12} />
              </button>
            )}
            {task.task?.status === 'review' && (
              <button
                type="button"
                className="task-card-advance task-card-advance-done"
                title="Approve & Mark Done"
                aria-label={`Approve and mark ${task.title} as Done`}
                onClick={(e) => {
                  e.stopPropagation();
                  void moveTask(task, 'done');
                }}
              >
                <Check size={12} />
              </button>
            )}
            <button
              type="button"
              className="task-card-copy-ref"
              title="Copy task reference"
              aria-label={`Copy reference for ${task.title}`}
              onClick={(e) => {
                e.stopPropagation();
                void copyAgentReference(task, 'block');
                setCopiedTaskId(task.id);
                setTimeout(() => setCopiedTaskId(null), 2000);
              }}
            >
              {copiedTaskId === task.id ? <CheckCheck size={12} color="#22C55E" /> : <Copy size={12} />}
            </button>
            {isNew && (
              <button
                type="button"
                className="task-card-mark-read"
                title="Mark as read"
                aria-label={`Mark ${task.title} as read`}
                onClick={(e) => void handleMarkTaskAsRead(e, task.id)}
              >
                <CheckCheck size={12} />
              </button>
            )}
            {task.task?.status === 'done' && (
              <button
                type="button"
                className="task-card-archive"
                title="Archive to project"
                aria-label={`Archive ${task.title} to project`}
                onClick={() => void handleArchiveTask(task)}
              >
                <Archive size={12} />
              </button>
            )}
            <button
              type="button"
              className="task-card-delete"
              title="Move task to Trash"
              aria-label={`Move ${task.title} to Trash`}
              onClick={() => void deleteTask(task)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </article>
    );
  };

  // Bulk Operations Handlers
  const handleBulkStatus = async (status: TaskStatus) => {
    try {
      await bulkUpdateTaskStatus(selectedTasks, status);
      setSelectedTaskIds(new Set());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update selected tasks.');
    }
  };

  const handleBulkRelocate = async (projectId: string | null) => {
    try {
      await bulkRelocateTasks(selectedTasks, projectId);
      setSelectedTaskIds(new Set());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not relocate selected tasks.');
    }
  };

  const handleBulkAgent = async (target: TaskAgentTarget, customAgentName?: string) => {
    try {
      await bulkUpdateTaskAgent(selectedTasks, target, customAgentName);
      setSelectedTaskIds(new Set());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign agent for selected tasks.');
    }
  };

  const handleBulkMarkRead = async () => {
    try {
      await bulkMarkTasksRead(selectedTasks);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark selected tasks as read.');
    }
  };

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteTasks(selectedTasks);
      setSelectedTaskIds(new Set());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete selected tasks.');
    }
  };

  return (
    <section className="tasks-view">
      <header className="tasks-toolbar">
        <div className="tasks-mode-switch">
          <button className={mode === 'board' ? 'active' : ''} onClick={() => setMode('board')}><Columns3 size={14} /> Board</button>
          <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}><List size={14} /> List</button>
        </div>

        <label className="tasks-search">
          <Search size={14} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks..." />
        </label>

        {/* Multi-select Project Filter */}
        <ProjectFilterDropdown
          projects={userProjects}
          selectedProjectIds={selectedProjectIds}
          onChangeSelectedProjects={setSelectedProjectIds}
          taskCountsByProject={taskCountsByProject}
        />

        {/* Status Filter (visible in List mode) */}
        {mode === 'list' && (
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | TaskStatus)} aria-label="Filter tasks by status">
            <option value="all">All statuses</option>
            {TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}
          </select>
        )}

        {/* Group By Selector */}
        <div className="tasks-group-by-wrapper">
          <Layers size={13} className="tasks-group-icon" />
          <select
            value={groupBy}
            onChange={event => setGroupBy(event.target.value as GroupByOption)}
            aria-label="Group tasks by"
            className="tasks-group-select"
          >
            <option value="none">No grouping</option>
            <option value="project">Group by Project</option>
            <option value="creator">Group by Creator</option>
          </select>
        </div>

        {unreadTasksCount > 0 && (
          <button
            type="button"
            className="tasks-mark-all-read-btn"
            title="Mark all unread tasks as read"
            onClick={() => void handleMarkAllAsRead()}
          >
            <CheckCheck size={14} />
            <span>Mark read ({unreadTasksCount})</span>
          </button>
        )}

        {doneTasksCount > 0 && (
          <button
            type="button"
            className="tasks-archive-all-btn"
            title="Archive all Done tasks into project items"
            onClick={() => void handleArchiveAll()}
          >
            <Archive size={14} />
            <span>Archive all ({doneTasksCount})</span>
          </button>
        )}
      </header>

      <form className="task-create" onSubmit={async event => {
        event.preventDefault();
        try {
          const task = await createUserTask({ title: newTitle, projectId: newProjectId || null, parentId: newParentId || null });
          setNewTitle(''); setNewParentId(''); setError(null); onOpenTask(task.id);
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create task.'); }
      }}>
        <input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="Quick task title..." />
        <select value={newProjectId} onChange={event => { setNewProjectId(event.target.value); setNewParentId(''); }} aria-label="Task project">
          <option value="">Workspace Inbox</option>
          {userProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        {newProjectId && (
          <select value={newParentId} onChange={event => setNewParentId(event.target.value)} aria-label="Task context block">
            <option value="">No context block</option>
            {projectBlocks.map(block => <option key={block.id} value={block.id}>{block.title}</option>)}
          </select>
        )}
        <button type="submit"><Plus size={14} /> Add task</button>
      </form>

      {error && <div className="tasks-error">{error}</div>}

      {mode === 'board' ? (
        <div className={`task-board ${isDoneCollapsed ? 'has-done-collapsed' : ''}`}>
          {TASK_STATUSES.map(status => {
            const laneTasks = tasks.filter(task => task.task?.status === status);
            const isDoneLane = status === 'done';

            if (isDoneLane && isDoneCollapsed) {
              return (
                <aside key={status} className="task-lane task-lane-collapsed" onClick={toggleDoneCollapse} title="Expand Done column">
                  <button type="button" className="task-lane-collapsed-btn" aria-label="Expand Done column">
                    <PanelRightOpen size={16} />
                    <span className="task-lane-collapsed-label">Done</span>
                    <span className="task-lane-badge">{laneTasks.length}</span>
                  </button>
                </aside>
              );
            }

            const groups = groupTasks(laneTasks, groupBy);
            const allColumnGroupKeys = groups.map(g => `${status}:${g.id}`);

            return (
              <section key={status} className="task-lane">
                <header>
                  <div className="task-lane-header-title">
                    <span>{TASK_STATUS_LABELS[status]}</span>
                    <small>{laneTasks.length}</small>
                  </div>
                  {isDoneLane && (
                    <div className="task-lane-header-actions">
                      <button
                        type="button"
                        className="task-lane-action-btn icon-only"
                        title="Collapse Done column"
                        aria-label="Collapse Done column"
                        onClick={toggleDoneCollapse}
                      >
                        <PanelRightClose size={14} />
                      </button>
                    </div>
                  )}
                </header>
                <div className="task-lane-content">
                  {groupBy === 'none' ? (
                    laneTasks.map(task => renderTaskCard(task, laneTasks))
                  ) : (
                    groups.map(group => {
                      const groupKey = `${status}:${group.id}`;
                      const isCollapsed = collapsedGroups.has(groupKey);

                      return (
                        <div key={group.id} className="task-group-section">
                          <button
                            type="button"
                            className="task-group-header"
                            onClick={(e) => handleGroupHeaderClick(e, groupKey, allColumnGroupKeys)}
                            aria-expanded={!isCollapsed}
                            title="Click to collapse/expand (Ctrl+Click to collapse/expand all in column)"
                          >
                            <span className="task-group-toggle">
                              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            </span>
                            {group.icon === 'seescribe' ? (
                              <Camera size={13} color="#38bdf8" />
                            ) : group.icon === 'agent' ? (
                              <Bot size={13} color="var(--atmosphere-secondary)" />
                            ) : group.icon === 'user' ? (
                              <User size={13} color="var(--text-secondary)" />
                            ) : (
                              <span
                                className="project-color-pip"
                                style={{ backgroundColor: group.color || DEFAULT_PROJECT_COLOR }}
                              />
                            )}
                            <span className="task-group-title">{group.title}</span>
                            <span className="task-group-count">{group.tasks.length}</span>
                          </button>

                          {!isCollapsed && (
                            <div className="task-group-items">
                              {group.tasks.map(task => renderTaskCard(task, laneTasks))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="task-list">
          {groupBy === 'none' ? (
            tasks.map(task => {
              const isNew = hasUnseenAgentEdits(task);
              const humanId = formatTaskHumanId(task.task?.taskNumber);
              const isSelected = selectedTaskIds.has(task.id);

              return (
                <div
                  key={task.id}
                  className={`task-list-row ${isNew ? 'has-agent-updates' : ''} ${isSelected ? 'is-selected' : ''}`}
                  draggable
                  onDragStart={event => event.dataTransfer.setData('text/deepscribe-task', task.id)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault(); event.stopPropagation();
                    const source = byId.get(event.dataTransfer.getData('text/deepscribe-task'));
                    if (!source || source.id === task.id || !task.task) return;
                    if (source.task?.claim && !window.confirm('This task has an active claim. Move it and release the claim?')) return;
                    void updateUserTaskStatus(source, task.task.status, task.task.position - 0.5).catch(cause => setError(cause.message));
                  }}
                >
                  <button onClick={(e) => handleTaskClick(e, task, tasks)}>
                    {(humanId || isNew) && (
                      <div className="task-card-header-row">
                        {humanId ? (
                          <span
                            className="task-human-id clickable"
                            title="Click to copy task reference"
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyAgentReference(task, 'block');
                              setCopiedTaskId(task.id);
                              setTimeout(() => setCopiedTaskId(null), 2000);
                            }}
                          >
                            {copiedTaskId === task.id ? <CheckCheck size={11} color="#22C55E" /> : humanId}
                          </span>
                        ) : <span />}
                        {isNew && (
                          <span className="task-badge agent-update" title="This task contains unread agent updates">
                            <Bot size={11} /> New
                          </span>
                        )}
                      </div>
                    )}
                    <div className="task-card-title-row">
                      <strong>{task.title}</strong>
                    </div>
                    <div className="task-project-meta">
                      <span className="project-color-pip" style={{ backgroundColor: getTaskProjectColor(task) }} title={projectLabel(task)} />
                      <span>{projectLabel(task)}{contextLabel(task) ? ` · ${contextLabel(task)}` : ''}</span>
                    </div>
                    {taskCreatorLabel(task.task) && <span className="task-creator"><Bot size={11} /> Created by {taskCreatorLabel(task.task)}</span>}
                  </button>
                  <select value={task.task?.status} onChange={event => void moveTask(task, event.target.value as TaskStatus)}>{TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}</select>
                  <select value={task.projectId === TASK_INBOX_PROJECT_ID ? '' : task.projectId} disabled={Boolean(task.task?.claim)} onChange={event => void relocateUserTask(task, event.target.value || null, null).catch(cause => setError(cause.message))}>
                    <option value="">Workspace Inbox</option>{userProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
                  </select>
                  <select disabled={Boolean(task.task?.claim)} value={task.task?.agentTarget ?? 'none'} onChange={event => void updateUserTaskAgent(task, event.target.value as TaskAgentTarget).catch(cause => setError(cause.message))}>{TASK_AGENT_TARGETS.map(target => <option key={target} value={target}>{TASK_AGENT_LABELS[target]}</option>)}</select>
                  <div className="task-list-row-actions">
                    {task.task?.status === 'inbox' && (
                      <button
                        type="button"
                        className="task-card-advance task-card-advance-ready"
                        title="Mark as Ready"
                        aria-label={`Mark ${task.title} as Ready`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveTask(task, 'ready');
                        }}
                      >
                        <ArrowRight size={12} />
                      </button>
                    )}
                    {task.task?.status === 'review' && (
                      <button
                        type="button"
                        className="task-card-advance task-card-advance-done"
                        title="Approve & Mark Done"
                        aria-label={`Approve and mark ${task.title} as Done`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveTask(task, 'done');
                        }}
                      >
                        <Check size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="task-card-copy-ref"
                      title="Copy task reference"
                      aria-label={`Copy reference for ${task.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyAgentReference(task, 'block');
                        setCopiedTaskId(task.id);
                        setTimeout(() => setCopiedTaskId(null), 2000);
                      }}
                    >
                      {copiedTaskId === task.id ? <CheckCheck size={12} color="#22C55E" /> : <Copy size={12} />}
                    </button>
                    {isNew && (
                      <button
                        type="button"
                        className="task-card-mark-read"
                        title="Mark as read"
                        aria-label={`Mark ${task.title} as read`}
                        onClick={(e) => void handleMarkTaskAsRead(e, task.id)}
                      >
                        <CheckCheck size={12} />
                      </button>
                    )}
                    {task.task?.status === 'done' && (
                      <button
                        type="button"
                        className="task-card-archive"
                        title="Archive to project"
                        aria-label={`Archive ${task.title} to project`}
                        onClick={() => void handleArchiveTask(task)}
                      >
                        <Archive size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="task-card-delete"
                      title="Move task to Trash"
                      aria-label={`Move ${task.title} to Trash`}
                      onClick={() => void deleteTask(task)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (() => {
            const listGroups = groupTasks(tasks, groupBy);
            const allListGroupKeys = listGroups.map(g => `list:${g.id}`);

            return listGroups.map(group => {
              const groupKey = `list:${group.id}`;
              const isCollapsed = collapsedGroups.has(groupKey);

              return (
                <div key={group.id} className="task-group-section list-mode">
                  <button
                    type="button"
                    className="task-group-header"
                    onClick={(e) => handleGroupHeaderClick(e, groupKey, allListGroupKeys)}
                    aria-expanded={!isCollapsed}
                    title="Click to collapse/expand (Ctrl+Click to collapse/expand all)"
                  >
                    <span className="task-group-toggle">
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    {group.icon === 'seescribe' ? (
                      <Camera size={14} color="#38bdf8" />
                    ) : group.icon === 'agent' ? (
                      <Bot size={14} color="var(--atmosphere-secondary)" />
                    ) : group.icon === 'user' ? (
                      <User size={14} color="var(--text-secondary)" />
                    ) : (
                      <span
                        className="project-color-pip"
                        style={{ backgroundColor: group.color || DEFAULT_PROJECT_COLOR }}
                      />
                    )}
                    <span className="task-group-title">{group.title}</span>
                    <span className="task-group-count">{group.tasks.length}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="task-group-items">
                      {group.tasks.map(task => {
                        const isNew = hasUnseenAgentEdits(task);
                        const humanId = formatTaskHumanId(task.task?.taskNumber);
                        const isSelected = selectedTaskIds.has(task.id);

                        return (
                          <div
                            key={task.id}
                            className={`task-list-row ${isNew ? 'has-agent-updates' : ''} ${isSelected ? 'is-selected' : ''}`}
                            draggable
                            onDragStart={event => event.dataTransfer.setData('text/deepscribe-task', task.id)}
                            onDragOver={event => event.preventDefault()}
                            onDrop={event => {
                              event.preventDefault(); event.stopPropagation();
                              const source = byId.get(event.dataTransfer.getData('text/deepscribe-task'));
                              if (!source || source.id === task.id || !task.task) return;
                              if (source.task?.claim && !window.confirm('This task has an active claim. Move it and release the claim?')) return;
                              void updateUserTaskStatus(source, task.task.status, task.task.position - 0.5).catch(cause => setError(cause.message));
                            }}
                          >
                            <button onClick={(e) => handleTaskClick(e, task, tasks)}>
                              {(humanId || isNew) && (
                                <div className="task-card-header-row">
                                  {humanId ? (
                                    <span
                                      className="task-human-id clickable"
                                      title="Click to copy task reference"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void copyAgentReference(task, 'block');
                                        setCopiedTaskId(task.id);
                                        setTimeout(() => setCopiedTaskId(null), 2000);
                                      }}
                                    >
                                      {copiedTaskId === task.id ? <CheckCheck size={11} color="#22C55E" /> : humanId}
                                    </span>
                                  ) : <span />}
                                  {isNew && (
                                    <span className="task-badge agent-update" title="This task contains unread agent updates">
                                      <Bot size={11} /> New
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="task-card-title-row">
                                <strong>{task.title}</strong>
                              </div>
                              <div className="task-project-meta">
                                <span className="project-color-pip" style={{ backgroundColor: getTaskProjectColor(task) }} title={projectLabel(task)} />
                                <span>{projectLabel(task)}{contextLabel(task) ? ` · ${contextLabel(task)}` : ''}</span>
                              </div>
                              {taskCreatorLabel(task.task) && <span className="task-creator"><Bot size={11} /> Created by {taskCreatorLabel(task.task)}</span>}
                            </button>
                            <select value={task.task?.status} onChange={event => void moveTask(task, event.target.value as TaskStatus)}>{TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}</select>
                            <select value={task.projectId === TASK_INBOX_PROJECT_ID ? '' : task.projectId} disabled={Boolean(task.task?.claim)} onChange={event => void relocateUserTask(task, event.target.value || null, null).catch(cause => setError(cause.message))}>
                              <option value="">Workspace Inbox</option>{userProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
                            </select>
                            <select disabled={Boolean(task.task?.claim)} value={task.task?.agentTarget ?? 'none'} onChange={event => void updateUserTaskAgent(task, event.target.value as TaskAgentTarget).catch(cause => setError(cause.message))}>{TASK_AGENT_TARGETS.map(target => <option key={target} value={target}>{TASK_AGENT_LABELS[target]}</option>)}</select>
                            <div className="task-list-row-actions">
                              {task.task?.status === 'inbox' && (
                                <button
                                  type="button"
                                  className="task-card-advance task-card-advance-ready"
                                  title="Mark as Ready"
                                  aria-label={`Mark ${task.title} as Ready`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void moveTask(task, 'ready');
                                  }}
                                >
                                  <ArrowRight size={12} />
                                </button>
                              )}
                              {task.task?.status === 'review' && (
                                <button
                                  type="button"
                                  className="task-card-advance task-card-advance-done"
                                  title="Approve & Mark Done"
                                  aria-label={`Approve and mark ${task.title} as Done`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void moveTask(task, 'done');
                                  }}
                                >
                                  <Check size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="task-card-copy-ref"
                                title="Copy task reference"
                                aria-label={`Copy reference for ${task.title}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyAgentReference(task, 'block');
                                  setCopiedTaskId(task.id);
                                  setTimeout(() => setCopiedTaskId(null), 2000);
                                }}
                              >
                                {copiedTaskId === task.id ? <CheckCheck size={12} color="#22C55E" /> : <Copy size={12} />}
                              </button>
                              {isNew && (
                                <button
                                  type="button"
                                  className="task-card-mark-read"
                                  title="Mark as read"
                                  aria-label={`Mark ${task.title} as read`}
                                  onClick={(e) => void handleMarkTaskAsRead(e, task.id)}
                                >
                                  <CheckCheck size={12} />
                                </button>
                              )}
                              {task.task?.status === 'done' && (
                                <button
                                  type="button"
                                  className="task-card-archive"
                                  title="Archive to project"
                                  aria-label={`Archive ${task.title} to project`}
                                  onClick={() => void handleArchiveTask(task)}
                                >
                                  <Archive size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="task-card-delete"
                                title="Move task to Trash"
                                aria-label={`Move ${task.title} to Trash`}
                                onClick={() => void deleteTask(task)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <FloatingBulkActionBar
        selectedCount={selectedTaskIds.size}
        selectedTasks={selectedTasks}
        projects={userProjects}
        onUpdateStatus={handleBulkStatus}
        onRelocateProject={handleBulkRelocate}
        onUpdateAgent={handleBulkAgent}
        onMarkRead={handleBulkMarkRead}
        onDelete={handleBulkDelete}
        onClearSelection={() => {
          setSelectedTaskIds(new Set());
          setLastSelectedTaskId(null);
        }}
      />

      {/* Archive Modal */}
      {archiveModal && (
        <div className="task-archive-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="archive-modal-title">
          <div className="task-archive-modal">
            <div className="task-archive-modal-header">
              <FolderArchive size={18} color="var(--atmosphere-secondary)" />
              <h3 id="archive-modal-title">
                {archiveModal.type === 'single' ? 'Archive Task' : 'Archive All Done Tasks'}
              </h3>
            </div>
            <p className="task-archive-modal-description">
              {archiveModal.type === 'single'
                ? `Task “${archiveModal.task?.title}” is currently in the Workspace Inbox. Choose a project to move this task to its Archive section:`
                : 'Some completed tasks are in the Workspace Inbox. Choose a project where inbox tasks should be archived:'}
            </p>
            <div className="task-archive-modal-field">
              <label htmlFor="archive-project-select">Target Project</label>
              <select
                id="archive-project-select"
                value={archiveProjectId}
                onChange={e => setArchiveProjectId(e.target.value)}
                autoFocus
              >
                {userProjects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="task-archive-modal-actions">
              <button
                type="button"
                className="task-archive-modal-cancel"
                onClick={() => setArchiveModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="task-archive-modal-confirm"
                onClick={confirmArchiveModal}
                disabled={!archiveProjectId}
              >
                Archive Task{archiveModal.type === 'all' ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
