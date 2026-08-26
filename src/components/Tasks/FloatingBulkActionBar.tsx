import React, { useState, useRef, useEffect } from 'react';
import type { Block, Project, TaskAgentTarget, TaskStatus } from '../../types';
import { TASK_AGENT_LABELS, TASK_AGENT_TARGETS, TASK_STATUSES, TASK_STATUS_LABELS } from '../../utils/taskBlocks';
import { DEFAULT_PROJECT_COLOR } from '../../utils/projectColors';
import { CheckCircle2, Folder, Bot, Eye, Trash2, X, ChevronUp, Loader2 } from 'lucide-react';

interface FloatingBulkActionBarProps {
  selectedCount: number;
  selectedTasks: Block[];
  projects: Project[];
  onUpdateStatus: (status: TaskStatus) => Promise<void>;
  onRelocateProject: (projectId: string | null) => Promise<void>;
  onUpdateAgent: (agentTarget: TaskAgentTarget, customAgentName?: string) => Promise<void>;
  onMarkRead: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClearSelection: () => void;
}

export const FloatingBulkActionBar: React.FC<FloatingBulkActionBarProps> = ({
  selectedCount,
  selectedTasks,
  projects,
  onUpdateStatus,
  onRelocateProject,
  onUpdateAgent,
  onMarkRead,
  onDelete,
  onClearSelection
}) => {
  const [activeMenu, setActiveMenu] = useState<'status' | 'project' | 'agent' | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeMenu]);

  if (selectedCount === 0) return null;

  const hasUnread = selectedTasks.some(
    t => t.lastAgentEditAt && t.lastSeenAgentEditAt !== t.lastAgentEditAt
  );

  const handleStatusChange = async (status: TaskStatus) => {
    setIsBusy(true);
    setActiveMenu(null);
    try {
      await onUpdateStatus(status);
    } finally {
      setIsBusy(false);
    }
  };

  const handleProjectChange = async (projectId: string | null) => {
    setIsBusy(true);
    setActiveMenu(null);
    try {
      await onRelocateProject(projectId);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAgentChange = async (target: TaskAgentTarget) => {
    setIsBusy(true);
    setActiveMenu(null);
    try {
      await onUpdateAgent(target);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Move ${selectedCount} selected ${selectedCount === 1 ? 'task' : 'tasks'} to trash?`)) return;
    setIsBusy(true);
    try {
      await onDelete();
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkRead = async () => {
    setIsBusy(true);
    try {
      await onMarkRead();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="floating-bulk-action-bar" ref={containerRef} role="toolbar" aria-label="Bulk actions">
      <div className="bulk-bar-selection-info">
        <span className="bulk-bar-count-badge">{selectedCount}</span>
        <span>{selectedCount === 1 ? 'task selected' : 'tasks selected'}</span>
      </div>

      <div className="bulk-bar-divider" />

      <div className="bulk-bar-actions">
        {/* Move Status Menu */}
        <div className="bulk-bar-menu-wrapper">
          <button
            type="button"
            className={`bulk-bar-btn ${activeMenu === 'status' ? 'active' : ''}`}
            onClick={() => setActiveMenu(prev => prev === 'status' ? null : 'status')}
            disabled={isBusy}
            title="Change status for selected tasks"
          >
            <CheckCircle2 size={13} />
            <span>Status</span>
            <ChevronUp size={12} className={`bulk-chevron ${activeMenu === 'status' ? 'open' : ''}`} />
          </button>

          {activeMenu === 'status' && (
            <div className="bulk-popover-menu" role="menu">
              <div className="bulk-popover-header">Move to status</div>
              {TASK_STATUSES.map(status => (
                <button
                  key={status}
                  type="button"
                  className="bulk-popover-item"
                  onClick={() => void handleStatusChange(status)}
                >
                  {TASK_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Move Project Menu */}
        <div className="bulk-bar-menu-wrapper">
          <button
            type="button"
            className={`bulk-bar-btn ${activeMenu === 'project' ? 'active' : ''}`}
            onClick={() => setActiveMenu(prev => prev === 'project' ? null : 'project')}
            disabled={isBusy}
            title="Assign project for selected tasks"
          >
            <Folder size={13} />
            <span>Project</span>
            <ChevronUp size={12} className={`bulk-chevron ${activeMenu === 'project' ? 'open' : ''}`} />
          </button>

          {activeMenu === 'project' && (
            <div className="bulk-popover-menu project-menu" role="menu">
              <div className="bulk-popover-header">Assign to project</div>
              <button
                type="button"
                className="bulk-popover-item"
                onClick={() => void handleProjectChange(null)}
              >
                <span className="project-color-pip" style={{ backgroundColor: 'var(--atmosphere-color)' }} />
                <span>Workspace Inbox</span>
              </button>
              {projects.map(project => (
                <button
                  key={project.id}
                  type="button"
                  className="bulk-popover-item"
                  onClick={() => void handleProjectChange(project.id)}
                >
                  <span
                    className="project-color-pip"
                    style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
                  />
                  <span>{project.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assign Agent Menu */}
        <div className="bulk-bar-menu-wrapper">
          <button
            type="button"
            className={`bulk-bar-btn ${activeMenu === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveMenu(prev => prev === 'agent' ? null : 'agent')}
            disabled={isBusy}
            title="Assign agent for selected tasks"
          >
            <Bot size={13} />
            <span>Agent</span>
            <ChevronUp size={12} className={`bulk-chevron ${activeMenu === 'agent' ? 'open' : ''}`} />
          </button>

          {activeMenu === 'agent' && (
            <div className="bulk-popover-menu" role="menu">
              <div className="bulk-popover-header">Assign to agent</div>
              {TASK_AGENT_TARGETS.map(target => (
                <button
                  key={target}
                  type="button"
                  className="bulk-popover-item"
                  onClick={() => void handleAgentChange(target)}
                >
                  {TASK_AGENT_LABELS[target]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mark as Read */}
        {hasUnread && (
          <button
            type="button"
            className="bulk-bar-btn"
            onClick={() => void handleMarkRead()}
            disabled={isBusy}
            title="Mark unread agent updates as read"
          >
            <Eye size={13} />
            <span>Mark read</span>
          </button>
        )}

        {/* Delete */}
        <button
          type="button"
          className="bulk-bar-btn danger"
          onClick={() => void handleDelete()}
          disabled={isBusy}
          title="Move selected tasks to trash"
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </button>

        {isBusy && <Loader2 size={14} className="animate-spin text-muted" />}
      </div>

      <div className="bulk-bar-divider" />

      {/* Clear Selection */}
      <button
        type="button"
        className="bulk-bar-close-btn"
        onClick={onClearSelection}
        title="Clear selection (Esc)"
        aria-label="Clear selection"
      >
        <X size={14} />
      </button>
    </div>
  );
};
