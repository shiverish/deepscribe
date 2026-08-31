import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bot, CheckCircle2, Clock3, History, LayoutTemplate, Trash2, X, Search } from 'lucide-react';
import { db } from '../../db/db';
import { recordActivity } from '../../db/activity';
import type { Block, BlockTemplate, Project } from '../../types';
import { ClearSearchButton } from '../Search/ClearSearchButton';

type WorkspaceTab = 'activity' | 'templates';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: Project | null;
  activeBlock: Block | null;
  blocks: Block[];
  onOpenBlock: (blockId: string) => void;
  onApplyTemplate: (template: BlockTemplate) => Promise<void>;
}

const sourceLabels = { user: 'You', agent: 'Agent', system: 'System' } as const;

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen, onClose, activeProject, activeBlock, onOpenBlock, onApplyTemplate
}) => {
  const [tab, setTab] = useState<WorkspaceTab>('activity');
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activitySourceFilter, setActivitySourceFilter] = useState<'all' | 'agent' | 'user' | 'system'>('all');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const activitySearchInputRef = useRef<HTMLInputElement>(null);
  const clearActivitySearch = () => {
    setActivitySearchQuery('');
    activitySearchInputRef.current?.focus();
  };
  const activities = useLiveQuery(
    () => db.activities.orderBy('createdAt').reverse().limit(250).toArray(),
    [],
    []
  );
  const templates = useLiveQuery(() => db.templates.orderBy('createdAt').reverse().toArray(), [], []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const visibleActivities = activeProject
    ? activities.filter(entry => !entry.projectId || entry.projectId === activeProject.id)
    : activities;

  const filteredActivities = useMemo(() => {
    let list = visibleActivities;
    if (activitySourceFilter !== 'all') {
      list = list.filter(a => a.source === activitySourceFilter);
    }
    if (activitySearchQuery.trim()) {
      const q = activitySearchQuery.toLowerCase();
      list = list.filter(a => a.summary.toLowerCase().includes(q) || a.action.toLowerCase().includes(q));
    }
    return list;
  }, [visibleActivities, activitySourceFilter, activitySearchQuery]);

  if (!isOpen) return null;

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!activeBlock) return setError('Open a block you want to save as a template first.');
    if (activeBlock.kind === 'task') return setError('Task blocks use the fixed task template and cannot be saved as user templates.');
    if (!name) return setError('Enter a name for the template.');
    if (name.length > 60) return setError('A template name can contain no more than 60 characters.');
    const template: BlockTemplate = {
      id: `template-${crypto.randomUUID()}`,
      name,
      title: activeBlock.title,
      content: activeBlock.content,
      plainText: activeBlock.plainText,
      tags: activeBlock.tags,
      createdAt: Date.now()
    };
    await db.templates.add(template);
    await recordActivity({ projectId: activeBlock.projectId, blockId: activeBlock.id, action: 'template-created', summary: `Template “${name}” saved from “${activeBlock.title}”` });
    setTemplateName('');
    setError(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container workspace-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div className="workspace-title"><Bot size={19} /><h2>Workspace</h2></div>
          <button className="icon-button" onClick={onClose} title="Close"><X size={18} /></button>
        </div>
        <div className="workspace-tabs">
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><History size={14} /> Activity</button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}><LayoutTemplate size={14} /> Templates</button>
        </div>
        <div className="workspace-body">
          {tab === 'activity' && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 3, borderRadius: 6 }}>
                  <button
                    type="button"
                    style={{
                      background: activitySourceFilter === 'all' ? 'var(--primary, #3b82f6)' : 'transparent',
                      color: activitySourceFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      cursor: 'pointer'
                    }}
                    onClick={() => setActivitySourceFilter('all')}
                  >
                    All ({visibleActivities.length})
                  </button>
                  <button
                    type="button"
                    style={{
                      background: activitySourceFilter === 'agent' ? 'var(--primary, #3b82f6)' : 'transparent',
                      color: activitySourceFilter === 'agent' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3
                    }}
                    onClick={() => setActivitySourceFilter('agent')}
                  >
                    <Bot size={11} /> Agent ({visibleActivities.filter(a => a.source === 'agent').length})
                  </button>
                  <button
                    type="button"
                    style={{
                      background: activitySourceFilter === 'user' ? 'var(--primary, #3b82f6)' : 'transparent',
                      color: activitySourceFilter === 'user' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3
                    }}
                    onClick={() => setActivitySourceFilter('user')}
                  >
                    <Clock3 size={11} /> You ({visibleActivities.filter(a => a.source === 'user').length})
                  </button>
                  <button
                    type="button"
                    style={{
                      background: activitySourceFilter === 'system' ? 'var(--primary, #3b82f6)' : 'transparent',
                      color: activitySourceFilter === 'system' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3
                    }}
                    onClick={() => setActivitySourceFilter('system')}
                  >
                    <CheckCircle2 size={11} /> System ({visibleActivities.filter(a => a.source === 'system').length})
                  </button>
                </div>

                <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
                  <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    ref={activitySearchInputRef}
                    type="text"
                    value={activitySearchQuery}
                    onChange={e => setActivitySearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape' && activitySearchQuery) {
                        e.preventDefault();
                        e.stopPropagation();
                        clearActivitySearch();
                      }
                    }}
                    placeholder="Search activity..."
                    style={{
                      width: '100%',
                      padding: '4px 26px 4px 24px',
                      fontSize: '0.72rem',
                      borderRadius: 4,
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                  <ClearSearchButton
                    visible={activitySearchQuery.length > 0}
                    onClear={clearActivitySearch}
                    size={12}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      display: 'flex',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>

              {filteredActivities.length === 0 ? (
                <p className="workspace-empty">No activity found.</p>
              ) : (
                filteredActivities.map(entry => (
                  <button
                    key={entry.id}
                    className="activity-row"
                    onClick={() => {
                      if (entry.blockId) {
                        onOpenBlock(entry.blockId);
                        onClose();
                      }
                    }}
                    disabled={!entry.blockId}
                    style={{ cursor: entry.blockId ? 'pointer' : 'default' }}
                  >
                    <span className={`activity-source ${entry.source}`}>
                      {entry.source === 'agent' ? <Bot size={12} /> : entry.source === 'system' ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                      {sourceLabels[entry.source]}
                    </span>
                    <span className="activity-summary">{entry.summary}</span>
                    <time>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </button>
                ))
              )}
            </>
          )}

          {tab === 'templates' && (
            <>
              <div className="template-save-row">
                <input value={templateName} maxLength={60} onChange={event => { setTemplateName(event.target.value); setError(null); }} placeholder={activeBlock?.kind === 'task' ? 'Task blocks use the fixed template' : activeBlock ? `Template from “${activeBlock.title}”` : 'Open a block first...'} disabled={!activeBlock || activeBlock.kind === 'task'} />
                <button className="secondary-button" onClick={() => void saveTemplate()} disabled={!activeBlock || activeBlock.kind === 'task'}>Save</button>
              </div>
              {templates.length === 0 ? <p className="workspace-empty">No templates saved yet.</p> : templates.map(template => (
                <div className="workspace-row" key={template.id}>
                  <button className="workspace-row-main" onClick={async () => {
                    try { await onApplyTemplate(template); onClose(); }
                    catch (cause) { setError(cause instanceof Error ? cause.message : 'Failed to apply template.'); }
                  }}>
                    <strong>{template.name}</strong><span>{template.title} · {template.tags.length} tags</span>
                  </button>
                  <button className="workspace-row-delete" onClick={async () => {
                    if (!window.confirm(`Delete template “${template.name}”?`)) return;
                    await db.templates.delete(template.id);
                    await recordActivity({ action: 'template-deleted', summary: `Template “${template.name}” deleted` });
                  }} title="Delete template"><Trash2 size={13} /></button>
                </div>
              ))}
            </>
          )}
          {error && <p className="workspace-error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
};
