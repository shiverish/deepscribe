import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Project, Block, Attachment, SaveStatus, PathSegment } from '../../types';
import { TipTapEditor, type TipTapEditorHandle } from './TipTapEditor';
import { TagBadge } from '../Navigation/TagBadge';
import { TagManagerModal } from '../Modals/TagManagerModal';
import { extractHashtags, mergeTags, parseTag, sanitizeTags } from '../../utils/tagUtils';
import { Check, Loader2, AlertCircle, FileText, Folder, FolderOpen, Paperclip, PanelRightClose, Edit3, Plus, Tag as TagIcon, Settings2, Trash2 } from 'lucide-react';
import './Editor.css';

interface WritingPanelProps {
  isOpen: boolean;
  activeItem: Project | Block | null;
  itemType: 'project' | 'block' | null;
  pathSegments: PathSegment[];
  saveStatus: SaveStatus;
  focusTitleSignal?: number;
  onReturnFocusToCards?: () => void;
  onSaveItem: (
    itemId: string,
    itemType: 'project' | 'block',
    title: string,
    content: string,
    plainText: string,
    taskCount: number,
    completedTaskCount: number,
    tags: string[]
  ) => Promise<void>;
  tagSuggestions?: Array<{ tag: string; count: number }>;
  onRenameProjectTag?: (from: string, to: string) => Promise<number>;
  onDeleteProjectTag?: (tag: string) => Promise<number>;
  attachments?: Attachment[];
  onAddAttachments?: (blockId: string) => Promise<void>;
  onOpenAttachment?: (attachment: Attachment) => Promise<void>;
  onRemoveAttachment?: (attachment: Attachment) => Promise<void>;
  onShowAttachmentsFolder?: (projectId: string) => Promise<void>;
  onUploadImage?: (file: File) => Promise<string>;
  onClose: () => void;
}

export const WritingPanel: React.FC<WritingPanelProps> = ({
  isOpen,
  activeItem,
  itemType,
  saveStatus,
  focusTitleSignal,
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
  onUploadImage,
  onClose
}) => {
  const [title, setTitle] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainTextContent, setPlainTextContent] = useState('');
  const [taskCount, setTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tipTapEditorRef = useRef<TipTapEditorHandle>(null);
  const observedHashtagsRef = useRef<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);

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
      const windowWidth = window.innerWidth;
      const newWidth = windowWidth - e.clientX;
      const maxWidth = Math.floor(windowWidth * 0.8);
      const clampedWidth = Math.min(Math.max(newWidth, MIN_WIDTH), maxWidth);
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setPanelWidth(currentWidth => {
        localStorage.setItem('deepscribe_panel_width', currentWidth.toString());
        return currentWidth;
      });
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
  const draftRef = useRef({
    title: '',
    htmlContent: '',
    plainTextContent: '',
    taskCount: 0,
    completedTaskCount: 0,
    tags: [] as string[],
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
      isDirty,
      itemType
    };
  }, [title, htmlContent, plainTextContent, taskCount, completedTaskCount, tags, isDirty, itemType]);

  const flushSave = useCallback(async () => {
    const currentId = activeItemIdRef.current;
    if (!currentId || !draftRef.current.isDirty || isSavingRef.current) return;

    const { title, htmlContent, plainTextContent, taskCount, completedTaskCount, tags, itemType } = draftRef.current;

    // Reset dirty flag BEFORE async save so any typing during save marks state dirty again
    setIsDirty(false);
    draftRef.current.isDirty = false;
    isSavingRef.current = true;

    try {
      if (itemType) {
        await onSaveItem(currentId, itemType, title, htmlContent, plainTextContent, taskCount, completedTaskCount, tags);
      }
    } finally {
      isSavingRef.current = false;
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
        setTitle(activeItem.title || '');
        if (itemType === 'block') {
          const b = activeItem as Block;
          setHtmlContent(b.content || '');
          setPlainTextContent(b.plainText || '');
          setTaskCount(b.taskCount || 0);
          setCompletedTaskCount(b.completedTaskCount || 0);
          setTags(sanitizeTags(b.tags));
          observedHashtagsRef.current = new Set(extractHashtags(b.content || ''));
        } else {
          const p = activeItem as Project;
          setHtmlContent(p.description || '');
          setPlainTextContent(p.description || '');
          setTaskCount(0);
          setCompletedTaskCount(0);
          setTags(sanitizeTags(p.tags));
          observedHashtagsRef.current = new Set();
        }
        setIsDirty(false);
        draftRef.current.isDirty = false;
        loadedUpdatedAtRef.current = activeItem.updatedAt;
        setAttachmentError(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.id, activeItem?.updatedAt, itemType, flushSave]);

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

  const handleAddTag = (tagText: string) => {
    const parsed = parseTag(tagText);
    if (!parsed.tag) {
      setTagError(parsed.error);
      return;
    }
    const norm = parsed.tag;
    if (!tags.includes(norm)) {
      const updated = [...tags, norm];
      setTags(updated);
      setIsDirty(true);
    }
    setTagError(null);
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter(t => t !== tagToRemove);
    setTags(updated);
    setIsDirty(true);
    setTagError(null);
  };

  // Save shortly after typing stops; blur and the periodic timer remain fallbacks.
  useEffect(() => {
    if (!isDirty) return;
    const timeout = window.setTimeout(() => void flushSave(), 750);
    return () => window.clearTimeout(timeout);
  }, [isDirty, title, htmlContent, plainTextContent, taskCount, completedTaskCount, tags, flushSave]);

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
          draftRef.current.tags
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [onSaveItem]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setIsDirty(true);
  };

  const handleEditorChange = (html: string, plainText: string, tasks: number, completedTasks: number) => {
    const currentHashtags = new Set(extractHashtags(html));
    const additions = Array.from(currentHashtags).filter(tag => !observedHashtagsRef.current.has(tag));
    observedHashtagsRef.current = currentHashtags;
    if (additions.length > 0) setTags(current => mergeTags(current, additions));
    setHtmlContent(html);
    setPlainTextContent(plainText);
    setTaskCount(tasks);
    setCompletedTaskCount(completedTasks);
    setIsDirty(true);
  };

  const isBlock = itemType === 'block';
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
        title="Sleep om de breedte aan te passen (dubbelklik voor 480px)"
      />
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {itemType === 'project' ? <Folder size={18} color="var(--atmosphere-color)" /> : <FileText size={18} color="var(--atmosphere-secondary)" />}
          <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {itemType === 'project' ? 'Project Details' : 'Blok Inspector'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={`save-status-badge ${saveStatus.state}`}>
            {isDirty ? (
              <>
                <Edit3 size={12} color="var(--atmosphere-secondary)" />
                <span>Concept</span>
              </>
            ) : saveStatus.state === 'saved' ? (
              <>
                <Check size={12} color="var(--atmosphere-color)" />
                <span>Opgeslagen</span>
              </>
            ) : saveStatus.state === 'saving' ? (
              <>
                <Loader2 size={12} className="animate-spin" color="var(--atmosphere-secondary)" />
                <span>Opslaan...</span>
              </>
            ) : (
              <>
                <AlertCircle size={12} color="#EF4444" />
                <span>Fout bij opslaan</span>
              </>
            )}
          </div>

          <button
            className="icon-btn-subtle"
            onClick={() => {
              flushSave();
              onClose();
            }}
            title="Schrijfpaneel inklappen"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {!activeItem ? (
        <div style={{ flex: 1, padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Selecteer een project of tekstblok uit de kolommen om te beginnen met schrijven.
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
            placeholder={itemType === 'project' ? 'Projecttitel...' : 'Bloktitel...'}
          />

          {itemType && (
            <div style={{ padding: '0 24px 10px 24px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <TagIcon size={13} color="var(--text-muted)" style={{ opacity: 0.7 }} />
              {tags.map(tag => (
                <TagBadge key={tag} tag={tag} onRemove={handleRemoveTag} size="sm" />
              ))}
              {isAddingTag ? (
                <input
                  type="text"
                  autoFocus
                  value={newTagInput}
                  onChange={e => {
                    setNewTagInput(e.target.value);
                    setTagError(null);
                  }}
                  list="project-tag-suggestions"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag(newTagInput);
                    } else if (e.key === 'Escape') {
                      setIsAddingTag(false);
                      setNewTagInput('');
                    }
                  }}
                  onBlur={() => {
                    if (newTagInput.trim()) handleAddTag(newTagInput);
                    else setIsAddingTag(false);
                  }}
                  placeholder="nieuwe tag..."
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    padding: '1px 8px',
                    outline: 'none',
                    width: '90px',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                  title="Tag toevoegen"
                >
                  <Plus size={11} /> Tag
                </button>
              )}
              <datalist id="project-tag-suggestions">
                {tagSuggestions.filter(suggestion => !tags.includes(suggestion.tag)).map(suggestion => (
                  <option key={suggestion.tag} value={suggestion.tag}>
                    {suggestion.count} {itemType === 'project' ? 'projecten' : 'blokken'}
                  </option>
                ))}
              </datalist>
              {isBlock && onRenameProjectTag && onDeleteProjectTag && tagSuggestions.length > 0 && (
                <button type="button" onClick={() => setIsTagManagerOpen(true)} className="icon-btn-subtle" title="Projecttags beheren" aria-label="Projecttags beheren">
                  <Settings2 size={12} />
                </button>
              )}
              {tagError && (
                <span role="alert" style={{ width: '100%', color: '#FCA5A5', fontSize: '0.7rem' }}>
                  {tagError}
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
          {isBlock && (
            <section className="attachments-panel">
              <div className="attachments-header">
                <span className="attachments-title">
                  <Paperclip size={13} />
                  Bijlagen
                  {attachments.length > 0 && <span className="attachments-count">{attachments.length}</span>}
                </span>
                <div className="attachments-actions">
                  {blockProjectId && onShowAttachmentsFolder && (
                    <button
                      type="button"
                      className="attachment-icon-button"
                      title="Projectmap openen"
                      onClick={() => void onShowAttachmentsFolder(blockProjectId).catch(error => setAttachmentError(error instanceof Error ? error.message : 'De projectmap kon niet worden geopend.'))}
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
                          setAttachmentError(error instanceof Error ? error.message : 'Bestanden toevoegen is mislukt.');
                        } finally {
                          setIsAddingAttachment(false);
                        }
                      }}
                    >
                      {isAddingAttachment ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Bestand
                    </button>
                  )}
                </div>
              </div>
              {attachments.length === 0 && (
                <div className="attachments-empty">Nog geen bestanden aan dit blok gekoppeld.</div>
              )}
              {attachments.map(attachment => (
                <div key={attachment.id} className="attachment-row">
                  <span className="attachment-file-icon"><FileText size={13} /></span>
                  <button
                    type="button"
                    className="attachment-name"
                    onClick={() => void onOpenAttachment?.(attachment).catch(error => setAttachmentError(error instanceof Error ? error.message : 'De bijlage kon niet worden geopend.'))}
                    title={attachment.localPath || attachment.fileName}
                  >
                    {attachment.fileName}
                  </button>
                  <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
                  {onRemoveAttachment && (
                    <button
                      type="button"
                      className="attachment-remove-button"
                      title="Bijlage verwijderen"
                      onClick={async () => {
                        if (!window.confirm(`Bijlage “${attachment.fileName}” verwijderen?`)) return;
                        setAttachmentError(null);
                        try {
                          await onRemoveAttachment(attachment);
                        } catch (error) {
                          setAttachmentError(error instanceof Error ? error.message : 'De bijlage kon niet worden verwijderd.');
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
            <span>{wordCount} woorden | {charCount} tekens</span>
            {saveStatus.lastSavedAt && (
              <span>Laatst gewijzigd: {new Date(saveStatus.lastSavedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
