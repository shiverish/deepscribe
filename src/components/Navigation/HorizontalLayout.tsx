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
  onSelectItem: (level: number, item: Project | Block) => void;
  onAddNewItem: (level: number, parentId: string | null) => void;
  onAddChildItem?: (parentId: string) => void;
  onContextMenuItem?: (e: React.MouseEvent, item: Project | Block, type: 'project' | 'block') => void;
  dragTarget?: DragTarget | null;
  onDragStart?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragOver?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => void;
}

export const HorizontalLayout: React.FC<HorizontalLayoutProps> = ({
  columns,
  activeLevel,
  focusedCardId,
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        left: containerRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  }, [columns.length]);

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
          isActiveLevel={activeLevel === col.level}
          onSelectItem={(item) => onSelectItem(col.level, item)}
          onAddNewItem={() => onAddNewItem(col.level, col.parentId)}
          onAddChildItem={onAddChildItem}
          onContextMenuItem={onContextMenuItem}
          dragTarget={dragTarget}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
};
