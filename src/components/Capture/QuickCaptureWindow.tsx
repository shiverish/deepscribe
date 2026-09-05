import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Inbox, ChevronDown, CheckCircle2 } from 'lucide-react';
import { db } from '../../db/db';
import { TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import './QuickCapture.css';

const DRAFT_KEY = 'deepscribe-quick-capture-draft';
function readDraft(): { text: string; projectHintId: string; requestId: string } {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    return {
      text: typeof value.text === 'string' ? value.text : '',
      projectHintId: typeof value.projectHintId === 'string' ? value.projectHintId : TASK_INBOX_PROJECT_ID,
      requestId: typeof value.requestId === 'string' ? value.requestId : crypto.randomUUID()
    };
  } catch {
    return { text: '', projectHintId: TASK_INBOX_PROJECT_ID, requestId: crypto.randomUUID() };
  }
}

export const QuickCaptureWindow: React.FC = () => {
  const [draft, setDraft] = useState(readDraft);
  const { text, projectHintId, requestId } = draft;
  const updateDraft = (partial: Partial<typeof draft>) => {
    const next = { ...draft, ...partial, requestId: crypto.randomUUID() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    setDraft(next);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const projects = useLiveQuery(
    () => db.projects.filter(project => !project.isTrash && project.systemKind !== 'task-inbox').toArray(),
    [],
    []
  );

  const userSettings = useLiveQuery(() => db.settings.get('userSettings'));

  const sortedProjects = useMemo(
    () => [...(projects ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    [projects]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const close = () => {
    window.electronAPI?.quickCapture?.close();
  };

  const save = async () => {
    if (isSaving) return;
    if (!text.trim()) {
      close();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const hint = sortedProjects.find(project => project.id === projectHintId);
      if (!window.electronAPI?.quickCapture) throw new Error('Quick Capture requires the desktop app.');
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      await window.electronAPI.quickCapture.save({
        requestId,
        text,
        projectHintName: hint?.title
      });
      localStorage.removeItem(DRAFT_KEY);

      const processor = userSettings?.value?.captureProcessor;
      let msg = 'Saved. Codex will prepare a suggestion.';
      if (processor?.agent === 'none') {
        msg = 'Saved. Capture stored in Inbox.';
      } else if (processor?.agent === 'gemini') {
        msg = 'Saved. Antigravity will prepare a suggestion.';
      } else if (processor?.agent === 'claude') {
        msg = 'Saved. Claude will prepare a suggestion.';
      } else if (processor?.customName) {
        msg = `Saved. ${processor.customName} will prepare a suggestion.`;
      }

      setConfirmationMessage(msg);
      setTimeout(() => close(), 1100);
    } catch (cause) {
      // Keep the window open with the text intact rather than losing it.
      setIsSaving(false);
      setError(cause instanceof Error ? cause.message : 'Could not save this capture. Your draft is kept.');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  };

  if (confirmationMessage) {
    return (
      <div className="quick-capture">
        <div className="quick-capture-confirmation">
          <CheckCircle2 size={28} className="quick-capture-confirmation-icon" />
          <span className="quick-capture-confirmation-text">{confirmationMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="quick-capture" onKeyDown={handleKeyDown}>
      <div className="quick-capture-header">
        <Inbox size={13} />
        <span>Quick Capture</span>
        <span className="quick-capture-target">Inbox</span>
      </div>

      <textarea
        ref={inputRef}
        className="quick-capture-input"
        value={text}
        disabled={isSaving}
        onChange={event => updateDraft({ text: event.target.value })}
        placeholder="What's on your mind?"
        spellCheck={false}
      />

      {error && <div className="quick-capture-error">{error}</div>}

      {showMoreOptions && (
        <div className="quick-capture-more-panel">
          <label className="quick-capture-hint">
            <span>Project hint</span>
            <select value={projectHintId} disabled={isSaving} onChange={event => updateDraft({ projectHintId: event.target.value })}>
              <option value={TASK_INBOX_PROJECT_ID}>None</option>
              {sortedProjects.map(project => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="quick-capture-footer">
        <button
          type="button"
          className="quick-capture-more-btn"
          disabled={isSaving}
          onClick={() => setShowMoreOptions(prev => !prev)}
        >
          <ChevronDown size={13} className={showMoreOptions ? 'open' : ''} />
          <span>More options</span>
        </button>

        <div className="quick-capture-actions">
          <span className="quick-capture-keys"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
          <button type="button" className="quick-capture-cancel" disabled={isSaving} onClick={() => { localStorage.removeItem(DRAFT_KEY); close(); }}>Discard</button>
          <button type="button" className="quick-capture-save" onClick={() => void save()} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
};
