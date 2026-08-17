import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import type { Project, Block, Attachment, SaveStatus, PathSegment } from '../../types';
import { TipTapEditor, type TipTapEditorHandle } from './TipTapEditor';
import { TagBadge } from '../Navigation/TagBadge';
import { TagManagerModal } from '../Modals/TagManagerModal';
import { extractHashtags, mergeTags, parseTag, sanitizeTags } from '../../utils/tagUtils';
import { initialTagComposerState, tagComposerReducer } from '../../utils/tagComposer';
import { Check, Loader2, AlertCircle, FileText, Folder, FolderOpen, Paperclip, PanelRightClose, Edit3, Plus, Tag as TagIcon, Settings2, Trash2, Link2, ArrowUpRight, X } from 'lucide-react';
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
  references?: { outgoing: Block[]; backlinks: Block[] };
  onOpenReferencedBlock?: (blockId: string) => void;
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
  references = { outgoing: [], backlinks: [] },
  onOpenReferencedBlock,
  onUploadImage,
  onClose
}) => {
  const [title, setTitle] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainTextContent, setPlainTextContent] = useState('');
  const [taskCount, setTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagComposer, dispatchTagComposer] = useReducer(tagComposerReducer, initialTagComposerState);
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
  const saveRequestedRef = useRef(false);
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

    const { title, htmlContent, plainTextContent, taskCount, completedTaskCount, itemType } = draftRef.current;

    // Reset dirty flag BEFORE async save so any typing during save marks state dirty again
    setIsDirty(false);
    draftRef.current.isDirty = false;
    isSavingRef.current = true;

    try {
      if (itemType) {
        await onSaveItem(currentId, itemType, title, htmlContent, plainTextContent, taskCount, completedTaskCount, finalTags);
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

        if (itemType === 'block') {
          const b = activeItem as Block;
          nextHtmlContent = b.content || '';
          nextPlainTextContent = b.plainText || '';
          nextTaskCount = b.taskCount || 0;
          nextCompletedTaskCount = b.completedTaskCount || 0;
          nextTags = sanitizeTags(b.tags);
          observedHashtagsRef.current = new Set(extractHashtags(b.content || ''));
        } else {
          const p = activeItem as Project;
          nextHtmlContent = p.description || '';
          nextPlainTextContent = p.description || '';
          nextTaskCount = 0;
          nextCompletedTaskCount = 0;
          nextTags = sanitizeTags(p.tags);
          observedHashtagsRef.current = new Set();
        }

        draftRef.current = {
          title: nextTitle,
          htmlContent: nextHtmlContent,
          plainTextContent: nextPlainTextContent,
          taskCount: nextTaskCount,
          completedTaskCount: nextCompletedTaskCount,
          tags: nextTags,
          isDirty: false,
          itemType
        };
        setTitle(nextTitle);
        setHtmlContent(nextHtmlContent);
        setPlainTextContent(nextPlainTextContent);
        setTaskCount(nextTaskCount);
        setCompletedTaskCount(nextCompletedTaskCount);
        setTags(nextTags);
        setIsDirty(false);
        loadedUpdatedAtRef.current = activeItem.updatedAt;
        setAttachmentError(null);
        if (isNewItem) dispatchTagComposer({ type: 'close' });
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
      dispatchTagComposer({ type: 'invalid', error: parsed.error ?? 'Ongeldige tag.' });
      return;
    }
    const norm = parsed.tag;
    if (draftRef.current.tags.includes(norm)) {
      dispatchTagComposer({ type: 'invalid', error: `Tag "${norm}" is al toegevoegd.` });
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
                    aria-label="Nieuwe tag"
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
                    placeholder="nieuwe tag..."
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(tagComposer.value)}
                    aria-label="Tag toevoegen"
                    title="Tag toevoegen"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatchTagComposer({ type: 'close' })}
                    aria-label="Tag invoer sluiten"
                    title="Annuleren"
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

          {isBlock && (
            <section className="references-panel">
              <div className="references-header"><Link2 size={13} /> Verwijzingen</div>
              <p className="references-help">Typ <code>[[Bloknaam]]</code> in de tekst om een blok te verbinden.</p>
              {references.outgoing.length > 0 && (
                <div className="references-group">
                  <span>Verwijst naar</span>
                  <div>{references.outgoing.map(block => (
                    <button key={block.id} onClick={() => onOpenReferencedBlock?.(block.id)} title={`Open ${block.title}`}>
                      {block.title}<ArrowUpRight size={11} />
                    </button>
                  ))}</div>
                </div>
              )}
              {references.backlinks.length > 0 && (
                <div className="references-group">
                  <span>Hiernaar verwezen vanuit</span>
                  <div>{references.backlinks.map(block => (
                    <button key={block.id} onClick={() => onOpenReferencedBlock?.(block.id)} title={`Open ${block.title}`}>
                      {block.title}<ArrowUpRight size={11} />
                    </button>
                  ))}</div>
                </div>
              )}
              {references.outgoing.length === 0 && references.backlinks.length === 0 && (
                <p className="references-empty">Nog geen koppelingen voor dit blok.</p>
              )}
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
