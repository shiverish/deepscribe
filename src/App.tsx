import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage, seedDemoDataIfEmpty } from './db/db';
import { createId, trashBlock, trashProject } from './db/operations';
import type { Project, Block, PathSegment, SaveStatus, DragTarget } from './types';
import { Breadcrumbs } from './components/Navigation/Breadcrumbs';
import { HorizontalLayout, type ColumnData } from './components/Navigation/HorizontalLayout';
import { WritingPanel } from './components/Editor/WritingPanel';
import { SearchModal } from './components/Search/SearchModal';
import { TrashModal } from './components/Modals/TrashModal';
import { ExportImportModal } from './components/Modals/ExportImportModal';
import { HotkeyHelpModal } from './components/Modals/HotkeyHelpModal';
import { ContextMenu } from './components/Modals/ContextMenu';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { getDropPosition, moveBlockInTree } from './utils/dragAndDrop';
import './styles/theme.css';
import './components/Navigation/Navigation.css';

export function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedBlockPath, setSelectedBlockPath] = useState<string[]>([]);
  const [focusedLevel, setFocusedLevel] = useState<number>(0);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);

  const [isWritingPanelOpen, setIsWritingPanelOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Project | Block; type: 'project' | 'block' } | null>(null);

  const [draggedItem, setDraggedItem] = useState<{ item: Project | Block; type: 'project' | 'block' } | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'saved' });

  useEffect(() => {
    void requestPersistentStorage();
    seedDemoDataIfEmpty().then(async () => {
      const projs = await db.projects.filter(project => !project.isTrash).toArray();
      if (projs.length > 0) {
        setActiveProjectId(projs[0].id);
        const rootBlocks = await db.blocks.filter(b => b.projectId === projs[0].id && b.parentId === null && !b.isTrash).toArray();
        rootBlocks.sort((a, b) => a.order - b.order);
        if (rootBlocks.length > 0) {
          setSelectedBlockPath([rootBlocks[0].id]);
        }
      }
    });
  }, []);

  const projectsQuery = useLiveQuery(() => db.projects.filter(project => !project.isTrash).toArray(), []);
  const blocksQuery = useLiveQuery(() => db.blocks.filter(block => !block.isTrash).toArray(), []);
  const projects = useMemo(() => projectsQuery ?? [], [projectsQuery]);
  const allBlocks = useMemo(() => blocksQuery ?? [], [blocksQuery]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId) || null, [projects, activeProjectId]);

  const activeBlockId = selectedBlockPath.length > 0 ? selectedBlockPath[selectedBlockPath.length - 1] : null;
  const activeBlock = useMemo(() => allBlocks.find(b => b.id === activeBlockId) || null, [allBlocks, activeBlockId]);

  const activeInspectorItem = activeBlock || activeProject;
  const activeInspectorType: 'project' | 'block' | null = activeBlock ? 'block' : activeProject ? 'project' : null;

  const columns: ColumnData[] = useMemo(() => {
    const cols: ColumnData[] = [];

    cols.push({
      level: 0,
      title: 'Projecten',
      items: projects,
      type: 'project',
      selectedId: activeProjectId,
      parentId: null
    });

    if (!activeProjectId) return cols;

    const rootBlocks = allBlocks
      .filter(b => b.projectId === activeProjectId && b.parentId === null)
      .sort((a, b) => a.order - b.order);

    const selectedLevel1Id = selectedBlockPath[0] || null;

    cols.push({
      level: 1,
      title: activeProject?.title || 'Hoofdblokken',
      items: rootBlocks,
      type: 'block',
      selectedId: selectedLevel1Id,
      parentId: null
    });

    for (let i = 0; i < selectedBlockPath.length; i++) {
      const parentId = selectedBlockPath[i];
      const parentBlock = allBlocks.find(b => b.id === parentId);
      if (!parentBlock) break;

      const children = allBlocks
        .filter(b => b.parentId === parentId)
        .sort((a, b) => a.order - b.order);

      const nextLevelSelectedId = selectedBlockPath[i + 1] || null;

      cols.push({
        level: i + 2,
        title: parentBlock.title || `Niveau ${i + 2}`,
        items: children,
        type: 'block',
        selectedId: nextLevelSelectedId,
        parentId: parentId
      });

      if (!nextLevelSelectedId) break;
    }

    return cols;
  }, [projects, allBlocks, activeProjectId, selectedBlockPath, activeProject]);

  const pathSegments: PathSegment[] = useMemo(() => {
    const segments: PathSegment[] = [];
    if (activeProject) {
      segments.push({ id: activeProject.id, title: activeProject.title, type: 'project' });
    }

    selectedBlockPath.forEach(id => {
      const block = allBlocks.find(b => b.id === id);
      if (block) {
        segments.push({ id: block.id, title: block.title, type: 'block' });
      }
    });

    return segments;
  }, [activeProject, selectedBlockPath, allBlocks]);

  const handleSelectItem = useCallback((level: number, item: Project | Block) => {
    setFocusedLevel(level);
    setFocusedCardId(item.id);

    if (level === 0) {
      const proj = item as Project;
      setActiveProjectId(proj.id);

      const rootBlocks = allBlocks.filter(b => b.projectId === proj.id && b.parentId === null).sort((a, b) => a.order - b.order);
      if (rootBlocks.length > 0) {
        setSelectedBlockPath([rootBlocks[0].id]);
      } else {
        setSelectedBlockPath([]);
      }
    } else {
      const block = item as Block;
      const newPath = selectedBlockPath.slice(0, level - 1);
      newPath.push(block.id);
      setSelectedBlockPath(newPath);
    }
  }, [allBlocks, selectedBlockPath]);

  const handleSelectBreadcrumbSegment = (index: number) => {
    setFocusedLevel(index);
    if (index === 0) return;
    const newPath = selectedBlockPath.slice(0, index);
    setSelectedBlockPath(newPath);
  };

  const handleAddNewItem = async (level: number, parentId: string | null) => {
    const now = Date.now();
    if (level === 0) {
      const newProjId = createId('proj');
      const newProj: Project = {
        id: newProjId,
        title: 'Nieuw Project',
        description: 'Beschrijf je nieuwe project...',
        color: '#F59E0B',
        isTrash: false,
        createdAt: now,
        updatedAt: now
      };
      await db.projects.add(newProj);
      setActiveProjectId(newProjId);
      setSelectedBlockPath([]);
    } else {
      if (!activeProjectId) return;

      const siblings = allBlocks.filter(b => b.projectId === activeProjectId && b.parentId === parentId);
      const newBlockId = createId('block');

      const newBlock: Block = {
        id: newBlockId,
        projectId: activeProjectId,
        parentId: parentId,
        title: 'Nieuw tekstblok',
        content: '<p></p>',
        plainText: '',
        order: siblings.length,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        isTrash: false,
        createdAt: now,
        updatedAt: now
      };

      await db.blocks.add(newBlock);

      const newPath = selectedBlockPath.slice(0, level - 1);
      newPath.push(newBlockId);
      setSelectedBlockPath(newPath);
      setFocusedLevel(level);
      setFocusedCardId(newBlockId);
    }
  };

  const handleAddChildItem = async (parentId: string) => {
    if (!activeProjectId) return;
    const now = Date.now();
    const children = allBlocks.filter(b => b.parentId === parentId);
    const newBlockId = createId('block');

    const newBlock: Block = {
      id: newBlockId,
      projectId: activeProjectId,
      parentId: parentId,
      title: 'Nieuw kind-blok',
      content: '<p></p>',
      plainText: '',
      order: children.length,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      isTrash: false,
      createdAt: now,
      updatedAt: now
    };

    await db.blocks.add(newBlock);
    await db.blocks.update(parentId, { childCount: children.length + 1 });

    const parentIndex = selectedBlockPath.indexOf(parentId);
    if (parentIndex !== -1) {
      const newPath = selectedBlockPath.slice(0, parentIndex + 1);
      newPath.push(newBlockId);
      setSelectedBlockPath(newPath);
      setFocusedLevel(newPath.length);
    }
  };

  // Explicit Save Handler called by WritingPanel on blur, navigation, 10s timer, beforeunload
  const handleSaveItem = useCallback(async (
    itemId: string,
    itemType: 'project' | 'block',
    title: string,
    content: string,
    plainText: string,
    taskCount: number,
    completedTaskCount: number
  ) => {
    setSaveStatus({ state: 'saving' });
    try {
      if (itemType === 'project') {
        await db.projects.update(itemId, {
          title,
          description: plainText,
          updatedAt: Date.now()
        });
      } else {
        await db.blocks.update(itemId, {
          title,
          content,
          plainText,
          taskCount,
          completedTaskCount,
          updatedAt: Date.now()
        });
      }
      setSaveStatus({ state: 'saved', lastSavedAt: Date.now() });
    } catch (err) {
      console.error(err);
      setSaveStatus({ state: 'error' });
    }
  }, []);

  const handleDuplicate = async (item: Block | Project, type: 'project' | 'block') => {
    const now = Date.now();
    if (type === 'project') {
      const proj = item as Project;
      const newProjId = createId('proj');
      await db.projects.add({
        ...proj,
        id: newProjId,
        title: `${proj.title} (Kopie)`,
        isTrash: false,
        trashedAt: undefined,
        createdAt: now,
        updatedAt: now
      });
    } else {
      const block = item as Block;
      const duplicateSubTree = async (srcId: string, newParentId: string | null): Promise<string> => {
        const srcBlock = await db.blocks.get(srcId);
        if (!srcBlock) return '';

        const newId = createId('block');
        await db.blocks.add({
          ...srcBlock,
          id: newId,
          parentId: newParentId,
          title: newParentId === block.parentId ? `${srcBlock.title} (Kopie)` : srcBlock.title,
          isTrash: false,
          trashedAt: undefined,
          createdAt: now,
          updatedAt: now
        });

        const children = await db.blocks.where('parentId').equals(srcId).toArray();
        for (const child of children) {
          await duplicateSubTree(child.id, newId);
        }

        return newId;
      };

      await duplicateSubTree(block.id, block.parentId);
    }
  };

  const handleDeleteToTrash = async (item: Block | Project, type: 'project' | 'block') => {
    if (type === 'project') {
      if (window.confirm(`Project "${item.title}" naar de prullenbak verplaatsen?`)) {
        await trashProject(item.id);
        setActiveProjectId(null);
        setSelectedBlockPath([]);
      }
    } else {
      const block = item as Block;
      await trashBlock(block.id);
      setSelectedBlockPath(prev => prev.filter(id => id !== block.id));
    }
  };

  const handleDragStart = (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => {
    setDraggedItem({ item, type });
    e.dataTransfer.setData('text/plain', item.id);
  };

  const handleDragOver = (e: React.DragEvent, targetItem: Block | Project) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.item.id === targetItem.id) return;
    const pos = getDropPosition(e as unknown as React.DragEvent<HTMLElement>);
    setDragTarget({ blockId: targetItem.id, position: pos });
  };

  const handleDragLeave = () => {
    setDragTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => {
    e.preventDefault();
    if (!draggedItem || !dragTarget || draggedItem.type !== 'block' || type !== 'block') {
      setDragTarget(null);
      setDraggedItem(null);
      return;
    }

    await moveBlockInTree(draggedItem.item.id, targetItem.id, dragTarget.position);
    setDragTarget(null);
    setDraggedItem(null);
  };

  const activeColumn = columns[focusedLevel] || columns[0];
  const activeColumnItems = useMemo(() => activeColumn?.items ?? [], [activeColumn]);
  const currentFocusedIndex = activeColumnItems.findIndex(i => i.id === focusedCardId);

  const handleNavigateUp = useCallback(() => {
    if (activeColumnItems.length === 0) return;
    const nextIdx = currentFocusedIndex > 0 ? currentFocusedIndex - 1 : activeColumnItems.length - 1;
    const item = activeColumnItems[nextIdx];
    setFocusedCardId(item.id);
    handleSelectItem(focusedLevel, item);
  }, [activeColumnItems, currentFocusedIndex, focusedLevel, handleSelectItem]);

  const handleNavigateDown = useCallback(() => {
    if (activeColumnItems.length === 0) return;
    const nextIdx = currentFocusedIndex < activeColumnItems.length - 1 ? currentFocusedIndex + 1 : 0;
    const item = activeColumnItems[nextIdx];
    setFocusedCardId(item.id);
    handleSelectItem(focusedLevel, item);
  }, [activeColumnItems, currentFocusedIndex, focusedLevel, handleSelectItem]);

  const handleNavigateRight = useCallback(() => {
    if (focusedLevel < columns.length - 1) {
      const nextLevel = focusedLevel + 1;
      const nextCol = columns[nextLevel];
      if (nextCol && nextCol.items.length > 0) {
        setFocusedLevel(nextLevel);
        setFocusedCardId(nextCol.items[0].id);
        handleSelectItem(nextLevel, nextCol.items[0]);
      }
    }
  }, [focusedLevel, columns, handleSelectItem]);

  const handleNavigateLeft = useCallback(() => {
    if (focusedLevel > 0) {
      const prevLevel = focusedLevel - 1;
      const prevCol = columns[prevLevel];
      setFocusedLevel(prevLevel);
      setFocusedCardId(prevCol.selectedId);
    }
  }, [focusedLevel, columns]);

  useKeyboardShortcuts({
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onNavigateRight: handleNavigateRight,
    onNavigateLeft: handleNavigateLeft,
    onOpenSearch: () => setIsSearchOpen(true),
    onNewBlock: () => handleAddNewItem(focusedLevel, activeColumn?.parentId || null),
    onDuplicate: () => {
      const item = activeColumnItems[currentFocusedIndex];
      if (item) handleDuplicate(item, activeColumn.type);
    },
    onTrash: () => {
      const item = activeColumnItems[currentFocusedIndex];
      if (item) handleDeleteToTrash(item, activeColumn.type);
    },
    onToggleWritingPanel: () => setIsWritingPanelOpen(prev => !prev),
    onOpenHelp: () => setIsHelpOpen(true)
  });

  const handleSelectSearchResult = (blockId: string, projectId: string, pathSegmentIds: string[]) => {
    setActiveProjectId(projectId);
    const blockIds = pathSegmentIds.filter(id => id !== projectId);
    setSelectedBlockPath(blockIds);
    setFocusedLevel(blockIds.length);
    setFocusedCardId(blockId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: 'var(--bg-dark)' }}>
      <Breadcrumbs
        pathSegments={pathSegments}
        onSelectSegment={handleSelectBreadcrumbSegment}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenTrash={() => setIsTrashOpen(true)}
        onOpenExportImport={() => setIsExportImportOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        isWritingPanelOpen={isWritingPanelOpen}
        onToggleWritingPanel={() => setIsWritingPanelOpen(prev => !prev)}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <HorizontalLayout
          columns={columns}
          activeLevel={focusedLevel}
          focusedCardId={focusedCardId}
          onSelectItem={handleSelectItem}
          onAddNewItem={handleAddNewItem}
          onAddChildItem={handleAddChildItem}
          onContextMenuItem={(e, item, type) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, item, type });
          }}
          dragTarget={dragTarget}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />

        <WritingPanel
          isOpen={isWritingPanelOpen}
          activeItem={activeInspectorItem}
          itemType={activeInspectorType}
          pathSegments={pathSegments}
          saveStatus={saveStatus}
          onSaveItem={handleSaveItem}
          onClose={() => setIsWritingPanelOpen(false)}
        />
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          type={contextMenu.type}
          onClose={() => setContextMenu(null)}
          onAddChild={handleAddChildItem}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteToTrash}
        />
      )}

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
      />

      <TrashModal
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        onRefreshData={() => {}}
      />

      <ExportImportModal
        isOpen={isExportImportOpen}
        onClose={() => setIsExportImportOpen(false)}
        onRefreshData={() => {}}
      />

      <HotkeyHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}

export default App;
