import React, { useState, useMemo } from 'react';
import type { Project, Block, DragTarget } from '../../types';
import { Card } from './Card';
import { TagBadge } from './TagBadge';
import { Plus, FolderPlus, Inbox, Filter } from 'lucide-react';

interface ColumnProps {
  level: number;
  title: string;
  items: (Project | Block)[];
  type: 'project' | 'block';
  selectedId: string | null;
  focusedCardId?: string | null;
  isActiveLevel: boolean;
  isCurrentLevel: boolean;
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
  isCurrentLevel,
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
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Extract all available tags across items in this column
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (type === 'block') {
        const b = item as Block;
        if (b.tags) {
          for (const t of b.tags) set.add(t);
        }
      }
    }
    return Array.from(set).sort();
  }, [items, type]);

  // Filter items if a tag filter is active
  const filteredItems = useMemo(() => {
    if (!selectedTag) return items;
    return items.filter(item => {
      if (type === 'block') {
        const b = item as Block;
        return b.tags?.includes(selectedTag);
      }
      return true;
    });
  }, [items, selectedTag, type]);

  const handleTagClick = (tag: string) => {
    setSelectedTag(prev => (prev === tag ? null : tag));
  };

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

      {availableTags.length > 0 && (
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <Filter size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          {availableTags.map(tag => (
            <TagBadge
              key={tag}
              tag={tag}
              size="sm"
              active={selectedTag === tag}
              onClick={handleTagClick}
            />
          ))}
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                marginLeft: 'auto',
                flexShrink: 0,
              }}
            >
              Wis filter
            </button>
          )}
        </div>
      )}

      <div className="column-body">
        {filteredItems.length === 0 ? (
          <div className="empty-column-notice">
            <Inbox size={24} color="#64748B" />
            <p>{selectedTag ? `Geen blokken met tag #${selectedTag}.` : 'Geen onderdelen op dit niveau.'}</p>
            {selectedTag ? (
              <button
                onClick={() => setSelectedTag(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Wis tagfilter
              </button>
            ) : (
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
            )}
          </div>
        ) : (
          filteredItems.map((item) => (
            <Card
              key={item.id}
              item={item}
              type={type}
              isSelected={selectedId === item.id}
              isCurrent={isCurrentLevel && selectedId === item.id}
              isKeyboardFocused={focusedCardId === item.id}
              onSelect={() => onSelectItem(item)}
              onContextMenu={onContextMenuItem}
              onAddChild={onAddChildItem}
              onTagClick={handleTagClick}
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
