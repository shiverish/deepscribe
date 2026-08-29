import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage, seedDemoDataIfEmpty } from './db/db';
import { createId, deleteTagFromProject, markBlockSubtreeAsRead, markProjectAsRead, renameTagInProject, saveBlockDraft, saveProjectDraft, trashBlock, trashProject } from './db/operations';
import type { Project, Block, Attachment, BlockTemplate, PathSegment, SaveStatus, DragTarget, ActiveView, TaskMetadata } from './types';
import { Breadcrumbs } from './components/Navigation/Breadcrumbs';
import { UpdateNotification, type UpdaterState } from './components/Navigation/UpdateNotification';
import { HorizontalLayout, type ColumnData } from './components/Navigation/HorizontalLayout';
import { WritingPanel } from './components/Editor/WritingPanel';
import { StatisticsView } from './components/Statistics/StatisticsView';
import { TasksView } from './components/Tasks/TasksView';
import { SearchModal } from './components/Search/SearchModal';
import { TrashModal } from './components/Modals/TrashModal';
import { ExportImportModal } from './components/Modals/ExportImportModal';
import { HotkeyHelpModal } from './components/Modals/HotkeyHelpModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ContextMenu } from './components/Modals/ContextMenu';
import { WorkspaceModal } from './components/Modals/WorkspaceModal';
import { WhatsNewModal } from './components/Modals/WhatsNewModal';
import { ScreenAnnotationOverlay } from './components/Overlay/ScreenAnnotationOverlay';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSettings } from './hooks/useSettings';
import { CURRENT_APP_VERSION, shouldAutoOpenWhatsNew } from './data/changelog';
import { getDropPosition, isDescendantOrSelf, moveBlockInTree, reorderProject } from './utils/dragAndDrop';
import { sanitizeTags } from './utils/tagUtils';
import { getDeleteFallbackTarget } from './utils/selectionUtils';
import { handleMcpBridgeRequest } from './mcp/bridge';
import { recordActivity } from './db/activity';
import { recordBlockRevision } from './db/revisions';
import { getBlockDependencyStatus } from './utils/dependencyUtils';
import { resolveBlockReferences } from './utils/references';
import { calculateAgentEditCounts } from './utils/agentEdits';
import { buildBlockPrintDocument, type BlockPrintDraft, type BlockPrintSettings } from './utils/printDocument';
import { repository } from './db/repository';
import { canTransitionTask, convertContentToTask, createTaskMetadata, getNextTaskNumber, parseTaskHumanId, taskWithoutActiveClaim, TASK_INBOX_PROJECT_ID, validateTaskReady } from './utils/taskBlocks';
import { relocateUserTask } from './utils/taskManagement';
import { startWebhookObserver } from './utils/webhooks';
import './styles/theme.css';
import './components/Navigation/Navigation.css';

function DeepScribeApp() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeView, setActiveView] = useState<ActiveView>('columns');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedBlockPath, setSelectedBlockPath] = useState<string[]>([]);
  const [focusedLevel, setFocusedLevel] = useState<number>(0);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);

  const [isWritingPanelOpen, setIsWritingPanelOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Project | Block; type: 'project' | 'block' } | null>(null);

  const [draggedItem, setDraggedItem] = useState<{ item: Project | Block; type: 'project' | 'block' } | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'saved' });
  const [overlayData, setOverlayData] = useState<{ screenshotDataUrl: string } | null>(null);
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);

  // Automatic "What's New" trigger on application update
  useEffect(() => {
    const currentVersion = updaterState?.currentVersion || CURRENT_APP_VERSION;
    // On fresh install or clean state, silently record current version without interrupting user
    if (settings.lastSeenWhatsNewVersion === undefined) {
      void updateSettings({ lastSeenWhatsNewVersion: currentVersion });
      return;
    }

    // When updated to a newer version than last seen, pop up What's New modal
    if (shouldAutoOpenWhatsNew(currentVersion, settings.lastSeenWhatsNewVersion)) {
      setIsWhatsNewOpen(true);
    }
  }, [updaterState?.currentVersion, settings.lastSeenWhatsNewVersion, updateSettings]);

  const handleCloseWhatsNew = useCallback(() => {
    setIsWhatsNewOpen(false);
    const currentVersion = updaterState?.currentVersion || CURRENT_APP_VERSION;
    if (settings.lastSeenWhatsNewVersion !== currentVersion) {
      void updateSettings({ lastSeenWhatsNewVersion: currentVersion });
    }
  }, [updaterState?.currentVersion, settings.lastSeenWhatsNewVersion, updateSettings]);

  useEffect(() => {
    if (!window.electronAPI?.onNavigateToTarget) return;
    return window.electronAPI.onNavigateToTarget(async payload => {
      const { type, targetId } = payload;
      const allBlocks = await db.blocks.filter(b => !b.isTrash).toArray();
      let found: Block | undefined;
      if (type === 'task') {
        const parsedNum = parseTaskHumanId(targetId);
        if (parsedNum !== null) {
          found = allBlocks.find(b => b.kind === 'task' && b.task?.taskNumber === parsedNum);
        }
      }
      if (!found) {
        const parsedNum = parseTaskHumanId(targetId);
        found = allBlocks.find(b => b.id === targetId || (parsedNum !== null && b.kind === 'task' && b.task?.taskNumber === parsedNum));
      }
      if (found) {
        setActiveProjectId(found.projectId);
        if (found.kind === 'task') {
          setActiveView('tasks');
          setSelectedBlockPath([found.id]);
        } else {
          setActiveView('columns');
          const path: string[] = [found.id];
          let current = found;
          const blockMap = new Map(allBlocks.map(b => [b.id, b]));
          while (current.parentId) {
            const parent = blockMap.get(current.parentId);
            if (parent) {
              path.unshift(parent.id);
              current = parent;
            } else {
              break;
            }
          }
          setSelectedBlockPath(path);
          setIsWritingPanelOpen(true);
        }
      }
    });
  }, []);

  useEffect(() => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    let isDisposed = false;
    const handleUpdaterStatus = (state: UpdaterState) => {
      if (!isDisposed) setUpdaterState(state);
    };

    const unsubscribe = updater.onStatusChange(handleUpdaterStatus);
    updater.getState().then(state => {
      if (!isDisposed) handleUpdaterStatus(state);
    }).catch(err => {
      console.warn('Failed to retrieve updater state:', err);
    });

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!window.electronAPI?.updater) return;
    try {
      await window.electronAPI.updater.install();
    } catch (err) {
      console.error('Failed to install update:', err);
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.screenCapture?.onBlockCreated) return;
    return window.electronAPI.screenCapture.onBlockCreated((createdBlock: unknown) => {
      const block = createdBlock as Block;
      if (block?.projectId && block?.id) {
        setActiveProjectId(block.projectId);
        setSelectedBlockPath([block.id]);
        setIsWritingPanelOpen(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.screenCapture?.onTriggerOverlay) return;
    return window.electronAPI.screenCapture.onTriggerOverlay(data => {
      setOverlayData({ screenshotDataUrl: data.screenshotDataUrl });
    });
  }, []);

  const handleTriggerScreenAnnotation = useCallback(() => {
    if (window.electronAPI?.screenCapture?.triggerOverlay) {
      window.electronAPI.screenCapture.triggerOverlay();
    }
  }, []);

  const handleBlockCreatedFromOverlay = useCallback((newBlock: Block) => {
    setActiveProjectId(newBlock.projectId);
    setSelectedBlockPath([newBlock.id]);
    setIsWritingPanelOpen(true);
    setOverlayData(null);
  }, []);

  useEffect(() => {
    let stopWebhookObserver = () => {};
    void requestPersistentStorage();
    repository.initialize().then(() => seedDemoDataIfEmpty()).then(async () => {
      stopWebhookObserver = await startWebhookObserver();
      const projs = await db.projects.filter(project => !project.isTrash && !project.systemKind).toArray();
      if (projs.length > 0) {
        setActiveProjectId(projs[0].id);
        const rootBlocks = await db.blocks.filter(b => b.projectId === projs[0].id && b.parentId === null && !b.isTrash).toArray();
        rootBlocks.sort((a, b) => a.order - b.order);
        if (rootBlocks.length > 0) {
          setSelectedBlockPath([rootBlocks[0].id]);
        }
      }
    }).catch((error: unknown) => console.error('Workspace initialiseren is mislukt.', error));
    return () => stopWebhookObserver();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onWorkspaceFlushRequested) return;
    return window.electronAPI.onWorkspaceFlushRequested(() => {
      repository.flush()
        .catch((error: unknown) => console.error('Final workspace save failed.', error))
        .finally(() => window.electronAPI?.workspaceFlushed());
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.workspace) return;
    let focusTimeout: number | undefined;
    const handleFocus = () => {
      window.clearTimeout(focusTimeout);
      focusTimeout = window.setTimeout(() => {
        repository.reload().catch((error: unknown) => console.error('Workspace herladen bij focus is mislukt.', error));
      }, 300);
    };
    window.addEventListener('focus', handleFocus);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!window.deepScribeMcp) return;

    const unsubscribe = window.deepScribeMcp.onRequest(request => {
      handleMcpBridgeRequest(request.method, request.params)
        .then(result => window.deepScribeMcp?.respond({ id: request.id, ok: true, result }))
        .catch((error: unknown) => window.deepScribeMcp?.respond({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown DeepScribe error.'
        }));
    });
    repository.initialize()
      .then(() => window.deepScribeMcp?.ready())
      .catch((error: unknown) => console.error('Agentbridge wacht op een geldige workspace.', error));
    return unsubscribe;
  }, []);

  const projectsQuery = useLiveQuery(() => db.projects.filter(project => !project.isTrash && !project.systemKind).toArray(), []);
  const blocksQuery = useLiveQuery(() => db.blocks.filter(block => !block.isTrash).toArray(), []);
  const projects = useMemo(() => [...(projectsQuery ?? [])].sort(
    (a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)
  ), [projectsQuery]);
  const allBlocks = useMemo(() => blocksQuery ?? [], [blocksQuery]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId) || null, [projects, activeProjectId]);

  const activeBlockId = selectedBlockPath.length > 0 ? selectedBlockPath[selectedBlockPath.length - 1] : null;
  const activeBlock = useMemo(() => allBlocks.find(b => b.id === activeBlockId) || null, [allBlocks, activeBlockId]);
  const agentEditCounts = useMemo(() => calculateAgentEditCounts(allBlocks), [allBlocks]);
  const blockedBlockIds = useMemo(() => {
    const set = new Set<string>();
    for (const block of allBlocks) {
      if (block.dependsOn && block.dependsOn.length > 0) {
        const status = getBlockDependencyStatus(block, allBlocks);
        if (status.isBlocked) set.add(block.id);
      }
    }
    return set;
  }, [allBlocks]);
  const activeAttachments = useLiveQuery(
    () => activeBlockId ? db.attachments.where('blockId').equals(activeBlockId).sortBy('createdAt') : Promise.resolve([] as Attachment[]),
    [activeBlockId],
    [] as Attachment[]
  );

  const activeInspectorItem = activeBlock || activeProject;
  const activeInspectorType: 'project' | 'block' | null = activeBlock ? 'block' : activeProject ? 'project' : null;

  useEffect(() => {
    if (!activeBlockId || !isWritingPanelOpen) return;
    let timeout: number | undefined;
    const scheduleMarkSeen = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(async () => {
        const block = await db.blocks.get(activeBlockId);
        if (!block?.lastAgentEditAt || block.lastAgentEditAt <= (block.lastSeenAgentEditAt ?? 0)) return;
        await db.blocks.update(activeBlockId, { lastSeenAgentEditAt: block.lastAgentEditAt });
      }, 1200);
    };
    scheduleMarkSeen();
    window.addEventListener('focus', scheduleMarkSeen);
    document.addEventListener('visibilitychange', scheduleMarkSeen);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('focus', scheduleMarkSeen);
      document.removeEventListener('visibilitychange', scheduleMarkSeen);
    };
  }, [activeBlockId, isWritingPanelOpen]);
  // Relations are stored edges now, so references reach across projects.
  const allLinks = useLiveQuery(() => db.links.toArray(), [], []);
  const blockReferences = useMemo(() => activeBlock
    ? resolveBlockReferences(activeBlock, allBlocks, allLinks)
    : { outgoing: [], backlinks: [] }, [activeBlock, allBlocks, allLinks]);

  const handlePrintBlock = useCallback(async (blockId: string, draft: BlockPrintDraft, settings: BlockPrintSettings) => {
    if (!window.electronAPI?.printBlockDocument) {
      throw new Error('Printing is only available in the DeepScribe desktop app.');
    }
    const block = allBlocks.find(item => item.id === blockId);
    const project = block ? projects.find(item => item.id === block.projectId) : null;
    if (!block || !project) throw new Error('The block to print is unavailable.');

    const document = buildBlockPrintDocument({ project, rootBlockId: blockId, blocks: allBlocks, draft, settings });
    return window.electronAPI.printBlockDocument({ html: document.html, jobName: document.jobName, pageSize: settings.pageSize });
  }, [allBlocks, projects]);

  const handleExportBlockPdf = useCallback(async (blockId: string, draft: BlockPrintDraft, settings: BlockPrintSettings) => {
    if (!window.electronAPI?.exportBlockDocumentPdf) {
      throw new Error('PDF export is only available in the DeepScribe desktop app.');
    }
    const block = allBlocks.find(item => item.id === blockId);
    const project = block ? projects.find(item => item.id === block.projectId) : null;
    if (!block || !project) throw new Error('The block to export is unavailable.');

    const document = buildBlockPrintDocument({ project, rootBlockId: blockId, blocks: allBlocks, draft, settings });
    return window.electronAPI.exportBlockDocumentPdf({ html: document.html, jobName: document.jobName, pageSize: settings.pageSize });
  }, [allBlocks, projects]);

  const blockTagSuggestions = useMemo(() => {
    if (!activeProjectId) return [];
    const counts = new Map<string, number>();
    for (const block of allBlocks) {
      if (block.projectId !== activeProjectId) continue;
      for (const tag of sanitizeTags(block.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts, ([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [activeProjectId, allBlocks]);

  const projectTagSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      for (const tag of sanitizeTags(project.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts, ([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [projects]);

  const columns: ColumnData[] = useMemo(() => {
    const cols: ColumnData[] = [];

    cols.push({
      level: 0,
      title: 'Projects',
      items: projects,
      type: 'project',
      selectedId: activeProjectId,
      parentId: null
    });

    if (!activeProjectId) return cols;

    const rootBlocks = allBlocks
      .filter(b => b.projectId === activeProjectId && b.parentId === null && b.kind !== 'task')
      .sort((a, b) => a.order - b.order);

    const selectedLevel1Id = selectedBlockPath[0] || null;

    cols.push({
      level: 1,
      title: activeProject?.title || 'Root Blocks',
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
        .filter(b => b.parentId === parentId && b.kind !== 'task')
        .sort((a, b) => a.order - b.order);

      const nextLevelSelectedId = selectedBlockPath[i + 1] || null;

      cols.push({
        level: i + 2,
        title: parentBlock.title || `Level ${i + 2}`,
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
    setIsWritingPanelOpen(true);

    if (level === 0) {
      const proj = item as Project;
      setActiveProjectId(proj.id);
      setSelectedBlockPath([]);
    } else {
      const block = item as Block;
      const newPath = selectedBlockPath.slice(0, level - 1);
      newPath.push(block.id);
      setSelectedBlockPath(newPath);
    }
  }, [selectedBlockPath]);

  const handleSelectBreadcrumbSegment = (index: number) => {
    setFocusedLevel(index);
    setIsWritingPanelOpen(true);
    if (index === 0) {
      setSelectedBlockPath([]);
      return;
    }
    const newPath = selectedBlockPath.slice(0, index);
    setSelectedBlockPath(newPath);
  };

  const handleAddNewItem = async (level: number, parentId: string | null, kind: 'text' | 'task' = 'text') => {
    const now = Date.now();
    if (level === 0) {
      const newProjId = createId('proj');
      const newProj: Project = {
        id: newProjId,
        title: 'New Project',
        description: 'Describe your new project...',
        color: '#F59E0B',
        order: projects.reduce((highest, project) => Math.max(highest, project.order ?? -1), -1) + 1,
        tags: [],
        isTrash: false,
        createdAt: now,
        updatedAt: now
      };
      await db.projects.add(newProj);
      await recordActivity({ projectId: newProjId, action: 'project-created', summary: `Project “${newProj.title}” created` });
      setActiveProjectId(newProjId);
      setSelectedBlockPath([]);
      setIsWritingPanelOpen(true);
      setFocusTitleSignal(prev => prev + 1);
    } else {
      if (!activeProjectId) return;

      const siblings = allBlocks.filter(b => b.projectId === activeProjectId && b.parentId === parentId);
      const newBlockId = createId('block');

    if (kind === 'task' && !parentId) throw new Error('A task block must be placed under an existing block.');
      const newBlock: Block = {
        id: newBlockId,
        projectId: activeProjectId,
        parentId: parentId,
      title: kind === 'task' ? 'New task' : 'New text block',
        content: '<p></p>',
        plainText: '',
        order: siblings.length,
        childCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        attachmentCount: 0,
        tags: [],
        ...(kind === 'task' ? { kind: 'task' as const, task: createTaskMetadata(now, { type: 'user' }, getNextTaskNumber(allBlocks)) } : {}),
        isTrash: false,
        createdAt: now,
        updatedAt: now
      };

      await db.blocks.add(newBlock);
      await recordActivity({ projectId: activeProjectId, blockId: newBlockId, action: 'block-created', summary: `Block “${newBlock.title}” created` });

      const newPath = selectedBlockPath.slice(0, level - 1);
      newPath.push(newBlockId);
      setSelectedBlockPath(newPath);
      setFocusedLevel(level);
      setFocusedCardId(newBlockId);
      setIsWritingPanelOpen(true);
      setFocusTitleSignal(prev => prev + 1);
    }
  };

  const handleAddChildItem = async (parentId: string, kind: 'text' | 'task' = 'text') => {
    if (!activeProjectId) return;
    const now = Date.now();
    const children = allBlocks.filter(b => b.parentId === parentId);
    const newBlockId = createId('block');

    const newBlock: Block = {
      id: newBlockId,
      projectId: activeProjectId,
      parentId: parentId,
      title: kind === 'task' ? 'New task' : 'New child block',
      content: '<p></p>',
      plainText: '',
      order: children.length,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      ...(kind === 'task' ? { kind: 'task' as const, task: createTaskMetadata(now, { type: 'user' }, getNextTaskNumber(allBlocks)) } : {}),
      isTrash: false,
      createdAt: now,
      updatedAt: now
    };

    await db.blocks.add(newBlock);
    await db.blocks.update(parentId, { childCount: children.length + 1 });
    await recordActivity({ projectId: activeProjectId, blockId: newBlockId, action: kind === 'task' ? 'task-created' : 'block-created', summary: `${kind === 'task' ? 'Task block' : 'Child block'} “${newBlock.title}” created` });

    const parentIndex = selectedBlockPath.indexOf(parentId);
    if (parentIndex !== -1) {
      const newPath = selectedBlockPath.slice(0, parentIndex + 1);
      newPath.push(newBlockId);
      setSelectedBlockPath(newPath);
      setFocusedLevel(newPath.length);
      setFocusedCardId(newBlockId);
      setIsWritingPanelOpen(true);
      setFocusTitleSignal(prev => prev + 1);
    }
  };

  const handleAddAttachments = async (blockId: string) => {
    const block = allBlocks.find(item => item.id === blockId);
    if (!block || !window.electronAPI?.addAttachments) throw new Error('Adding files is only available in the desktop app.');
    const files = await window.electronAPI.addAttachments({ projectId: block.projectId, blockId });
    if (files.length === 0) return;

    const now = Date.now();
    const attachments: Attachment[] = files.map((file, index) => ({
      id: createId('attachment'),
      blockId,
      ...file,
      createdAt: now + index
    }));
    try {
      await db.transaction('rw', db.attachments, db.blocks, async () => {
        await db.attachments.bulkAdd(attachments);
        const attachmentCount = await db.attachments.where('blockId').equals(blockId).count();
        await db.blocks.update(blockId, { attachmentCount, updatedAt: Date.now() });
      });
      await recordActivity({ projectId: block.projectId, blockId, action: 'attachments-added', summary: `${attachments.length} attachment${attachments.length === 1 ? '' : 's'} added to “${block.title}”` });
    } catch (error) {
      await Promise.allSettled(attachments
        .filter(attachment => attachment.localPath)
        .map(attachment => window.electronAPI!.removeAttachment(attachment.localPath!)));
      throw error;
    }
  };

  const handleOpenAttachment = async (attachment: Attachment) => {
    if (attachment.localPath && window.electronAPI?.openAttachment) {
      await window.electronAPI.openAttachment(attachment.localPath);
      return;
    }
    if (attachment.dataUrl) {
      const link = document.createElement('a');
      link.href = attachment.dataUrl;
      link.download = attachment.fileName;
      link.click();
      return;
    }
    throw new Error('The attachment file is no longer available.');
  };

  const handleRemoveAttachment = async (attachment: Attachment) => {
    if (attachment.localPath && window.electronAPI?.removeAttachment) {
      await window.electronAPI.removeAttachment(attachment.localPath);
    }
    await db.transaction('rw', db.attachments, db.blocks, async () => {
      await db.attachments.delete(attachment.id);
      const attachmentCount = await db.attachments.where('blockId').equals(attachment.blockId).count();
      await db.blocks.update(attachment.blockId, { attachmentCount, updatedAt: Date.now() });
    });
    const block = allBlocks.find(item => item.id === attachment.blockId);
    await recordActivity({ projectId: block?.projectId, blockId: attachment.blockId, action: 'attachment-removed', summary: `Attachment “${attachment.fileName}” removed` });
  };

  // Explicit Save Handler called by WritingPanel on blur, navigation, 10s timer, beforeunload
  const handleSaveItem = useCallback(async (
    itemId: string,
    itemType: 'project' | 'block',
    title: string,
    content: string,
    plainText: string,
    taskCount: number,
    completedTaskCount: number,
    tags: string[],
    dependsOn?: string[],
    scratchpad?: string,
    task?: TaskMetadata
  ) => {
    setSaveStatus({ state: 'saving' });
    try {
      if (itemType === 'project') {
        await saveProjectDraft(itemId, {
          title,
          description: content || plainText,
          tags,
          scratchpad
        });
        await recordActivity({ projectId: itemId, action: 'project-updated', summary: `Project “${title}” updated` });
      } else {
        const currentBlock = await db.blocks.get(itemId);
        if (currentBlock) {
        await recordBlockRevision(currentBlock, 'user', 'State before developer edit');
        }
        if (task && currentBlock?.kind === 'task' && currentBlock.task) {
          if (!canTransitionTask(currentBlock.task.status, task.status)) throw new Error('Invalid task status transition.');
          if (task.status === 'ready') {
            const errors = validateTaskReady(title, content, task);
            if (errors.length) throw new Error(errors.join(' '));
          }
        }
        await saveBlockDraft(itemId, {
          title,
          content,
          plainText,
          taskCount,
          completedTaskCount,
          tags,
          dependsOn,
          task
        });
        const block = await db.blocks.get(itemId);
        if (block) {
          await recordBlockRevision(block, 'user', `Ontwikkelaar bewerkte “${title}”`);
        }
        const oldTask = currentBlock?.task;
        const newTask = block?.task;
        const action = oldTask?.claim && !newTask?.claim
          ? 'task-claim-released-by-user'
          : oldTask?.status !== newTask?.status
          ? newTask?.status === 'ready' ? 'task-readiness-changed' : newTask?.status === 'done' ? 'task-completed' : 'task-status-changed'
          : oldTask && newTask && (oldTask.agentTarget !== newTask.agentTarget || oldTask.customAgentName !== newTask.customAgentName)
            ? 'task-metadata-updated'
            : 'block-updated';
      await recordActivity({ projectId: block?.projectId, blockId: itemId, action, summary: block?.kind === 'task' ? `${action === 'task-claim-released-by-user' ? 'Claim released by user for' : 'Task'} “${title}”${newTask ? ` → ${newTask.status}` : ''}` : `Block “${title}” updated` });
      }
      setSaveStatus({ state: 'saved', lastSavedAt: Date.now() });
    } catch (err) {
      console.error(err);
      setSaveStatus({ state: 'error' });
    }
  }, []);

  const handleConvertBlockToTask = useCallback(async (blockId: string) => {
    const block = await db.blocks.get(blockId);
    if (!block || block.isTrash || block.kind === 'task') return;
    await recordBlockRevision(block, 'user', 'State before conversion to task');
    const agentStatuses = new Set(['agent-ready', 'agent-claimed', 'agent-blocked', 'agent-review', 'agent-done']);
    const convertedContent = convertContentToTask(block.content);
    const allBlocks = await db.blocks.toArray();
    const taskNumber = getNextTaskNumber(allBlocks);
    const updated: Block = {
      ...block,
      kind: 'task',
      task: createTaskMetadata(Date.now(), { type: 'user' }, taskNumber),
      content: convertedContent,
      plainText: new DOMParser().parseFromString(convertedContent, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      tags: block.tags.filter(tag => !agentStatuses.has(tag)),
      updatedAt: Date.now()
    };
    await db.blocks.put(updated);
    await recordBlockRevision(updated, 'user', 'Block converted to task');
    await recordActivity({ projectId: block.projectId, blockId, action: 'task-converted', summary: `Block “${block.title}” converted to inbox task` });
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
        order: projects.reduce((highest, project) => Math.max(highest, project.order ?? -1), -1) + 1,
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
        const duplicatedTask = srcBlock.task
          ? { ...taskWithoutActiveClaim(srcBlock.task, 'inbox', now), status: 'inbox' as const, readyAt: undefined, claimAttempt: undefined, position: now, creator: { type: 'user' as const } }
          : undefined;
        await db.blocks.add({
          ...srcBlock,
          id: newId,
          parentId: newParentId,
          title: newParentId === block.parentId ? `${srcBlock.title} (Kopie)` : srcBlock.title,
          isTrash: false,
          trashedAt: undefined,
          task: duplicatedTask,
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
      if (window.confirm(`Move project "${item.title}" to the trash?`)) {
        await trashProject(item.id);
        await recordActivity({ projectId: item.id, action: 'project-trashed', summary: `Project “${item.title}” moved to trash` });
        setActiveProjectId(null);
        setSelectedBlockPath([]);
      }
    } else {
      const block = item as Block;
      const wasSelected = selectedBlockPath.includes(block.id);
      const fallback = getDeleteFallbackTarget(block, allBlocks, selectedBlockPath);
      await trashBlock(block.id);
      await recordActivity({ projectId: block.projectId, blockId: block.id, action: 'block-trashed', summary: `Block “${block.title}” moved to trash` });
      setSelectedBlockPath(fallback.newPath);
      if (fallback.focusedId) setFocusedCardId(fallback.focusedId);
      setFocusedLevel(fallback.focusedLevel);
      if (wasSelected && block.projectId === TASK_INBOX_PROJECT_ID && fallback.newPath.length === 0) {
        setActiveProjectId(null);
        setFocusedCardId(null);
      }
    }
  };

  const handleMarkAsRead = async (item: Block | Project, type: 'project' | 'block') => {
    if (type === 'project') {
      await markProjectAsRead(item.id);
    } else {
      await markBlockSubtreeAsRead(item.id);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => {
    setDraggedItem({ item, type });
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => {
    e.preventDefault();
    if (!draggedItem || draggedItem.type !== type || draggedItem.item.id === targetItem.id) {
      setDragTarget(null);
      return;
    }
    if (type === 'block') {
      const source = draggedItem.item as Block;
      const target = targetItem as Block;
      if (source.projectId !== target.projectId) {
        setDragTarget(null);
        return;
      }
    }
    e.dataTransfer.dropEffect = 'move';
    const position = getDropPosition(e as unknown as React.DragEvent<HTMLElement>);
    setDragTarget({ itemId: targetItem.id, position });
  };

  const handleDragLeave = () => {
    setDragTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => {
    e.preventDefault();
    if (!draggedItem || !dragTarget || draggedItem.type !== type) {
      setDragTarget(null);
      setDraggedItem(null);
      return;
    }

    if (type === 'project') {
      if (dragTarget.position !== 'inside') {
        await reorderProject(draggedItem.item.id, targetItem.id, dragTarget.position);
        await recordActivity({ projectId: draggedItem.item.id, action: 'project-reordered', summary: `Project “${draggedItem.item.title}” moved` });
      }
    } else {
      const block = draggedItem.item as Block;
      if (!(await isDescendantOrSelf(block.id, targetItem.id))) {
        const moved = await moveBlockInTree(block.id, targetItem.id, dragTarget.position);
        if (moved) {
          const byId = new Map(allBlocks.map(item => [item.id, item]));
          const movedBlock = await db.blocks.get(block.id);
          if (movedBlock) byId.set(movedBlock.id, movedBlock);
          const path: string[] = [];
          let current: Block | undefined = movedBlock;
          const visited = new Set<string>();
          while (current && !visited.has(current.id)) {
            visited.add(current.id);
            path.unshift(current.id);
            current = current.parentId ? byId.get(current.parentId) : undefined;
          }
          setActiveProjectId(block.projectId);
          setSelectedBlockPath(path);
          setFocusedLevel(path.length);
          setFocusedCardId(block.id);
          await recordActivity({ projectId: block.projectId, blockId: block.id, action: 'block-reordered', summary: `Block “${block.title}” moved` });
        }
      }
    }
    setDragTarget(null);
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
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

  const [focusTitleSignal, setFocusTitleSignal] = useState(0);
  const [findSignal, setFindSignal] = useState(0);

  useKeyboardShortcuts({
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onNavigateRight: handleNavigateRight,
    onNavigateLeft: handleNavigateLeft,
    onEditFocus: () => {
      setIsWritingPanelOpen(true);
      setFocusTitleSignal(prev => prev + 1);
    },
    onOpenSearch: () => setIsSearchOpen(true),
    onFindInDocument: () => {
      if (activeBlockId || activeProjectId) {
        setIsWritingPanelOpen(true);
        setFindSignal(prev => prev + 1);
      } else {
        setIsSearchOpen(true);
      }
    },
    onNewBlock: () => handleAddNewItem(focusedLevel, activeColumn?.parentId || null),
    onAddChildBlock: () => {
      const item = activeColumnItems[currentFocusedIndex];
      if (item) {
        handleAddChildItem(item.id);
      }
    },
    onDuplicate: () => {
      const item = activeColumnItems[currentFocusedIndex];
      if (item) handleDuplicate(item, activeColumn.type);
    },
    onTrash: () => {
      const item = activeColumnItems[currentFocusedIndex];
      if (item) handleDeleteToTrash(item, activeColumn.type);
    },
    onToggleWritingPanel: () => setIsWritingPanelOpen(prev => !prev),
    onOpenHelp: () => setIsHelpOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
    onSwitchView: setActiveView
  });

  const openBlockById = useCallback((blockId: string) => {
    const block = allBlocks.find(item => item.id === blockId);
    if (!block) return;
    const byId = new Map(allBlocks.map(item => [item.id, item]));
    const path: string[] = [];
    let current: Block | undefined = block;
    while (current) {
      path.unshift(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    setActiveProjectId(block.projectId);
    setSelectedBlockPath(path);
    setFocusedLevel(path.length);
    setFocusedCardId(block.id);
    setIsWritingPanelOpen(true);
    if (block.kind === 'task') {
      setActiveView('tasks');
    } else {
      setActiveView('columns');
    }
  }, [allBlocks]);

  const handleSelectSearchResult = (blockId: string) => {
    openBlockById(blockId);
  };

  const handleApplyTemplate = async (template: BlockTemplate) => {
    if (!activeProjectId) throw new Error('Open eerst een project.');
    const parentId = activeBlock?.parentId ?? null;
    const siblings = allBlocks.filter(block => block.projectId === activeProjectId && block.parentId === parentId);
    const id = createId('block');
    const taskCount = (template.content.match(/data-type="taskItem"/g) ?? []).length;
    const completedTaskCount = (template.content.match(/data-checked="true"/g) ?? []).length;
    const now = Date.now();
    await db.blocks.add({
      id, projectId: activeProjectId, parentId, title: template.title, content: template.content,
      plainText: template.plainText, order: siblings.length, childCount: 0, taskCount, completedTaskCount,
      attachmentCount: 0, tags: template.tags, isTrash: false, createdAt: now, updatedAt: now
    });
    await recordActivity({ projectId: activeProjectId, blockId: id, action: 'template-applied', summary: `Template “${template.name}” toegepast` });
    const byId = new Map(allBlocks.map(block => [block.id, block]));
    const path: string[] = [];
    let current = parentId ? byId.get(parentId) : undefined;
    while (current) {
      path.unshift(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    path.push(id);
    setSelectedBlockPath(path);
    setFocusedLevel(path.length);
    setFocusedCardId(id);
    setIsWritingPanelOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: 'var(--bg-dark)' }}>
      <Breadcrumbs
        pathSegments={pathSegments}
        onSelectSegment={handleSelectBreadcrumbSegment}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenTrash={() => setIsTrashOpen(true)}
        onOpenExportImport={() => setIsExportImportOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenWorkspace={() => setIsWorkspaceOpen(true)}
        onTriggerScreenAnnotation={handleTriggerScreenAnnotation}
        isWritingPanelOpen={isWritingPanelOpen}
        onToggleWritingPanel={() => setIsWritingPanelOpen(prev => !prev)}
        updaterState={updaterState}
        onInstallUpdate={handleInstallUpdate}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeView === 'columns' && (
          <HorizontalLayout
            columns={columns}
            activeLevel={focusedLevel}
            focusedCardId={focusedCardId}
            unseenAgentEditsByProject={agentEditCounts.byProject}
            unseenAgentEditsByBlock={agentEditCounts.byBlock}
            blockedBlockIds={blockedBlockIds}
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
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        )}

        {activeView === 'tasks' && (
          <TasksView
            projects={projects}
            blocks={allBlocks}
            onOpenTask={openBlockById}
            onDeleteTask={task => handleDeleteToTrash(task, 'block')}
          />
        )}

        {activeView === 'stats' && (
          <StatisticsView
            projects={projects}
            blocks={allBlocks}
            activeProjectId={activeProjectId}
            onSelectProject={(projId) => {
              setActiveProjectId(projId);
              setSelectedBlockPath([]);
              setActiveView('columns');
            }}
            onSelectBlock={(blockId) => openBlockById(blockId)}
          />
        )}

        <WritingPanel
          isOpen={isWritingPanelOpen}
          activeItem={activeInspectorItem}
          itemType={activeInspectorType}
          pathSegments={pathSegments}
          saveStatus={saveStatus}
          focusTitleSignal={focusTitleSignal}
          findSignal={findSignal}
          allProjectBlocks={activeProjectId ? allBlocks.filter(b => b.projectId === activeProjectId) : []}
          taskProjects={projects}
          allWorkspaceBlocks={allBlocks}
          onRelocateTask={relocateUserTask}
          onReturnFocusToCards={() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }}
          onSaveItem={handleSaveItem}
          tagSuggestions={activeInspectorType === 'project' ? projectTagSuggestions : blockTagSuggestions}
          onRenameProjectTag={(from, to) => activeProjectId ? renameTagInProject(activeProjectId, from, to) : Promise.resolve(0)}
          onDeleteProjectTag={tag => activeProjectId ? deleteTagFromProject(activeProjectId, tag) : Promise.resolve(0)}
          attachments={activeAttachments}
          onAddAttachments={handleAddAttachments}
          onOpenAttachment={handleOpenAttachment}
          onRemoveAttachment={handleRemoveAttachment}
          onShowAttachmentsFolder={projectId => window.electronAPI?.showAttachmentsFolder(projectId) ?? Promise.reject(new Error('De projectmap is alleen beschikbaar in de desktop-app.'))}
          references={blockReferences}
          onOpenReferencedBlock={openBlockById}
          onPrintBlock={window.electronAPI?.printBlockDocument ? handlePrintBlock : undefined}
          onExportBlockPdf={window.electronAPI?.exportBlockDocumentPdf ? handleExportBlockPdf : undefined}
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
          onAddTask={parentId => handleAddChildItem(parentId, 'task')}
          onConvertToTask={blockId => void handleConvertBlockToTask(blockId)}
          onDuplicate={handleDuplicate}
          onMarkAsRead={handleMarkAsRead}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
        onOpenWhatsNew={() => setIsWhatsNewOpen(true)}
      />

      <WhatsNewModal
        isOpen={isWhatsNewOpen}
        onClose={handleCloseWhatsNew}
        currentAppVersion={updaterState?.currentVersion || CURRENT_APP_VERSION}
      />

      <WorkspaceModal
        isOpen={isWorkspaceOpen}
        onClose={() => setIsWorkspaceOpen(false)}
        activeProject={activeProject}
        activeBlock={activeBlock}
        blocks={allBlocks}
        onOpenBlock={openBlockById}
        onApplyTemplate={handleApplyTemplate}
      />

      {overlayData && (
        <ScreenAnnotationOverlay
          screenshotDataUrl={overlayData.screenshotDataUrl}
          onClose={() => setOverlayData(null)}
          onBlockCreated={handleBlockCreatedFromOverlay}
        />
      )}

      <UpdateNotification
        updaterState={updaterState}
        onInstall={handleInstallUpdate}
      />
    </div>
  );
}

export function App() {
  const isOverlayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('overlay') === 'true';

  if (isOverlayMode) {
    return (
      <ScreenAnnotationOverlay
        isStandaloneOverlay={true}
        onClose={() => {
          if (window.electronAPI?.screenCapture?.closeOverlay) {
            window.electronAPI.screenCapture.closeOverlay();
          }
        }}
      />
    );
  }

  return <DeepScribeApp />;
}

export default App;
