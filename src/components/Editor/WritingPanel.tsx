import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Project, Block, SaveStatus, PathSegment } from '../../types';
import { TipTapEditor } from './TipTapEditor';
import { Check, Loader2, AlertCircle, FileText, Folder, PanelRightClose, Edit3 } from 'lucide-react';
import './Editor.css';

interface WritingPanelProps {
  isOpen: boolean;
  activeItem: Project | Block | null;
  itemType: 'project' | 'block' | null;
  pathSegments: PathSegment[];
  saveStatus: SaveStatus;
  onSaveItem: (
    itemId: string,
    itemType: 'project' | 'block',
    title: string,
    content: string,
    plainText: string,
    taskCount: number,
    completedTaskCount: number
  ) => Promise<void>;
  onUploadImage?: (file: File) => Promise<string>;
  onClose: () => void;
}

export const WritingPanel: React.FC<WritingPanelProps> = ({
  isOpen,
  activeItem,
  itemType,
  saveStatus,
  onSaveItem,
  onUploadImage,
  onClose
}) => {
  const [title, setTitle] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [plainTextContent, setPlainTextContent] = useState('');
  const [taskCount, setTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [isDirty, setIsDirty] = useState(false);

  const activeItemIdRef = useRef<string | null>(null);
  const draftRef = useRef({
    title: '',
    htmlContent: '',
    plainTextContent: '',
    taskCount: 0,
    completedTaskCount: 0,
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
      isDirty,
      itemType
    };
  }, [title, htmlContent, plainTextContent, taskCount, completedTaskCount, isDirty, itemType]);

  const flushSave = useCallback(async () => {
    const currentId = activeItemIdRef.current;
    const { title, htmlContent, plainTextContent, taskCount, completedTaskCount, isDirty, itemType } = draftRef.current;

    if (currentId && itemType && isDirty) {
      setIsDirty(false);
      draftRef.current.isDirty = false;
      await onSaveItem(currentId, itemType, title, htmlContent, plainTextContent, taskCount, completedTaskCount);
    }
  }, [onSaveItem]);

  useEffect(() => {
    const previousId = activeItemIdRef.current;
    if (previousId && previousId !== activeItem?.id) {
      flushSave();
    }

    activeItemIdRef.current = activeItem?.id || null;

    if (activeItem) {
      setTitle(activeItem.title || '');
      if (itemType === 'block') {
        const b = activeItem as Block;
        setHtmlContent(b.content || '');
        setPlainTextContent(b.plainText || '');
        setTaskCount(b.taskCount || 0);
        setCompletedTaskCount(b.completedTaskCount || 0);
      } else {
        const p = activeItem as Project;
        setHtmlContent(p.description || '');
        setPlainTextContent(p.description || '');
        setTaskCount(0);
        setCompletedTaskCount(0);
      }
      setIsDirty(false);
      draftRef.current.isDirty = false;
    }
  }, [activeItem, itemType, flushSave]);

  // Save shortly after typing stops; blur and the periodic timer remain fallbacks.
  useEffect(() => {
    if (!isDirty) return;
    const timeout = window.setTimeout(() => void flushSave(), 750);
    return () => window.clearTimeout(timeout);
  }, [isDirty, title, htmlContent, plainTextContent, taskCount, completedTaskCount, flushSave]);

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
          draftRef.current.completedTaskCount
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
    setHtmlContent(html);
    setPlainTextContent(plainText);
    setTaskCount(tasks);
    setCompletedTaskCount(completedTasks);
    setIsDirty(true);
  };

  const isBlock = itemType === 'block';

  const wordCount = plainTextContent.trim() ? plainTextContent.trim().split(/\s+/).length : 0;
  const charCount = plainTextContent.length;

  if (!isOpen) return null;

  return (
    <div className={`writing-panel ${!isOpen ? 'collapsed' : ''}`}>
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {itemType === 'project' ? <Folder size={18} color="#EBDEC3" /> : <FileText size={18} color="#D6CFC4" />}
          <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {itemType === 'project' ? 'Project Details' : 'Blok Inspector'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={`save-status-badge ${saveStatus.state}`}>
            {isDirty ? (
              <>
                <Edit3 size={12} color="#D6CFC4" />
                <span>Concept</span>
              </>
            ) : saveStatus.state === 'saved' ? (
              <>
                <Check size={12} color="#EBDEC3" />
                <span>Opgeslagen</span>
              </>
            ) : saveStatus.state === 'saving' ? (
              <>
                <Loader2 size={12} className="animate-spin" color="#D6CFC4" />
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
            className="editor-title-input"
            type="text"
            value={title}
            onChange={handleTitleChange}
            onBlur={flushSave}
            placeholder={itemType === 'project' ? 'Projecttitel...' : 'Bloktitel...'}
          />

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {isBlock ? (
              <TipTapEditor
                content={htmlContent}
                onChange={handleEditorChange}
                onBlur={flushSave}
                onUploadImage={onUploadImage}
              />
            ) : (
              <div style={{ padding: 20 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Project Omschrijving:
                </label>
                <textarea
                  value={plainTextContent}
                  onChange={(e) => handleEditorChange(e.target.value, e.target.value, 0, 0)}
                  onBlur={flushSave}
                  rows={8}
                  style={{
                    width: '100%',
                    background: 'rgba(18, 16, 14, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    padding: '12px',
                    fontFamily: 'var(--font-main)',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                  placeholder="Voeg een project omschrijving toe..."
                />
              </div>
            )}
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
