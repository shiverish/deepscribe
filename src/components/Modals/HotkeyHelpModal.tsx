import React, { useEffect } from 'react';
import { Command, Monitor, X } from 'lucide-react';
import { getKeyboardShortcutGroups } from '../../utils/keyboardShortcuts';
import './HotkeyHelpModal.css';

interface HotkeyHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalToggleShortcut?: string;
}

export const HotkeyHelpModal: React.FC<HotkeyHelpModalProps> = ({ isOpen, onClose, globalToggleShortcut }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcutGroups = getKeyboardShortcutGroups(globalToggleShortcut);

  return (
    <div className="shortcut-help-backdrop" onClick={onClose}>
      <section
        aria-labelledby="shortcut-help-title"
        aria-modal="true"
        className="shortcut-help-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
      >
        <header className="shortcut-help-header">
          <div>
            <div className="shortcut-help-title-row">
              <Command aria-hidden="true" className="shortcut-help-title-icon" size={20} />
              <h2 id="shortcut-help-title">Keyboard Shortcuts</h2>
            </div>
            <p>Bindings are grouped by workflow, so they stay useful on a smaller window too.</p>
          </div>
          <button aria-label="Close keyboard shortcuts" className="icon-button" onClick={onClose} title="Close (Esc)" type="button">
            <X size={18} />
          </button>
        </header>

        <div className="shortcut-help-body">
          {shortcutGroups.map(group => (
            <section className="shortcut-group" key={group.id}>
              <div className="shortcut-group-header">
                <div>
                  <h3>{group.label}</h3>
                  <p>{group.description}</p>
                </div>
                {group.id === 'desktop' && (
                  <span className="shortcut-scope"><Monitor aria-hidden="true" size={13} /> Works across Windows</span>
                )}
              </div>

              <div className="shortcut-list">
                {group.shortcuts.map(shortcut => (
                  <div className="shortcut-row" key={shortcut.id}>
                    <span>{shortcut.description}</span>
                    <kbd>{shortcut.key}</kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="shortcut-help-footer">
          <span>Tip: all actions are also available with the mouse and context menu.</span>
          <span>Press <kbd>Escape</kbd> to close</span>
        </footer>
      </section>
    </div>
  );
};
