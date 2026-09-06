import React, { useEffect, useRef, useState } from 'react';
import type { Block, Project, TaskAgentTarget } from '../../types';
import { extractProjectHint } from '../../utils/quickCapture';
import { getProjectColor } from '../../utils/projectColors';
import { Bot, Check, ChevronRight, FileText, Folder, Trash2, Zap } from 'lucide-react';

export interface CaptureContextMenuProps {
  x: number;
  y: number;
  capture: Block;
  projects: Project[];
  onClose: () => void;
  onOpen: (captureId: string) => void;
  onConvert: (capture: Block) => Promise<void>;
  onDelete: (capture: Block) => Promise<void>;
  onUpdateAgent: (capture: Block, agent: TaskAgentTarget) => Promise<void>;
  onUpdateProject: (capture: Block, projectId: string | null) => Promise<void>;
}

const AGENT_OPTIONS: Array<{ target: TaskAgentTarget; label: string }> = [
  { target: 'none', label: 'None' },
  { target: 'openai', label: 'Codex' },
  { target: 'claude', label: 'Claude' },
  { target: 'gemini', label: 'Gemini' },
  { target: 'any', label: 'Any agent' }
];

export const CaptureContextMenu: React.FC<CaptureContextMenuProps> = ({
  x,
  y,
  capture,
  projects,
  onClose,
  onOpen,
  onConvert,
  onDelete,
  onUpdateAgent,
  onUpdateProject
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'project' | 'agent' | null>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeSubmenu) {
          setActiveSubmenu(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, activeSubmenu]);

  const menuWidth = 210;
  const menuHeight = 220;
  const adjustedX = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(Math.max(8, y), window.innerHeight - menuHeight - 10);

  const openSubmenuLeft = adjustedX + menuWidth + 210 > window.innerWidth;

  const { hintName } = extractProjectHint(capture.plainText || '');
  const activeProject = hintName
    ? projects.find(p => !p.isTrash && p.title.trim().toLowerCase() === hintName.trim().toLowerCase())
    : undefined;
  const currentAgent = capture.captureAgentTarget || 'none';

  const activeProjects = projects.filter(p => !p.isTrash && p.systemKind !== 'task-inbox');

  return (
    <div
      ref={menuRef}
      className="capture-context-menu"
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        width: menuWidth,
        background: 'var(--bg-surface)',
        backdropFilter: 'var(--glass-backdrop)',
        border: '1px solid var(--neon-cyan, #00f0ff)',
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)',
        zIndex: 1000,
        padding: '6px 0',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none'
      }}
    >
      <div
        style={{
          padding: '4px 14px 6px',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-subtle)',
          letterSpacing: '0.03em',
          textTransform: 'uppercase'
        }}
      >
        Capture Options
      </div>

      {/* Project Submenu Item */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setActiveSubmenu('project')}
      >
        <button
          type="button"
          className="capture-menu-item"
          onClick={() => setActiveSubmenu(prev => prev === 'project' ? null : 'project')}
          style={{
            width: '100%',
            padding: '8px 12px 8px 14px',
            background: activeSubmenu === 'project' ? 'rgba(255, 255, 255, 0.07)' : 'none',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            textAlign: 'left'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Folder size={14} color="#f59e0b" />
            <span>Project</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProject ? activeProject.title : 'None'}
            </span>
            <ChevronRight size={13} />
          </span>
        </button>

        {activeSubmenu === 'project' && (
          <div
            className="capture-submenu"
            style={{
              position: 'absolute',
              top: 0,
              ...(openSubmenuLeft ? { right: '100%', marginRight: 4 } : { left: '100%', marginLeft: 4 }),
              minWidth: '200px',
              maxWidth: '260px',
              maxHeight: '280px',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              backdropFilter: 'var(--glass-backdrop)',
              border: '1px solid var(--neon-cyan, #00f0ff)',
              borderRadius: 'var(--radius-md, 8px)',
              boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)',
              zIndex: 1001,
              padding: '4px 0'
            }}
          >
            <button
              type="button"
              className="capture-menu-item"
              onClick={async () => {
                await onUpdateProject(capture, null);
                onClose();
              }}
              style={{
                width: '100%',
                padding: '7px 12px',
                background: !activeProject ? 'rgba(255, 255, 255, 0.08)' : 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                textAlign: 'left'
              }}
            >
              <span>None (Workspace Inbox)</span>
              {!activeProject && <Check size={13} color="#22c55e" />}
            </button>

            {activeProjects.length > 0 && (
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            )}

            {activeProjects.map(proj => {
              const isSelected = activeProject?.id === proj.id;
              const color = getProjectColor(proj.color);
              return (
                <button
                  key={proj.id}
                  type="button"
                  className="capture-menu-item"
                  onClick={async () => {
                    await onUpdateProject(capture, proj.id);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                    textAlign: 'left',
                    gap: 8
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proj.title}
                    </span>
                  </span>
                  {isSelected && <Check size={13} color="#22c55e" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Submenu Item */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setActiveSubmenu('agent')}
      >
        <button
          type="button"
          className="capture-menu-item"
          onClick={() => setActiveSubmenu(prev => prev === 'agent' ? null : 'agent')}
          style={{
            width: '100%',
            padding: '8px 12px 8px 14px',
            background: activeSubmenu === 'agent' ? 'rgba(255, 255, 255, 0.07)' : 'none',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            textAlign: 'left'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={14} color="#38bdf8" />
            <span>Agent</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            <span>
              {AGENT_OPTIONS.find(o => o.target === currentAgent)?.label || currentAgent}
            </span>
            <ChevronRight size={13} />
          </span>
        </button>

        {activeSubmenu === 'agent' && (
          <div
            className="capture-submenu"
            style={{
              position: 'absolute',
              top: 0,
              ...(openSubmenuLeft ? { right: '100%', marginRight: 4 } : { left: '100%', marginLeft: 4 }),
              minWidth: '160px',
              background: 'var(--bg-surface)',
              backdropFilter: 'var(--glass-backdrop)',
              border: '1px solid var(--neon-cyan, #00f0ff)',
              borderRadius: 'var(--radius-md, 8px)',
              boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)',
              zIndex: 1001,
              padding: '4px 0'
            }}
          >
            {AGENT_OPTIONS.map(option => {
              const isSelected = currentAgent === option.target;
              return (
                <button
                  key={option.target}
                  type="button"
                  className="capture-menu-item"
                  onClick={async () => {
                    await onUpdateAgent(capture, option.target);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                    textAlign: 'left'
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check size={13} color="#22c55e" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

      {/* Convert to Ready Task */}
      <button
        type="button"
        className="capture-menu-item"
        onClick={() => {
          onClose();
          void onConvert(capture);
        }}
        style={{
          width: '100%',
          padding: '8px 14px',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8rem',
          textAlign: 'left'
        }}
      >
        <Zap size={14} color="#f59e0b" />
        <span>Convert to Ready Task</span>
      </button>

      {/* Open in Writing Panel */}
      <button
        type="button"
        className="capture-menu-item"
        onClick={() => {
          onClose();
          onOpen(capture.id);
        }}
        style={{
          width: '100%',
          padding: '8px 14px',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8rem',
          textAlign: 'left'
        }}
      >
        <FileText size={14} color="#00f0ff" />
        <span>Open in Writing Panel</span>
      </button>

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

      {/* Move to trash */}
      <button
        type="button"
        className="capture-menu-item"
        onClick={() => {
          onClose();
          void onDelete(capture);
        }}
        style={{
          width: '100%',
          padding: '8px 14px',
          background: 'none',
          border: 'none',
          color: '#ff007f',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8rem',
          textAlign: 'left'
        }}
      >
        <Trash2 size={14} />
        <span>Move to trash</span>
      </button>
    </div>
  );
};
