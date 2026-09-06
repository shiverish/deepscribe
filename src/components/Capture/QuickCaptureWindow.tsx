import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Inbox } from 'lucide-react';
import { db } from '../../db/db';
import type { TaskAgentTarget } from '../../types';
import { TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import './QuickCapture.css';

const LAST_PROJECT_KEY = 'deepscribe:quick-capture:last-project';
const LAST_AGENT_KEY = 'deepscribe:quick-capture:last-agent';

/**
 * The capture surface: one text field and configurable project and agent dropdowns.
 * It does not write to the database itself — the text goes to the main window,
 * which owns the workspace and persists it — so this window can close the
 * moment you press save and hand focus straight back to where you were.
 */
export const QuickCaptureWindow: React.FC = () => {
  const [text, setText] = useState('');
  const [projectHintId, setProjectHintId] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY) || TASK_INBOX_PROJECT_ID;
    } catch {
      return TASK_INBOX_PROJECT_ID;
    }
  });
  const [agentTarget, setAgentTarget] = useState<TaskAgentTarget>(() => {
    try {
      return (localStorage.getItem(LAST_AGENT_KEY) as TaskAgentTarget) || 'none';
    } catch {
      return 'none';
    }
  });
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
      try {
        localStorage.setItem(LAST_PROJECT_KEY, projectHintId);
        localStorage.setItem(LAST_AGENT_KEY, agentTarget);
      } catch {
        // Ignore localStorage errors
      }

      const hint = sortedProjects.find(project => project.id === projectHintId);
      await window.electronAPI?.quickCapture?.save({
        text,
        projectHintName: hint?.title,
        agentTarget
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
        <div className="quick-capture-dropdowns">
          <label className="quick-capture-hint">
            <span>Project</span>
            <select
              className="quick-capture-select quick-capture-select-project"
              value={projectHintId}
              onChange={event => setProjectHintId(event.target.value)}
            >
              <option value={TASK_INBOX_PROJECT_ID}>None</option>
              {sortedProjects.map(project => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>
          </label>

          <label className="quick-capture-hint">
            <span>Agent</span>
            <select
              className="quick-capture-select quick-capture-select-agent"
              value={agentTarget}
              onChange={event => setAgentTarget(event.target.value as TaskAgentTarget)}
            >
              <option value="none">None</option>
              <option value="openai">Codex</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="any">Any</option>
            </select>
          </label>
        </div>

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
