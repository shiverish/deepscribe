import React, { useMemo, useState } from 'react';
import { Bot, Columns3, List, Plus, Search, Trash2 } from 'lucide-react';
import type { Block, Project, TaskAgentTarget, TaskStatus } from '../../types';
import { taskCreatorLabel, TASK_AGENT_LABELS, TASK_AGENT_TARGETS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import { createUserTask, relocateUserTask, updateUserTaskAgent, updateUserTaskStatus } from '../../utils/taskManagement';
import './Tasks.css';

interface TasksViewProps {
  projects: Project[];
  blocks: Block[];
  onOpenTask: (blockId: string) => void;
  onDeleteTask: (task: Block) => Promise<void>;
}

export const TasksView: React.FC<TasksViewProps> = ({ projects, blocks, onOpenTask, onDeleteTask }) => {
  const [mode, setMode] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(blocks.map(block => [block.id, block])), [blocks]);
  const tasks = useMemo(() => blocks
    .filter(block => !block.isTrash && block.kind === 'task' && block.task)
    .filter(block => projectFilter === 'all' || (projectFilter === 'inbox' ? block.projectId === TASK_INBOX_PROJECT_ID : block.projectId === projectFilter))
    .filter(block => statusFilter === 'all' || block.task?.status === statusFilter)
    .filter(block => !query.trim() || `${block.title} ${block.plainText}`.toLocaleLowerCase('en-US').includes(query.trim().toLocaleLowerCase('en-US')))
    .sort((left, right) => (left.task?.position ?? left.order) - (right.task?.position ?? right.order) || left.createdAt - right.createdAt), [blocks, projectFilter, query, statusFilter]);
  const projectBlocks = blocks.filter(block => !block.isTrash && block.projectId === newProjectId && block.kind !== 'task');

  const projectLabel = (task: Block) => {
    if (task.projectId === TASK_INBOX_PROJECT_ID) return 'Workspace Inbox';
    return projects.find(project => project.id === task.projectId)?.title ?? 'Unknown project';
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

  const card = (task: Block) => (
    <article
      key={task.id}
      className="task-card"
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
        <strong>{task.title}</strong>
        <span>{projectLabel(task)}{contextLabel(task) ? ` · ${contextLabel(task)}` : ''}</span>
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
        <button className="task-card-delete" title="Move task to Trash" onClick={() => void deleteTask(task)}><Trash2 size={12} /></button>
      </div>
    </article>
  );

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
      </header>

      <form className="task-create" onSubmit={async event => {
        event.preventDefault();
        try {
          const task = await createUserTask({ title: newTitle, projectId: newProjectId || null, parentId: newParentId || null });
          setNewTitle(''); setNewParentId(''); setError(null); onOpenTask(task.id);
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the task.'); }
      }}>
        <input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="New task..." />
        <select value={newProjectId} onChange={event => { setNewProjectId(event.target.value); setNewParentId(''); }} aria-label="New task project">
          <option value="">Workspace Inbox</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        <select value={newParentId} disabled={!newProjectId} onChange={event => setNewParentId(event.target.value)} aria-label="New task context">
          <option value="">No context block</option>{projectBlocks.map(block => <option key={block.id} value={block.id}>{block.title}</option>)}
        </select>
        <button type="submit"><Plus size={14} /> New task</button>
      </form>

      {error && <p className="tasks-error" role="alert">{error}</p>}
      {mode === 'board' ? (
        <div className="task-board">
          {TASK_STATUSES.map(status => <section key={status} className="task-lane" onDragOver={event => event.preventDefault()} onDrop={event => {
            const id = event.dataTransfer.getData('text/deepscribe-task');
            const task = byId.get(id); if (task) void moveTask(task, status);
          }}>
            <header><span>{TASK_STATUS_LABELS[status]}</span><small>{tasks.filter(task => task.task?.status === status).length}</small></header>
            <div>{tasks.filter(task => task.task?.status === status).map(card)}</div>
          </section>)}
        </div>
      ) : (
        <div className="task-list">
          {tasks.map(task => <div className="task-list-row" key={task.id} draggable onDragStart={event => event.dataTransfer.setData('text/deepscribe-task', task.id)} onDragOver={event => event.preventDefault()} onDrop={event => {
            event.preventDefault();
            const source = byId.get(event.dataTransfer.getData('text/deepscribe-task'));
            if (!source || source.id === task.id || !task.task) return;
            if (source.task?.claim && !window.confirm('This task has an active claim. Move it and release the claim?')) return;
            void updateUserTaskStatus(source, task.task.status, task.task.position - 0.5).catch(cause => setError(cause.message));
          }}>
            <button onClick={() => onOpenTask(task.id)}><strong>{task.title}</strong><span>{projectLabel(task)}{contextLabel(task) ? ` · ${contextLabel(task)}` : ''}</span>{taskCreatorLabel(task.task) && <span className="task-creator"><Bot size={11} /> Created by {taskCreatorLabel(task.task)}</span>}</button>
            <select value={task.task?.status} onChange={event => void moveTask(task, event.target.value as TaskStatus)}>{TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}</select>
            <select value={task.projectId === TASK_INBOX_PROJECT_ID ? '' : task.projectId} disabled={Boolean(task.task?.claim)} onChange={event => void relocateUserTask(task, event.target.value || null, null).catch(cause => setError(cause.message))}>
              <option value="">Workspace Inbox</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            <select value={task.parentId ?? ''} disabled={Boolean(task.task?.claim) || task.projectId === TASK_INBOX_PROJECT_ID} onChange={event => void relocateUserTask(task, task.projectId, event.target.value || null).catch(cause => setError(cause.message))} aria-label={`Context for ${task.title}`}>
              <option value="">No context block</option>
              {blocks.filter(block => !block.isTrash && block.kind !== 'task' && block.projectId === task.projectId).map(block => <option key={block.id} value={block.id}>{block.title}</option>)}
            </select>
            <button className="task-card-delete" title="Move task to Trash" onClick={() => void deleteTask(task)}><Trash2 size={13} /></button>
          </div>)}
        </div>
      )}
    </section>
  );
};
