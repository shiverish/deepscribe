import React, { useEffect } from 'react';
import { X, Command } from 'lucide-react';

interface HotkeyHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeyHelpModal: React.FC<HotkeyHelpModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { key: '↑ / ↓', desc: 'Navigate vertically through cards in the active column' },
    { key: 'Enter', desc: 'Edit title (press Enter again to move to text content)' },
    { key: 'Escape', desc: 'Stop editing and return to card navigation' },
    { key: 'Shift + →', desc: 'Add a new child block to the selected block' },
    { key: 'Shift + ↓ / Shift + N', desc: 'Add a new text block at the active level' },
    { key: 'Delete / Backspace', desc: 'Move the selected block to trash' },
    { key: '→', desc: 'Open the next level / child blocks' },
    { key: '←', desc: 'Navigate back to the parent column' },
    { key: 'Ctrl + K', desc: 'Open global search (title, content, and tags)' },
    { key: 'Ctrl + D', desc: 'Duplicate selected block and descendant branch' },
    { key: 'Ctrl + 1 / 2 / 3 / 4', desc: 'Switch view (Columns / Tasks / Graph / Stats)' },
    { key: 'Ctrl + Shift + E', desc: 'Expand or collapse the fixed writing panel' },
    { key: 'Shift + ?', desc: 'Open this keyboard shortcut overview' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.8)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '500px',
          maxWidth: '90vw',
          background: 'var(--bg-surface)',
          backdropFilter: 'var(--glass-backdrop)',
          border: '1px solid var(--neon-cyan)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 0 30px rgba(0, 240, 255, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 600 }}>
            <Command size={18} color="#00F0FF" />
            <span>Keyboard Shortcuts</span>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shortcuts.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>{item.desc}</span>
              <kbd>{item.key}</kbd>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <span>Tip: All actions are also available with the mouse and context menu.</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>DeepScribe v0.1.7</span>
        </div>
      </div>
    </div>
  );
};
