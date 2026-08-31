import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Inbox } from 'lucide-react';
import { db } from '../../db/db';
import { TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import './QuickCapture.css';

/**
 * The capture surface: one text field and nothing that has to be filled in.
 * It does not write to the database itself — the text goes to the main window,
 * which owns the workspace and persists it — so this window can close the
 * moment you press save and hand focus straight back to where you were.
 */
export const QuickCaptureWindow: React.FC = () => {
  const [text, setText] = useState('');
  const [projectHintId, setProjectHintId] = useState<string>(TASK_INBOX_PROJECT_ID);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const projects = useLiveQuery(
    () => db.projects.filter(project => !project.isTrash && project.systemKind !== 'task-inbox').toArray(),
    [],
    []
  );

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
      await window.electronAPI?.quickCapture?.save({
        text,
        projectHintName: hint?.title
      });
    } catch {
      // Keep the window open with the text intact rather than losing it.
      setIsSaving(false);
      setError('Could not save this capture. DeepScribe may still be starting up.');
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

  return (
    <div className="quick-capture" onKeyDown={handleKeyDown}>
      <div className="quick-capture-header">
        <Inbox size={13} />
        <span>Quick Capture</span>
        <span className="quick-capture-target">Workspace Inbox</span>
      </div>

      <textarea
        ref={inputRef}
        className="quick-capture-input"
        value={text}
        onChange={event => setText(event.target.value)}
        placeholder="What's on your mind?"
        spellCheck={false}
      />

      {error && <div className="quick-capture-error">{error}</div>}

      <div className="quick-capture-footer">
        <label className="quick-capture-hint">
          <span>Project hint</span>
          <select value={projectHintId} onChange={event => setProjectHintId(event.target.value)}>
            <option value={TASK_INBOX_PROJECT_ID}>None</option>
            {sortedProjects.map(project => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </label>

        <div className="quick-capture-actions">
          <span className="quick-capture-keys"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
          <button type="button" className="quick-capture-cancel" onClick={close}>Cancel</button>
          <button type="button" className="quick-capture-save" onClick={() => void save()} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
};
