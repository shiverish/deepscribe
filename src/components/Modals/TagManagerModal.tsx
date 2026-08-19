import React, { useEffect, useState } from 'react';
import { Tags, X, Trash2 } from 'lucide-react';
import { parseTag } from '../../utils/tagUtils';

interface TagManagerModalProps {
  isOpen: boolean;
  tags: Array<{ tag: string; count: number }>;
  onClose: () => void;
  onRename: (from: string, to: string) => Promise<number>;
  onDelete: (tag: string) => Promise<number>;
}

export const TagManagerModal: React.FC<TagManagerModalProps> = ({ isOpen, tags, onClose, onRename, onDelete }) => {
  const [selected, setSelected] = useState('');
  const [replacement, setReplacement] = useState('');
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(current => tags.some(item => item.tag === current) ? current : (tags[0]?.tag ?? ''));
    setReplacement('');
    setStatus('');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, tags, onClose]);

  if (!isOpen) return null;

  const handleRename = async () => {
    const parsed = parseTag(replacement);
    if (!parsed.tag) {
      setStatus(parsed.error ?? 'Ongeldige tag.');
      return;
    }
    if (parsed.tag === selected) {
    setStatus('Choose a different name.');
      return;
    }
    setIsWorking(true);
    try {
      const changed = await onRename(selected, parsed.tag);
      setStatus(`${changed} block${changed === 1 ? '' : 's'} updated.`);
      setSelected(parsed.tag);
      setReplacement('');
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !window.confirm(`Remove tag #${selected} from the entire project?`)) return;
    setIsWorking(true);
    try {
      const changed = await onDelete(selected);
      setStatus(`Tag removed from ${changed} block${changed === 1 ? '' : 's'}.`);
      setSelected('');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div onClick={onClose} role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7, 10, 18, 0.82)', backdropFilter: 'blur(10px)' }}>
      <div onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tag-manager-title" style={{ width: 480, maxWidth: '90vw', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 id="tag-manager-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Tags size={18} /> Tags beheren</h3>
        <button type="button" className="icon-btn-subtle" onClick={onClose} aria-label="Close tag manager"><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
        {tags.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>This project has no tags yet.</p> : (
            <>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.8rem' }}>
                Bestaande tag
                <select value={selected} onChange={event => setSelected(event.target.value)} disabled={isWorking} style={{ padding: '8px 10px', color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                  {tags.map(item => <option key={item.tag} value={item.tag}>{item.tag} ({item.count})</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: '0.8rem' }}>
              New name (an existing name merges tags)
              <input value={replacement} onChange={event => setReplacement(event.target.value)} placeholder="new-tag" disabled={isWorking} style={{ padding: '8px 10px', color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6 }} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={handleRename} disabled={isWorking || !selected || !replacement.trim()}>Hernoemen / samenvoegen</button>
            <button type="button" onClick={handleDelete} disabled={isWorking || !selected} style={{ color: '#FCA5A5' }}><Trash2 size={14} /> Delete</button>
              </div>
            </>
          )}
          {status && <p role="status" style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{status}</p>}
        </div>
      </div>
    </div>
  );
};
