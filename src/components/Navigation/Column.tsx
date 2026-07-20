import React from 'react';
import type { Project, Block, DragTarget } from '../../types';
import { Card } from './Card';
import { Plus, FolderPlus, Inbox } from 'lucide-react';

interface ColumnProps {
  level: number;
  title: string;
  items: (Project | Block)[];
  type: 'project' | 'block';
  selectedId: string | null;
  focusedCardId?: string | null;
  isActiveLevel: boolean;
  onSelectItem: (item: Project | Block) => void;
  onAddNewItem: () => void;
  onAddChildItem?: (parentId: string) => void;
  onContextMenuItem?: (e: React.MouseEvent, item: Project | Block, type: 'project' | 'block') => void;
  dragTarget?: DragTarget | null;
  onDragStart?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragOver?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => void;
}

export const Column: React.FC<ColumnProps> = ({
  level,
  title,
  items,
  type,
  selectedId,
  focusedCardId,
  isActiveLevel,
  onSelectItem,
  onAddNewItem,
  onAddChildItem,
  onContextMenuItem,
  dragTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop
}) => {
  return (
    <div className={`miller-column ${isActiveLevel ? 'active-level' : ''}`}>
      <div className="column-header">
        <div className="column-title">
          <span className="column-badge">L{level}</span>
          <span>{title}</span>
        </div>
        <button
          className="icon-btn-subtle"
          onClick={onAddNewItem}
          title={type === 'project' ? 'Nieuw Project' : 'Nieuw Blok'}
          style={{
            background: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            color: 'var(--neon-cyan)',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '4px 8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.75rem',
            fontWeight: 500
          }}
        >
          {type === 'project' ? <FolderPlus size={14} /> : <Plus size={14} />}
          <span>Nieuw</span>
        </button>
      </div>

      <div className="column-body">
        {items.length === 0 ? (
          <div className="empty-column-notice">
            <Inbox size={24} color="#64748B" />
            <p>Geen onderdelen op dit niveau.</p>
            <button
              onClick={onAddNewItem}
              style={{
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid var(--neon-cyan)',
                color: 'var(--neon-cyan)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 500
              }}
            >
              + {type === 'project' ? 'Nieuw Project Maken' : 'Eerste Blok Toevoegen'}
            </button>
          </div>
        ) : (
          items.map((item) => (
            <Card
              key={item.id}
              item={item}
              type={type}
              isSelected={selectedId === item.id}
              isKeyboardFocused={focusedCardId === item.id}
              onSelect={() => onSelectItem(item)}
              onContextMenu={onContextMenuItem}
              onAddChild={onAddChildItem}
              dragTarget={dragTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ))
        )}

        {items.length > 0 && (
          <button className="column-add-btn" onClick={onAddNewItem}>
            <Plus size={14} />
            <span>Nieuw {type === 'project' ? 'project' : 'blok'} toevoegen</span>
          </button>
        )}
      </div>
    </div>
  );
};
