import React, { useEffect, useRef } from 'react';
import type { Block, Project } from '../../types';
import { Plus, Copy, CheckCheck, Trash2, ClipboardCopy, ListTodo, RefreshCw } from 'lucide-react';
import { copyAgentReference } from '../../utils/agentReferences';

interface ContextMenuProps {
  x: number;
  y: number;
  item: Block | Project;
  type: 'project' | 'block';
  onClose: () => void;
  onAddChild: (parentId: string) => void;
  onAddTask: (parentId: string) => void;
  onConvertToTask: (blockId: string) => void;
  onDuplicate: (item: Block | Project, type: 'project' | 'block') => void;
  onMarkAsRead: (item: Block | Project, type: 'project' | 'block') => void;
  onDelete: (item: Block | Project, type: 'project' | 'block') => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  item,
  type,
  onClose,
  onAddChild,
  onAddTask,
  onConvertToTask,
  onDuplicate,
  onMarkAsRead,
  onDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.max(8, Math.min(y, window.innerHeight - 240));

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        width: '200px',
        background: 'var(--bg-surface)',
        backdropFilter: 'var(--glass-backdrop)',
        border: '1px solid var(--neon-cyan)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)',
        zIndex: 1000,
        padding: '6px 0',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
        {type === 'project' ? 'Project Options' : 'Block Options'}
      </div>

      <button
        style={{
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
        onClick={() => {
          onAddChild(item.id);
          onClose();
        }}
      >
        <Plus size={14} color="#00F0FF" />
        <span>New child block</span>
      </button>

      {type === 'block' && (
        <button
          style={{ padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', textAlign: 'left' }}
          onClick={() => { onAddTask(item.id); onClose(); }}
        >
          <ListTodo size={14} color="#A78BFA" />
          <span>New task</span>
        </button>
      )}

      {type === 'block' && !(item as Block).kind && (
        <button
          style={{ padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', textAlign: 'left' }}
          onClick={() => { onConvertToTask(item.id); onClose(); }}
        >
          <RefreshCw size={14} color="#F59E0B" />
          <span>Convert to task</span>
        </button>
      )}

      <button
        style={{
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
        onClick={() => {
          onDuplicate(item, type);
          onClose();
        }}
      >
        <Copy size={14} color="#38BDF8" />
        <span>Duplicate</span>
      </button>

      <button
        style={{
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
        onClick={async () => {
          try {
            await copyAgentReference(item, type);
          } catch (error) {
            console.error('Failed to copy agent reference.', error);
          }
          onClose();
        }}
      >
        <ClipboardCopy size={14} color="#A78BFA" />
        <span>Copy agent reference</span>
      </button>

      <button
        style={{
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
        onClick={() => {
          onMarkAsRead(item, type);
          onClose();
        }}
      >
        <CheckCheck size={14} color="#22C55E" />
        <span>Mark as read</span>
      </button>

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

      <button
        style={{
          padding: '8px 14px',
          background: 'none',
          border: 'none',
          color: '#FF007F',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8rem',
          textAlign: 'left'
        }}
        onClick={() => {
          onDelete(item, type);
          onClose();
        }}
      >
        <Trash2 size={14} />
        <span>Move to trash</span>
      </button>
    </div>
  );
};
