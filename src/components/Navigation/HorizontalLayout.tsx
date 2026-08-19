import React, { useRef, useEffect } from 'react';
import type { Project, Block, DragTarget } from '../../types';
import { Column } from './Column';

export interface ColumnData {
  level: number;
  title: string;
  items: (Project | Block)[];
  type: 'project' | 'block';
  selectedId: string | null;
  parentId: string | null;
}

interface HorizontalLayoutProps {
  columns: ColumnData[];
  activeLevel: number;
  focusedCardId?: string | null;
  unseenAgentEditsByProject?: Record<string, number>;
  unseenAgentEditsByBlock?: Record<string, number>;
  blockedBlockIds?: Set<string>;
  onSelectItem: (level: number, item: Project | Block) => void;
  onAddNewItem: (level: number, parentId: string | null, kind?: 'text' | 'task') => void;
  onAddChildItem?: (parentId: string, kind?: 'text' | 'task') => void;
  onContextMenuItem?: (e: React.MouseEvent, item: Project | Block, type: 'project' | 'block') => void;
  dragTarget?: DragTarget | null;
  onDragStart?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragOver?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => void;
}

export const HorizontalLayout: React.FC<HorizontalLayoutProps> = ({
  columns,
  activeLevel,
  focusedCardId,
  unseenAgentEditsByProject = {},
  unseenAgentEditsByBlock = {},
  blockedBlockIds,
  onSelectItem,
  onAddNewItem,
  onAddChildItem,
  onContextMenuItem,
  dragTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSelectionLevel = columns.reduce(
    (deepestLevel, column) => column.selectedId ? Math.max(deepestLevel, column.level) : deepestLevel,
    -1
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeColumn = Array.from(container.querySelectorAll<HTMLElement>('.miller-column'))
      .find(column => column.dataset.level === String(activeLevel));
    if (!activeColumn) return;

    const containerRect = container.getBoundingClientRect();
    const columnRect = activeColumn.getBoundingClientRect();
    const horizontalMargin = 16;
    if (columnRect.left < containerRect.left + horizontalMargin) {
      container.scrollBy({ left: columnRect.left - containerRect.left - horizontalMargin, behavior: 'smooth' });
    } else if (columnRect.right > containerRect.right - horizontalMargin) {
      container.scrollBy({ left: columnRect.right - containerRect.right + horizontalMargin, behavior: 'smooth' });
    }

    if (!focusedCardId) return;
    const focusedCard = Array.from(activeColumn.querySelectorAll<HTMLElement>('.miller-card'))
      .find(card => card.dataset.itemId === focusedCardId);
    const columnBody = focusedCard?.closest<HTMLElement>('.column-body');
    if (!focusedCard || !columnBody) return;
    const bodyRect = columnBody.getBoundingClientRect();
    const cardRect = focusedCard.getBoundingClientRect();
    const verticalMargin = 8;
    if (cardRect.top < bodyRect.top + verticalMargin) {
      columnBody.scrollBy({ top: cardRect.top - bodyRect.top - verticalMargin, behavior: 'smooth' });
    } else if (cardRect.bottom > bodyRect.bottom - verticalMargin) {
      columnBody.scrollBy({ top: cardRect.bottom - bodyRect.bottom + verticalMargin, behavior: 'smooth' });
    }
  }, [activeLevel, focusedCardId, columns.length]);

  return (
    <div className="miller-container" ref={containerRef}>
      {columns.map((col) => (
        <Column
          key={`col-level-${col.level}-${col.parentId || 'root'}`}
          level={col.level}
          title={col.title}
          items={col.items}
          type={col.type}
          selectedId={col.selectedId}
          focusedCardId={focusedCardId}
          unseenAgentEditsByProject={unseenAgentEditsByProject}
          unseenAgentEditsByBlock={unseenAgentEditsByBlock}
          blockedBlockIds={blockedBlockIds}
          isActiveLevel={activeLevel === col.level}
          isCurrentLevel={currentSelectionLevel === col.level}
          onSelectItem={(item) => onSelectItem(col.level, item)}
          onAddNewItem={() => onAddNewItem(col.level, col.parentId)}
          onAddTask={col.type === 'block' && col.parentId ? () => onAddNewItem(col.level, col.parentId, 'task') : undefined}
          onAddChildItem={onAddChildItem}
          onContextMenuItem={onContextMenuItem}
          dragTarget={dragTarget}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
};
