import React, { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import type { Project, Block, Attachment, SaveStatus, PathSegment, TaskMetadata, TaskStatus } from '../../types';
import { TipTapEditor, type TipTapEditorHandle } from './TipTapEditor';
import { TagBadge } from '../Navigation/TagBadge';
import { TagManagerModal } from '../Modals/TagManagerModal';
import { VersionHistoryModal } from '../Modals/VersionHistoryModal';
import { PrintSettingsModal } from '../Modals/PrintSettingsModal';
import { extractHashtags, mergeTags, parseTag, sanitizeTags } from '../../utils/tagUtils';
import { initialTagComposerState, tagComposerReducer } from '../../utils/tagComposer';
import { getBlockDependencyStatus, detectCircularDependency, sanitizeDependsOn, isBlockCompleted } from '../../utils/dependencyUtils';
import { getStoredPrintSettingsSync, loadStoredPrintSettings, saveStoredPrintSettings, type BlockPrintSettings } from '../../utils/printDocument';
import { canTransitionTask, taskCreatorLabel, TASK_AGENT_LABELS, TASK_AGENT_TARGETS, TASK_STATUSES, TASK_STATUS_LABELS, validateTaskReady } from '../../utils/taskBlocks';
import { saveProjectDraft } from '../../db/operations';
import { PROJECT_COLOR_PALETTE, DEFAULT_PROJECT_COLOR } from '../../utils/projectColors';
import { Check, Loader2, AlertCircle, FileText, Folder, FolderOpen, Paperclip, PanelRightClose, Edit3, Plus, Tag as TagIcon, Settings2, Trash2, Link2, ArrowUpRight, X, History, Lock, CheckCircle2, Clock, Bot, ClipboardCopy, Printer } from 'lucide-react';
import './Editor.css';

interface WritingPanelProps {
  isOpen: boolean;
  activeItem: Project | Block | null;
  itemType: 'project' | 'block' | null;
  pathSegments: PathSegment[];
  saveStatus: SaveStatus;
  focusTitleSignal?: number;
  findSignal?: number;
  allProjectBlocks?: Block[];
  taskProjects?: Project[];
  allWorkspaceBlocks?: Block[];
  onRelocateTask?: (task: Block, projectId: string | null, parentId: string | null) => Promise<void>;
  onReturnFocusToCards?: () => void;
  onSaveItem: (
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
  ) => Promise<void>;
  tagSuggestions?: Array<{ tag: string; count: number }>;
  onRenameProjectTag?: (from: string, to: string) => Promise<number>;
  onDeleteProjectTag?: (tag: string) => Promise<number>;
  attachments?: Attachment[];
  onAddAttachments?: (blockId: string) => Promise<void>;
  onOpenAttachment?: (attachment: Attachment) => Promise<void>;
  onRemoveAttachment?: (attachment: Attachment) => Promise<void>;
  onShowAttachmentsFolder?: (projectId: string) => Promise<void>;
  references?: { outgoing: Block[]; backlinks: Block[] };
  onOpenReferencedBlock?: (blockId: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  onPrintBlock?: (blockId: string, draft: { title: string; content: string }, settings: BlockPrintSettings) => Promise<{ status: 'printed' | 'cancelled' }>;
  onExportBlockPdf?: (blockId: string, draft: { title: string; content: string }, settings: BlockPrintSettings) => Promise<{ status: 'exported' | 'cancelled'; filePath?: string }>;
  onClose: () => void;
}

export const WritingPanel: React.FC<WritingPanelProps> = ({
  isOpen,
  activeItem,
  itemType,
  saveStatus,
  focusTitleSignal,
  findSignal,
  allProjectBlocks = [],
  taskProjects = [],
  allWorkspaceBlocks = [],
  onRelocateTask,
  onReturnFocusToCards,
  onSaveItem,
  tagSuggestions = [],
  onRenameProjectTag,
  onDeleteProjectTag,
  attachments = [],
  onAddAttachments,
  onOpenAttachment,
  onRemoveAttachment,
  onShowAttachmentsFolder,
  references = { outgoing: [], backlinks: [] },
  onOpenReferencedBlock,
  onUploadImage,
  onPrintBlock,
  onExportBlockPdf,
  onClose
}) => {
  const [title, setTitle] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainTextContent, setPlainTextContent] = useState('');
  const [taskCount, setTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [scratchpad, setScratchpad] = useState('');
  const [projectColor, setProjectColor] = useState<string>(DEFAULT_PROJECT_COLOR);
  const [taskMetadata, setTaskMetadata] = useState<TaskMetadata | undefined>();
  const [taskErrors, setTaskErrors] = useState<string[]>([]);
  const [scratchpadCopied, setScratchpadCopied] = useState(false);
  const [tagComposer, dispatchTagComposer] = useReducer(tagComposerReducer, initialTagComposerState);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isPrintSettingsOpen, setIsPrintSettingsOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState<BlockPrintSettings>(getStoredPrintSettingsSync);

  useEffect(() => {
    let isMounted = true;
    loadStoredPrintSettings().then(stored => {
      if (isMounted) {
        setPrintSettings(stored);
      }
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePrintSettingsChange = useCallback((newSettings: BlockPrintSettings) => {
    setPrintSettings(newSettings);
    void saveStoredPrintSettings(newSettings);
  }, []);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const tipTapEditorRef = useRef<TipTapEditorHandle>(null);
  const observedHashtagsRef = useRef<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const activeTaskBlock = itemType === 'block' && activeItem && 'projectId' in activeItem && activeItem.kind === 'task' ? activeItem : null;
  const taskProjectId = activeTaskBlock?.projectId ?? '';
  const taskContextCandidates = useMemo(
    () => allWorkspaceBlocks.filter(block => !block.isTrash && block.projectId === taskProjectId && block.id !== activeTaskBlock?.id && block.kind !== 'task'),
    [allWorkspaceBlocks, taskProjectId, activeTaskBlock?.id]
  );

  const DEFAULT_WIDTH = 480;
  const MIN_WIDTH = 320;

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('deepscribe_panel_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH) return parsed;
    }
    return DEFAULT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleDoubleClickResize = useCallback(() => {
    setPanelWidth(DEFAULT_WIDTH);
    localStorage.setItem('deepscribe_panel_width', DEFAULT_WIDTH.toString());
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const currentWidth = Math.max(MIN_WIDTH, Math.min(newWidth, window.innerWidth * 0.8));
      localStorage.setItem('deepscribe_panel_width', currentWidth.toString());
      setPanelWidth(currentWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const activeItemIdRef = useRef<string | null>(null);
  const loadedUpdatedAtRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const saveRequestedRef = useRef(false);
  const draftRef = useRef({
    title: '',
    htmlContent: '',
    plainTextContent: '',
    taskCount: 0,
    completedTaskCount: 0,
    tags: [] as string[],
    dependsOn: [] as string[],
    scratchpad: '',
    taskMetadata: undefined as TaskMetadata | undefined,
    isDirty: false,
    itemType: null as 'project' | 'block' | null
  });

  useEffect(() => {
    draftRef.current = {
      title,
      htmlContent,
      plainTextContent,
      taskCount,
      completedTaskCount,
      tags,
      dependsOn,
      scratchpad,
      taskMetadata,
      isDirty,
      itemType
    };
  }, [title, htmlContent, plainTextContent, taskCount, completedTaskCount, tags, dependsOn, scratchpad, taskMetadata, isDirty, itemType]);

  const flushSave = useCallback(async () => {
    const currentId = activeItemIdRef.current;
    if (!currentId || !draftRef.current.isDirty) return;
    if (isSavingRef.current) {
      saveRequestedRef.current = true;
      return;
    }

    // Sync deliberate inline hashtags from html content before saving
    let finalTags = draftRef.current.tags;
    if (draftRef.current.itemType === 'block') {
      const currentContentHashtags = extractHashtags(draftRef.current.htmlContent);
      const manualTags = draftRef.current.tags.filter(t => !observedHashtagsRef.current.has(t));
      finalTags = mergeTags(manualTags, currentContentHashtags);
      draftRef.current.tags = finalTags;
      observedHashtagsRef.current = new Set(currentContentHashtags);
      setTags(finalTags);
    }

    const { title, htmlContent, plainTextContent, taskCount, completedTaskCount, itemType, dependsOn: currentDependsOn, scratchpad: currentScratchpad, taskMetadata: currentTask } = draftRef.current;

    // Reset dirty flag BEFORE async save so any typing during save marks state dirty again
    setIsDirty(false);
    draftRef.current.isDirty = false;
    isSavingRef.current = true;

    try {
      if (itemType) {
        await onSaveItem(currentId, itemType, title, htmlContent, plainTextContent, taskCount, completedTaskCount, finalTags, currentDependsOn, currentScratchpad, currentTask);
      }
    } finally {
      isSavingRef.current = false;
      if (saveRequestedRef.current || draftRef.current.isDirty) {
        saveRequestedRef.current = false;
        queueMicrotask(() => void flushSave());
      }
    }
  }, [onSaveItem]);

  useEffect(() => {
    const previousId = activeItemIdRef.current;
    const isNewItem = activeItem?.id !== previousId;

    if (previousId && isNewItem) {
      flushSave();
    }

    activeItemIdRef.current = activeItem?.id || null;

    if (activeItem) {
      const hasExternalUpdate = !isNewItem
        && activeItem.updatedAt !== loadedUpdatedAtRef.current
        && !draftRef.current.isDirty
        && !isSavingRef.current;

      if (isNewItem || hasExternalUpdate) {
        const nextTitle = activeItem.title || '';
        let nextHtmlContent: string;
        let nextPlainTextContent: string;
        let nextTaskCount: number;
        let nextCompletedTaskCount: number;
        let nextTags: string[];
        let nextDependsOn: string[] = [];
        let nextScratchpad = '';
        let nextTaskMetadata: TaskMetadata | undefined;

        if (itemType === 'block') {
          const b = activeItem as Block;
          nextHtmlContent = b.content || '';
          nextPlainTextContent = b.plainText || '';
          nextTaskCount = b.taskCount || 0;
          nextCompletedTaskCount = b.completedTaskCount || 0;
          nextTags = sanitizeTags(b.tags);
          nextDependsOn = sanitizeDependsOn(b.dependsOn);
          nextScratchpad = '';
          nextTaskMetadata = b.kind === 'task' && b.task ? { ...b.task } : undefined;
          observedHashtagsRef.current = new Set(extractHashtags(b.content || ''));
        } else {
          const p = activeItem as Project;
          nextHtmlContent = p.description || '';
          nextPlainTextContent = p.description || '';
          nextTaskCount = 0;
          nextCompletedTaskCount = 0;
          nextTags = sanitizeTags(p.tags);
          nextDependsOn = [];
          nextScratchpad = p.scratchpad || '';
          nextTaskMetadata = undefined;
          observedHashtagsRef.current = new Set();
          setProjectColor(p.color || DEFAULT_PROJECT_COLOR);
        }

        draftRef.current = {
          title: nextTitle,
          htmlContent: nextHtmlContent,
          plainTextContent: nextPlainTextContent,
          taskCount: nextTaskCount,
          completedTaskCount: nextCompletedTaskCount,
          tags: nextTags,
          dependsOn: nextDependsOn,
          scratchpad: nextScratchpad,
          taskMetadata: nextTaskMetadata,
          isDirty: false,
          itemType
        };
        setTitle(nextTitle);
        setHtmlContent(nextHtmlContent);
        setPlainTextContent(nextPlainTextContent);
        setTaskCount(nextTaskCount);
        setCompletedTaskCount(nextCompletedTaskCount);
        setTags(nextTags);
        setDependsOn(nextDependsOn);
        setScratchpad(nextScratchpad);
        setTaskMetadata(nextTaskMetadata);
        setTaskErrors([]);
        setIsDirty(false);
        loadedUpdatedAtRef.current = activeItem.updatedAt;
        setAttachmentError(null);
        setPrintError(null);
        if (isNewItem) dispatchTagComposer({ type: 'close' });
      }
    } else {
      loadedUpdatedAtRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.id, activeItem?.updatedAt, itemType, flushSave]);

  const isBlock = itemType === 'block';

  const dependencyStatus = useMemo(() => {
    if (!isBlock || !activeItem) return null;
    return getBlockDependencyStatus(activeItem as Block, allProjectBlocks);
  }, [isBlock, activeItem, allProjectBlocks]);

  const candidateDependencyBlocks = useMemo(() => {
    if (!isBlock || !activeItem || !allProjectBlocks) return [];
    const currentId = activeItem.id;
    return allProjectBlocks.filter(other => {
      if (other.id === currentId) return false;
      if (dependsOn.includes(other.id)) return false;
      if (detectCircularDependency(allProjectBlocks, currentId, other.id)) return false;
      return true;
    });
  }, [isBlock, activeItem, allProjectBlocks, dependsOn]);

  const handleAddDependency = (depId: string) => {
    if (!depId || dependsOn.includes(depId)) return;
    const next = [...dependsOn, depId];
    setDependsOn(next);
    draftRef.current.dependsOn = next;
    draftRef.current.isDirty = true;
    setIsDirty(true);
    flushSave();
  };

  const handleRemoveDependency = (depId: string) => {
    const next = dependsOn.filter(id => id !== depId);
    setDependsOn(next);
    draftRef.current.dependsOn = next;
    draftRef.current.isDirty = true;
    setIsDirty(true);
    flushSave();
  };

  const updateTaskMetadata = (next: TaskMetadata) => {
    setTaskMetadata(next);
    draftRef.current.taskMetadata = next;
    draftRef.current.isDirty = true;
    setTaskErrors([]);
    setIsDirty(true);
  };

  const handleTaskStatus = (status: TaskStatus) => {
    const current = draftRef.current.taskMetadata;
    if (!current) return;
    if (!canTransitionTask(current.status, status)) {
      setTaskErrors([`Transition from ${TASK_STATUS_LABELS[current.status]} to ${TASK_STATUS_LABELS[status]} is not allowed.`]);
      return;
    }
    const next: TaskMetadata = {
      ...current,
      status,
      claim: undefined,
      ...(status === 'ready' ? { readyAt: Date.now() } : {})
    };
    if (status === 'ready') {
      const errors = validateTaskReady(draftRef.current.title, draftRef.current.htmlContent, next);
      if (errors.length > 0) {
        setTaskErrors(errors);
        return;
      }
    }
    updateTaskMetadata(next);
    void flushSave();
  };

  const handleScratchpadChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setScratchpad(val);
    draftRef.current.scratchpad = val;
    draftRef.current.isDirty = true;
    setIsDirty(true);
  };

  const handleCopyScratchpad = async () => {
    if (!scratchpad) return;
    try {
      await navigator.clipboard.writeText(scratchpad);
      setScratchpadCopied(true);
      setTimeout(() => setScratchpadCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const handleColorChange = (newColor: string) => {
    setProjectColor(newColor);
    if (itemType === 'project' && activeItem) {
      void saveProjectDraft(activeItem.id, {
        title: draftRef.current.title,
        description: draftRef.current.htmlContent || draftRef.current.plainTextContent,
        tags: draftRef.current.tags,
        color: newColor,
        scratchpad: draftRef.current.scratchpad
      });
    }
  };

  useEffect(() => {
    if (focusTitleSignal && focusTitleSignal > 0) {
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        }
      }, 50);
    }
  }, [focusTitleSignal]);

  useEffect(() => {
    if (findSignal && findSignal > 0) {
      setTimeout(() => {
        if (tipTapEditorRef.current) {
          tipTapEditorRef.current.openFind();
        }
      }, 50);
    }
  }, [findSignal]);

  const handleAddTag = (tagText: string) => {
    const parsed = parseTag(tagText);
    if (!parsed.tag) {
      dispatchTagComposer({ type: 'invalid', error: parsed.error ?? 'Invalid tag.' });
      return;
    }
    const norm = parsed.tag;
    if (draftRef.current.tags.includes(norm)) {
      dispatchTagComposer({ type: 'invalid', error: `Tag "${norm}" has already been added.` });
      return;
    }
    const nextTags = [...draftRef.current.tags, norm];
    draftRef.current.tags = nextTags;
    draftRef.current.isDirty = true;
    setTags(nextTags);
    setIsDirty(true);
    dispatchTagComposer({ type: 'close' });
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = draftRef.current.tags.filter(t => t !== tagToRemove);
    draftRef.current.tags = updated;
    draftRef.current.isDirty = true;
    observedHashtagsRef.current.delete(tagToRemove);
    setTags(updated);
    setIsDirty(true);
    dispatchTagComposer({ type: 'clear-error' });
  };

  // Save shortly after typing stops; blur and the periodic timer remain fallbacks.
  useEffect(() => {
    if (!isDirty) return;
    const timeout = window.setTimeout(() => void flushSave(), 750);
    return () => window.clearTimeout(timeout);
  }, [isDirty, title, htmlContent, plainTextContent, taskCount, completedTaskCount, tags, taskMetadata, flushSave]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (draftRef.current.isDirty) {
        flushSave();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [flushSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (draftRef.current.isDirty && activeItemIdRef.current && draftRef.current.itemType) {
        onSaveItem(
          activeItemIdRef.current,
          draftRef.current.itemType,
          draftRef.current.title,
          draftRef.current.htmlContent,
          draftRef.current.plainTextContent,
          draftRef.current.taskCount,
          draftRef.current.completedTaskCount,
          draftRef.current.tags,
          draftRef.current.dependsOn,
          draftRef.current.scratchpad,
          draftRef.current.taskMetadata
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [onSaveItem]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = e.target.value;
    draftRef.current.title = nextTitle;
    draftRef.current.isDirty = true;
    setTitle(nextTitle);
    setIsDirty(true);
  };

  const handleEditorChange = (html: string, plainText: string, tasks: number, completedTasks: number) => {
    draftRef.current = {
      ...draftRef.current,
      htmlContent: html,
      plainTextContent: plainText,
      taskCount: tasks,
      completedTaskCount: completedTasks,
      isDirty: true
    };
    setHtmlContent(html);
    setPlainTextContent(plainText);
    setTaskCount(tasks);
    setCompletedTaskCount(completedTasks);
    setIsDirty(true);
  };

  const blockProjectId = isBlock ? (activeItem as Block | null)?.projectId : null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const wordCount = plainTextContent.trim() ? plainTextContent.trim().split(/\s+/).length : 0;
  const charCount = plainTextContent.length;

  if (!isOpen) return null;

  return (
    <div
      className={`writing-panel ${!isOpen ? 'collapsed' : ''} ${isResizing ? 'is-resizing' : ''}`}
      style={{ width: `${panelWidth}px` }}
    >
      <div
        className={`panel-resize-handle ${isResizing ? 'active' : ''}`}
        onMouseDown={handleMouseDownResize}
        onDoubleClick={handleDoubleClickResize}
        title="Drag to resize (double-click for 480px)"
      />
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {itemType === 'project' ? <Folder size={18} color="var(--atmosphere-color)" /> : <FileText size={18} color="var(--atmosphere-secondary)" />}
          <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {itemType === 'project' ? 'Project Details' : 'Block Inspector'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={`save-status-badge ${saveStatus.state}`}>
            {isDirty ? (
              <>
                <Edit3 size={12} color="var(--atmosphere-secondary)" />
                <span>Draft</span>
              </>
            ) : saveStatus.state === 'saved' ? (
              <>
                <Check size={12} color="var(--atmosphere-color)" />
                <span>Saved</span>
              </>
            ) : saveStatus.state === 'saving' ? (
              <>
                <Loader2 size={12} className="animate-spin" color="var(--atmosphere-secondary)" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <AlertCircle size={12} color="#EF4444" />
                <span>Save failed</span>
              </>
            )}
          </div>

          {isBlock && activeItem && onPrintBlock && (
            <button
              className="icon-btn-subtle"
              type="button"
              disabled={isPrinting}
              onClick={() => {
                setPrintError(null);
                setIsPrintSettingsOpen(true);
              }}
              title="Print this block and its descendants"
              aria-label="Print this block and its descendants"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: isPrinting ? 'wait' : 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4
              }}
            >
              {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            </button>
          )}

          {isBlock && (
            <button
              className="icon-btn-subtle"
              type="button"
              onClick={() => setIsHistoryModalOpen(true)}
              title="View version history & diffs"
              aria-label="View version history & diffs"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4
              }}
            >
              <History size={16} />
            </button>
          )}

          <button
            className="icon-btn-subtle"
            onClick={() => {
              flushSave();
              onClose();
            }}
            title="Collapse writing panel"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {printError && (
        <div className="print-error" role="alert">
          <AlertCircle size={13} />
          <span>{printError}</span>
        </div>
      )}

      {!activeItem ? (
        <div style={{ flex: 1, padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Select a project or text block from the columns to start writing.
        </div>
      ) : (
        <>
          <input
            ref={titleInputRef}
            className="editor-title-input"
            type="text"
            value={title}
            onChange={handleTitleChange}
            onBlur={flushSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tipTapEditorRef.current?.focus();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.blur();
                if (onReturnFocusToCards) onReturnFocusToCards();
              }
            }}
            placeholder={itemType === 'project' ? 'Project title...' : 'Block title...'}
          />

          {itemType === 'project' && (
            <div style={{ margin: '10px 0 14px', padding: '10px 12px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Project Color
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {PROJECT_COLOR_PALETTE.map(option => (
                  <button
                    key={option.hex}
                    type="button"
                    title={option.name}
                    aria-label={`Select ${option.name} color`}
                    onClick={() => handleColorChange(option.hex)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      backgroundColor: option.hex,
                      border: projectColor === option.hex ? '2px solid white' : '2px solid transparent',
                      boxShadow: projectColor === option.hex ? `0 0 0 2px ${option.hex}` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'transform 0.15s ease'
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={projectColor}
                  onChange={e => handleColorChange(e.target.value)}
                  title="Custom color"
                  aria-label="Custom project color"
                  style={{ width: 26, height: 26, padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 4 }}
                />
              </div>
            </div>
          )}

          {isBlock && taskMetadata && (
            <section className="task-inspector-panel">
              <div className="task-inspector-heading">
                <span><CheckCircle2 size={14} /> Task · {TASK_STATUS_LABELS[taskMetadata.status]}</span>
                <div className="task-status-actions">
                  {taskMetadata.claim ? (
                    <button type="button" onClick={() => handleTaskStatus('ready')}>Release claim</button>
                  ) : (
                    <select value={taskMetadata.status} onChange={event => handleTaskStatus(event.target.value as TaskStatus)} aria-label="Task status">
                      {TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {taskCreatorLabel(taskMetadata) && (
                <div className="task-creator-details"><Bot size={13} /> Created by {taskCreatorLabel(taskMetadata)}</div>
              )}
              {taskMetadata.claim && (
                <div className="task-claim-details">
                  <strong>{taskMetadata.claim.ownerId}</strong>
                  <span>{TASK_AGENT_LABELS[taskMetadata.claim.agentTarget]} · attempt {taskMetadata.claim.attempt}</span>
                  <span>Lease until {new Date(taskMetadata.claim.expiresAt).toLocaleString('en-US')}</span>
                </div>
              )}
              <div className="task-metadata-grid single">
                <label>
                  <span>Project</span>
                  <select
                    disabled={Boolean(taskMetadata.claim) || !activeTaskBlock || !onRelocateTask}
                    value={taskProjects.some(project => project.id === taskProjectId) ? taskProjectId : ''}
                    onChange={event => void onRelocateTask?.(activeTaskBlock!, event.target.value || null, null)}
                  >
                    <option value="">Workspace Inbox</option>
                    {taskProjects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
                  </select>
                </label>
                <label>
                  <span>Context</span>
                  <select
                    disabled={Boolean(taskMetadata.claim) || !activeTaskBlock || !onRelocateTask || !taskProjects.some(project => project.id === taskProjectId)}
                    value={activeTaskBlock?.parentId ?? ''}
                    onChange={event => void onRelocateTask?.(activeTaskBlock!, taskProjectId, event.target.value || null)}
                  >
                    <option value="">No context block</option>
                    {taskContextCandidates.map(block => <option key={block.id} value={block.id}>{block.title}</option>)}
                  </select>
                </label>
                <label>
                  <span>Agent</span>
                  <select disabled={Boolean(taskMetadata.claim)} value={taskMetadata.agentTarget} onChange={event => updateTaskMetadata({ ...taskMetadata, agentTarget: event.target.value as TaskMetadata['agentTarget'], customAgentName: event.target.value === 'custom' ? taskMetadata.customAgentName : undefined })}>
                    {TASK_AGENT_TARGETS.map(target => <option key={target} value={target}>{TASK_AGENT_LABELS[target]}</option>)}
                  </select>
                </label>
              </div>
              {taskMetadata.agentTarget === 'custom' && (
                <label className="task-custom-agent">
                  <span>Other agent</span>
                  <input value={taskMetadata.customAgentName ?? ''} onChange={event => updateTaskMetadata({ ...taskMetadata, customAgentName: event.target.value })} placeholder="Agent/provider name" />
                </label>
              )}
              {taskErrors.length > 0 && <ul className="task-validation-errors" role="alert">{taskErrors.map(error => <li key={error}>{error}</li>)}</ul>}
            </section>
          )}

          {itemType && (
            <div style={{ padding: '0 24px 10px 24px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <TagIcon size={13} color="var(--text-muted)" style={{ opacity: 0.7 }} />
              {tags.map(tag => (
                <TagBadge key={tag} tag={tag} onRemove={handleRemoveTag} size="sm" />
              ))}
              {tagComposer.isOpen ? (
                <span
                  className="tag-composer"
                  onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      dispatchTagComposer({ type: 'close' });
                    }
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={tagComposer.value}
                    onChange={event => dispatchTagComposer({ type: 'change', value: event.target.value })}
                    list="project-tag-suggestions"
                    aria-label="New tag"
                    aria-invalid={Boolean(tagComposer.error)}
                    aria-describedby={tagComposer.error ? 'tag-composer-error' : undefined}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddTag(tagComposer.value);
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        dispatchTagComposer({ type: 'close' });
                      }
                    }}
                    placeholder="new tag..."
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(tagComposer.value)}
                    aria-label="Add tag"
                    title="Add tag"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatchTagComposer({ type: 'close' })}
                    aria-label="Close tag input"
                    title="Cancel"
                  >
                    <X size={11} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => dispatchTagComposer({ type: 'open' })}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: '6px',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                  title="Add tag"
                >
                  <Plus size={11} /> Tag
                </button>
              )}
              <datalist id="project-tag-suggestions">
                {tagSuggestions.filter(suggestion => !tags.includes(suggestion.tag)).map(suggestion => (
                  <option key={suggestion.tag} value={suggestion.tag}>
                    {suggestion.count} {itemType === 'project' ? 'projects' : 'blocks'}
                  </option>
                ))}
              </datalist>
              {isBlock && onRenameProjectTag && onDeleteProjectTag && tagSuggestions.length > 0 && (
                <button type="button" onClick={() => setIsTagManagerOpen(true)} className="icon-btn-subtle" title="Manage project tags" aria-label="Manage project tags">
                  <Settings2 size={12} />
                </button>
              )}
              {tagComposer.error && (
                <span id="tag-composer-error" role="alert" style={{ width: '100%', color: '#FCA5A5', fontSize: '0.7rem' }}>
                  {tagComposer.error}
                </span>
              )}
            </div>
          )}
          {onRenameProjectTag && onDeleteProjectTag && (
            <TagManagerModal
              isOpen={isTagManagerOpen}
              tags={tagSuggestions}
              onClose={() => setIsTagManagerOpen(false)}
              onRename={async (from, to) => {
                const changed = await onRenameProjectTag(from, to);
                setTags(current => sanitizeTags(current.map(tag => tag === from ? to : tag)));
                return changed;
              }}
              onDelete={async tag => {
                const changed = await onDeleteProjectTag(tag);
                setTags(current => current.filter(value => value !== tag));
                return changed;
              }}
            />
          )}
          {isBlock && isHistoryModalOpen && (
            <VersionHistoryModal
              isOpen={isHistoryModalOpen}
              block={activeItem as Block}
              onClose={() => setIsHistoryModalOpen(false)}
              onRestored={(restoredBlock) => {
                setTitle(restoredBlock.title);
                setHtmlContent(restoredBlock.content);
                setPlainTextContent(restoredBlock.plainText);
                setTaskCount(restoredBlock.taskCount);
                setCompletedTaskCount(restoredBlock.completedTaskCount);
                setTags(restoredBlock.tags);
                setTaskMetadata(restoredBlock.kind === 'task' ? restoredBlock.task : undefined);
                draftRef.current = {
                  title: restoredBlock.title,
                  htmlContent: restoredBlock.content,
                  plainTextContent: restoredBlock.plainText,
                  taskCount: restoredBlock.taskCount,
                  completedTaskCount: restoredBlock.completedTaskCount,
                  tags: restoredBlock.tags,
                  dependsOn: restoredBlock.dependsOn || [],
                  scratchpad: '',
                  taskMetadata: restoredBlock.kind === 'task' ? restoredBlock.task : undefined,
                  isDirty: false,
                  itemType: 'block'
                };
                setIsDirty(false);
              }}
            />
          )}
          {isBlock && activeItem && onPrintBlock && (
            <PrintSettingsModal
              isOpen={isPrintSettingsOpen}
              isPrinting={isPrinting}
              settings={printSettings}
              onChange={handlePrintSettingsChange}
              onClose={() => setIsPrintSettingsOpen(false)}
              onPrint={async () => {
                if (isPrinting) return;
                setIsPrinting(true);
                setPrintError(null);
                try {
                  await saveStoredPrintSettings(printSettings);
                  await onPrintBlock(activeItem.id, {
                    title: draftRef.current.title,
                    content: draftRef.current.htmlContent
                  }, printSettings);
                  setIsPrintSettingsOpen(false);
                } catch (error) {
                  setPrintError(error instanceof Error ? error.message : 'Printing failed.');
                  setIsPrintSettingsOpen(false);
                } finally {
                  setIsPrinting(false);
                }
              }}
              onExportPdf={async () => {
                if (isPrinting || !onExportBlockPdf) return;
                setIsPrinting(true);
                setPrintError(null);
                try {
                  await saveStoredPrintSettings(printSettings);
                  await onExportBlockPdf(activeItem.id, {
                    title: draftRef.current.title,
                    content: draftRef.current.htmlContent
                  }, printSettings);
                  setIsPrintSettingsOpen(false);
                } catch (error) {
                  setPrintError(error instanceof Error ? error.message : 'PDF export failed.');
                  setIsPrintSettingsOpen(false);
                } finally {
                  setIsPrinting(false);
                }
              }}
            />
          )}
          {isBlock && (
            <section className="attachments-panel">
              <div className="attachments-header">
                <span className="attachments-title">
                  <Paperclip size={13} />
                  Attachments
                  {attachments.length > 0 && <span className="attachments-count">{attachments.length}</span>}
                </span>
                <div className="attachments-actions">
                  {blockProjectId && onShowAttachmentsFolder && (
                    <button
                      type="button"
                      className="attachment-icon-button"
                      title="Open project folder"
                      onClick={() => void onShowAttachmentsFolder(blockProjectId).catch(error => setAttachmentError(error instanceof Error ? error.message : 'Could not open the project folder.'))}
                    >
                      <FolderOpen size={13} />
                    </button>
                  )}
                  {activeItem && onAddAttachments && (
                    <button
                      type="button"
                      className="attachment-add-button"
                      disabled={isAddingAttachment}
                      onClick={async () => {
                        setIsAddingAttachment(true);
                        setAttachmentError(null);
                        try {
                          await onAddAttachments(activeItem.id);
                        } catch (error) {
                          setAttachmentError(error instanceof Error ? error.message : 'Failed to add files.');
                        } finally {
                          setIsAddingAttachment(false);
                        }
                      }}
                    >
                      {isAddingAttachment ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      File
                    </button>
                  )}
                </div>
              </div>
              {attachments.length === 0 && (
                <div className="attachments-empty">No files are attached to this block yet.</div>
              )}
              {attachments.map(attachment => (
                <div key={attachment.id} className="attachment-row">
                  <span className="attachment-file-icon"><FileText size={13} /></span>
                  <button
                    type="button"
                    className="attachment-name"
                    onClick={() => void onOpenAttachment?.(attachment).catch(error => setAttachmentError(error instanceof Error ? error.message : 'Could not open the attachment.'))}
                    title={attachment.localPath || attachment.fileName}
                  >
                    {attachment.fileName}
                  </button>
                  <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
                  {onRemoveAttachment && (
                    <button
                      type="button"
                      className="attachment-remove-button"
                      title="Remove attachment"
                      onClick={async () => {
                        if (!window.confirm(`Remove attachment “${attachment.fileName}”?`)) return;
                        setAttachmentError(null);
                        try {
                          await onRemoveAttachment(attachment);
                        } catch (error) {
                          setAttachmentError(error instanceof Error ? error.message : 'Could not remove the attachment.');
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {attachmentError && <p role="alert" className="attachment-error">{attachmentError}</p>}
            </section>
          )}

          {isBlock && (
            <section className="references-panel" style={{ marginTop: '8px' }}>
              <div className="references-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={13} color={dependencyStatus?.isBlocked ? '#F59E0B' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Dependencies</span>
                  {dependencyStatus?.isBlocked && (
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#F59E0B',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      fontWeight: 500
                    }}>
                      Blocked
                    </span>
                  )}
                </div>

                {candidateDependencyBlocks.length > 0 && (
                  <select
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      maxWidth: '160px'
                    }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddDependency(e.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>+ Add dependency...</option>
                    {candidateDependencyBlocks.map((c: Block) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Prerequisite dependencies list */}
              {dependsOn.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {dependsOn.map(depId => {
                    const depBlock = allProjectBlocks.find(b => b.id === depId);
                    const isDone = depBlock ? isBlockCompleted(depBlock) : false;

                    return (
                      <div
                        key={depId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isDone ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          border: isDone ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(245, 158, 11, 0.25)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '0.75rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          {isDone ? (
                            <CheckCircle2 size={13} color="#4ADE80" />
                          ) : (
                            <Clock size={13} color="#F59E0B" />
                          )}
                          {depBlock ? (
                            <button
                              type="button"
                              onClick={() => onOpenReferencedBlock?.(depBlock.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: isDone ? '#4ADE80' : 'var(--text-primary)',
                                cursor: 'pointer',
                                padding: 0,
                                fontWeight: 500,
                                textAlign: 'left',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={`Open ${depBlock.title}`}
                            >
                              {depBlock.title}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Deleted block ({depId})
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveDependency(depId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 2,
                            borderRadius: 4
                          }}
                          title="Remove dependency"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="references-empty" style={{ margin: '4px 0 0 0' }}>
                  No dependencies linked. This task can be executed immediately.
                </p>
              )}

              {/* Dependent blocks waiting on this block */}
              {dependencyStatus && dependencyStatus.blocking.length > 0 && (
                <div className="references-group" style={{ marginTop: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Blocks {dependencyStatus.blocking.length} other task(s)</span>
                  <div>
                    {dependencyStatus.blocking.map((block: Block) => (
                      <button key={block.id} onClick={() => onOpenReferencedBlock?.(block.id)} title={`Open ${block.title}`}>
                        {block.title}<ArrowUpRight size={11} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {isBlock && (
            <section className="references-panel">
              <div className="references-header"><Link2 size={13} /> References</div>
              <p className="references-help">Type <code>[[Block name]]</code> in the text to link a block.</p>
              {references.outgoing.length > 0 && (
                <div className="references-group">
                  <span>References</span>
                  <div>{references.outgoing.map(block => (
                    <button key={block.id} onClick={() => onOpenReferencedBlock?.(block.id)} title={`Open ${block.title}`}>
                      {block.title}<ArrowUpRight size={11} />
                    </button>
                  ))}</div>
                </div>
              )}
              {references.backlinks.length > 0 && (
                <div className="references-group">
                  <span>Referenced by</span>
                  <div>{references.backlinks.map(block => (
                    <button key={block.id} onClick={() => onOpenReferencedBlock?.(block.id)} title={`Open ${block.title}`}>
                      {block.title}<ArrowUpRight size={11} />
                    </button>
                  ))}</div>
                </div>
              )}
              {references.outgoing.length === 0 && references.backlinks.length === 0 && (
                <p className="references-empty">No links for this block yet.</p>
              )}
            </section>
          )}

          {!isBlock && (
            <section className="references-panel" style={{ marginTop: '8px', marginBottom: '8px' }}>
              <div className="references-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bot size={14} color="#38bdf8" />
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>Agent Context & Scratchpad</span>
                  {activeItem && 'scratchpadUpdatedAt' in activeItem && typeof activeItem.scratchpadUpdatedAt === 'number' && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      (updated: {new Date(activeItem.scratchpadUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCopyScratchpad}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: scratchpadCopied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: scratchpadCopied ? '#4ade80' : 'var(--text-secondary)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    cursor: 'pointer'
                  }}
                  title="Copy context for use in a prompt"
                >
                  {scratchpadCopied ? <Check size={11} /> : <ClipboardCopy size={11} />}
                  {scratchpadCopied ? 'Copied!' : 'Copy Context'}
                </button>
              </div>

              <p style={{ margin: '0 0 6px 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Central working memory for AI agents. Agents read this directly through <code>get_project_context</code> and record interim conclusions and decisions here.
              </p>

              <textarea
                value={scratchpad}
                onChange={handleScratchpadChange}
                onBlur={flushSave}
                placeholder="# Project Context & Architecture Decisions&#10;&#10;- Important decisions...&#10;- Current roadmap..."
                style={{
                  width: '100%',
                  minHeight: '110px',
                  maxHeight: '260px',
                  resize: 'vertical',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  lineHeight: '1.45',
                  boxSizing: 'border-box'
                }}
              />
            </section>
          )}

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TipTapEditor
              ref={tipTapEditorRef}
              key={activeItem?.id}
              content={htmlContent}
              onChange={handleEditorChange}
              onBlur={flushSave}
              onUploadImage={onUploadImage}
              onReturnFocusToCards={onReturnFocusToCards}
            />
          </div>

          <div className="editor-footer">
            <span>{wordCount} words | {charCount} characters</span>
            {saveStatus.lastSavedAt && (
              <span>Last modified: {new Date(saveStatus.lastSavedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
