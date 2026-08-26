import React, { useMemo, useState } from 'react';
import { Archive, Bot, CheckCheck, Columns3, Copy, FolderArchive, List, PanelRightClose, PanelRightOpen, Plus, Search, Trash2 } from 'lucide-react';
import type { Block, Project, TaskAgentTarget, TaskStatus } from '../../types';
import { formatTaskHumanId, taskCreatorLabel, TASK_AGENT_LABELS, TASK_AGENT_TARGETS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import { copyAgentReference } from '../../utils/agentReferences';
import { archiveDoneTasks, archiveUserTask, createUserTask, relocateUserTask, updateUserTaskAgent, updateUserTaskStatus } from '../../utils/taskManagement';
import { hasUnseenAgentEdits } from '../../utils/agentEdits';
import { getProjectColor, INBOX_PROJECT_COLOR } from '../../utils/projectColors';
import { markBlockSubtreeAsRead } from '../../db/operations';
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

export const TasksView: React.FC<TasksViewProps> = ({ projects, blocks, onOpenTask, onDeleteTask }) => {
  const [mode, setMode] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
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

  const byId = useMemo(() => new Map(blocks.map(block => [block.id, block])), [blocks]);
  const userProjects = useMemo(() => projects.filter(p => !p.isTrash && p.id !== TASK_INBOX_PROJECT_ID && p.systemKind !== 'task-inbox'), [projects]);

  const tasks = useMemo(() => blocks
    .filter(block => !block.isTrash && block.kind === 'task' && block.task)
    .filter(block => projectFilter === 'all' || (projectFilter === 'inbox' ? block.projectId === TASK_INBOX_PROJECT_ID : block.projectId === projectFilter))
    .filter(block => statusFilter === 'all' || block.task?.status === statusFilter)
    .filter(block => !query.trim() || `${block.title} ${block.plainText}`.toLocaleLowerCase('en-US').includes(query.trim().toLocaleLowerCase('en-US')))
    .sort((left, right) => (left.task?.position ?? left.order) - (right.task?.position ?? right.order) || left.createdAt - right.createdAt), [blocks, projectFilter, query, statusFilter]);

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

  const card = (task: Block) => {
    const isNew = hasUnseenAgentEdits(task);
    const humanId = formatTaskHumanId(task.task?.taskNumber);
    return (
      <article
        key={task.id}
        className={`task-card ${isNew ? 'has-agent-updates' : ''}`}
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
        <button className="task-card-open" onClick={() => onOpenTask(task.id)}>
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
            <button
              type="button"
              className="task-card-copy-ref"
              title="Copy task reference with deep link"
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

  return (
    <section className="tasks-view">
      <header className="tasks-toolbar">
        <div className="tasks-mode-switch">
          <button className={mode === 'board' ? 'active' : ''} onClick={() => setMode('board')}><Columns3 size={14} /> Board</button>
          <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}><List size={14} /> List</button>
        </div>
        <label className="tasks-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks..." /></label>
        <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} aria-label="Filter tasks by project">
          <option value="all">All projects</option><option value="inbox">Workspace Inbox</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | TaskStatus)} aria-label="Filter tasks by status">
          <option value="all">All statuses</option>{TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}
        </select>
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
          <option value="">Workspace Inbox</option>{userProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
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
                <div>{laneTasks.map(task => card(task))}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="task-list">
          {tasks.map(task => {
            const isNew = hasUnseenAgentEdits(task);
            const humanId = formatTaskHumanId(task.task?.taskNumber);
            return (
              <div
                key={task.id}
                className={`task-list-row ${isNew ? 'has-agent-updates' : ''}`}
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
                <button onClick={() => onOpenTask(task.id)}>
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
                  <option value="">Workspace Inbox</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
                <select value={task.parentId ?? ''} disabled={Boolean(task.task?.claim) || task.projectId === TASK_INBOX_PROJECT_ID} onChange={event => void relocateUserTask(task, task.projectId, event.target.value || null).catch(cause => setError(cause.message))} aria-label={`Context for ${task.title}`}>
                  <option value="">No context block</option>
                  {blocks.filter(block => !block.isTrash && block.kind !== 'task' && block.projectId === task.projectId).map(block => <option key={block.id} value={block.id}>{block.title}</option>)}
                </select>
                <div className="task-list-row-actions">
                  <button
                    type="button"
                    className="task-card-copy-ref"
                    title="Copy task reference with deep link"
                    aria-label={`Copy reference for ${task.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyAgentReference(task, 'block');
                      setCopiedTaskId(task.id);
                      setTimeout(() => setCopiedTaskId(null), 2000);
                    }}
                  >
                    {copiedTaskId === task.id ? <CheckCheck size={13} color="#22C55E" /> : <Copy size={13} />}
                  </button>
                  {isNew && (
                    <button
                      type="button"
                      className="task-card-mark-read"
                      title="Mark as read"
                      aria-label={`Mark ${task.title} as read`}
                      onClick={(e) => void handleMarkTaskAsRead(e, task.id)}
                    >
                      <CheckCheck size={13} />
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
                      <Archive size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="task-card-delete"
                    title="Move task to Trash"
                    aria-label={`Move ${task.title} to Trash`}
                    onClick={() => void deleteTask(task)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archiveModal && (
        <div className="task-archive-modal-overlay" onClick={() => setArchiveModal(null)}>
          <div className="task-archive-modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="archive-modal-title">
            <header className="task-archive-modal-header">
              <div className="task-archive-modal-heading">
                <FolderArchive size={18} />
                <h3 id="archive-modal-title">
                  {archiveModal.type === 'single' ? 'Archive Task to Project' : 'Archive Completed Tasks'}
                </h3>
              </div>
            </header>
            <div className="task-archive-modal-body">
              <p>
                {archiveModal.type === 'single'
                  ? `“${archiveModal.task?.title}” is currently in the Workspace Inbox. Choose a destination project to archive it into under an “Archive” section:`
                  : 'Some completed tasks are currently in the Workspace Inbox. Select a destination project for inbox tasks:'}
              </p>
              {userProjects.length > 0 ? (
                <label className="task-archive-field">
                  <span>Destination Project</span>
                  <select
                    className="task-archive-select"
                    value={archiveProjectId}
                    onChange={event => setArchiveProjectId(event.target.value)}
                    aria-label="Select destination project"
                  >
                    {userProjects.map(project => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="task-archive-no-projects">Please create a project first before archiving tasks from the inbox.</p>
              )}
            </div>
            <footer className="task-archive-modal-footer">
              <button type="button" className="task-archive-btn-secondary" onClick={() => setArchiveModal(null)}>Cancel</button>
              <button
                type="button"
                className="task-archive-btn-primary"
                disabled={!archiveProjectId || userProjects.length === 0}
                onClick={() => void confirmArchiveModal()}
              >
                Archive
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
};

