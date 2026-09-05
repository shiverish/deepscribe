import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Inbox, Loader2, Plus, Trash2, Zap } from 'lucide-react';
import type { Block, Project } from '../../types';
import { extractProjectHint } from '../../utils/quickCapture';
import { getProjectColor, DEFAULT_PROJECT_COLOR } from '../../utils/projectColors';

export interface CapturesSectionProps {
  captures: Block[];
  projects: Project[];
  allBlocks?: Block[];
  onOpenCapture: (blockId: string) => void;
  onConvertCapture: (capture: Block) => Promise<void>;
  onDeleteCapture: (capture: Block) => Promise<void>;
  className?: string;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const CapturesSection: React.FC<CapturesSectionProps> = ({
  captures,
  projects,
  onOpenCapture,
  onConvertCapture,
  onDeleteCapture,
  className
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('deepscribe:tasks:captures-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [convertingId, setConvertingId] = useState<string | null>(null);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('deepscribe:tasks:captures-collapsed', String(next));
      } catch {
        // Ignore localStorage error
      }
      return next;
    });
  };

  const handleTriggerQuickCapture = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.quickCapture?.open) {
      window.electronAPI.quickCapture.open();
    }
  };

  const handleConvert = async (e: React.MouseEvent, capture: Block) => {
    e.stopPropagation();
    if (convertingId) return;
    setConvertingId(capture.id);
    try {
      await onConvertCapture(capture);
    } finally {
      setConvertingId(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, capture: Block) => {
    e.stopPropagation();
    void onDeleteCapture(capture);
  };

  return (
    <section className={`captures-section ${isCollapsed ? 'is-collapsed' : ''} ${className ?? ''}`}>
      <header className="captures-header" onClick={toggleCollapsed} role="button" tabIndex={0} aria-expanded={!isCollapsed}>
        <div className="captures-header-left">
          <span className="captures-toggle-icon">
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </span>
          <Zap size={13} className="captures-title-icon" />
          <span className="captures-header-title">Captures</span>
          <span className={`captures-count-badge ${captures.length > 0 ? 'has-items' : ''}`}>
            {captures.length}
          </span>
        </div>

        <div className="captures-header-right">
          <button
            type="button"
            className="captures-add-btn"
            title="Open Quick Capture (Ctrl + Alt + C)"
            aria-label="New capture"
            onClick={handleTriggerQuickCapture}
          >
            <Plus size={12} />
            <span>Capture</span>
          </button>
        </div>
      </header>

      {!isCollapsed && (
        <div className="captures-body">
          {captures.length === 0 ? (
            <div className="captures-empty">
              <Inbox size={16} />
              <span>No pending captures</span>
              <small>Use <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>C</kbd> anywhere</small>
            </div>
          ) : (
            <div className="captures-list">
              {captures.map(capture => {
                const { rawText, hintName } = extractProjectHint(capture.plainText || '');
                const matchedProject = hintName
                  ? projects.find(p => !p.isTrash && p.title.trim().toLowerCase() === hintName.trim().toLowerCase())
                  : undefined;
                const projectColor = matchedProject ? getProjectColor(matchedProject.color) : DEFAULT_PROJECT_COLOR;
                const isConverting = convertingId === capture.id;

                // Derive snippet text: text after title if multiline
                const lines = (rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
                const snippet = lines.length > 1 ? lines.slice(1).join(' ') : lines[0] || '';

                return (
                  <article
                    key={capture.id}
                    className="capture-card"
                    onClick={() => onOpenCapture(capture.id)}
                    title="Click to view and edit in Writing Panel"
                  >
                    <div className="capture-card-top">
                      <div className="capture-time">
                        <Zap size={10} className="capture-card-pip" />
                        <span>{formatRelativeTime(capture.createdAt)}</span>
                      </div>

                      {hintName && (
                        <div className="capture-hint-pill" title={`Project hint: ${hintName}`}>
                          <span className="project-color-pip" style={{ backgroundColor: projectColor }} />
                          <span className="capture-hint-name">{hintName}</span>
                        </div>
                      )}
                    </div>

                    <div className="capture-card-content">
                      <strong className="capture-card-title">{capture.title}</strong>
                      {snippet && snippet !== capture.title && (
                        <p className="capture-card-snippet">{snippet}</p>
                      )}
                    </div>

                    <div className="capture-card-actions">
                      <button
                        type="button"
                        className="capture-action-btn capture-open-btn"
                        title="Open in Writing Panel"
                        aria-label={`Open capture ${capture.title}`}
                        onClick={e => {
                          e.stopPropagation();
                          onOpenCapture(capture.id);
                        }}
                      >
                        <FileText size={11} />
                        <span>Open</span>
                      </button>

                      <div className="capture-actions-group">
                        <button
                          type="button"
                          className="capture-action-btn capture-delete-btn"
                          title="Move capture to Trash"
                          aria-label={`Delete capture ${capture.title}`}
                          onClick={e => handleDelete(e, capture)}
                        >
                          <Trash2 size={12} />
                        </button>

                        <button
                          type="button"
                          className="capture-action-btn capture-convert-btn"
                          title="Convert into Ready task"
                          aria-label={`Convert ${capture.title} to Ready task`}
                          disabled={isConverting}
                          onClick={e => handleConvert(e, capture)}
                        >
                          {isConverting ? (
                            <>
                              <Loader2 size={11} className="spin" />
                              <span>Converting…</span>
                            </>
                          ) : (
                            <>
                              <Zap size={11} />
                              <span>Ready Task</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
