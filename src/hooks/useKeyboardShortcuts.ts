import { useEffect } from 'react';
import type { ActiveView } from '../types';
import { VIEW_DEFINITIONS } from '../utils/views';

interface KeyboardShortcutsHandlers {
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onNavigateRight: () => void;
  onNavigateLeft: () => void;
  onEditFocus?: () => void;
  onOpenSearch: () => void;
  onFindInDocument?: () => void;
  onNewBlock: () => void;
  onAddChildBlock?: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onToggleWritingPanel: () => void;
  onOpenHelp: () => void;
  onOpenSettings?: () => void;
  onSwitchView?: (view: ActiveView) => void;
}

export function useKeyboardShortcuts({
  onNavigateUp,
  onNavigateDown,
  onNavigateRight,
  onNavigateLeft,
  onEditFocus,
  onOpenSearch,
  onFindInDocument,
  onNewBlock,
  onAddChildBlock,
  onDuplicate,
  onTrash,
  onToggleWritingPanel,
  onOpenHelp,
  onOpenSettings,
  onSwitchView
}: KeyboardShortcutsHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing inside an input, textarea or contenteditable element (TipTap editor)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Global search shortcuts: Ctrl+K or Ctrl+Shift+F
      if ((isCtrlOrCmd && e.key.toLowerCase() === 'k') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        onOpenSearch();
        return;
      }

      // In-document find shortcut: Ctrl+F (when not already typing inside an input/editor)
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'f') {
        if (!isInput && onFindInDocument) {
          e.preventDefault();
          onFindInDocument();
          return;
        }
      }

      if (isCtrlOrCmd && e.key === ',') {
        e.preventDefault();
        if (onOpenSettings) onOpenSettings();
        return;
      }

      if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onToggleWritingPanel();
        return;
      }

      // Ctrl + 1..n follow the switcher, so a new view brings its shortcut along.
      if (isCtrlOrCmd) {
        const slot = Number.parseInt(e.key, 10);
        const view = Number.isNaN(slot) ? undefined : VIEW_DEFINITIONS[slot - 1];
        if (view) {
          e.preventDefault();
          if (onSwitchView) onSwitchView(view.id);
          return;
        }
      }

      if (e.shiftKey && e.key === '?') {
        if (!isInput) {
          e.preventDefault();
          onOpenHelp();
          return;
        }
      }

      if (isInput) return; // Prevent navigation hotkeys while typing in editor or search input

      // Miller Navigation & Block Action Hotkeys
      if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (onAddChildBlock) onAddChildBlock();
      } else if (e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        onNewBlock();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onNavigateUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNavigateDown();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigateRight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (onEditFocus) onEditFocus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigateLeft();
      } else if ((e.shiftKey && e.key.toLowerCase() === 'n') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'n')) {
        e.preventDefault();
        onNewBlock();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace' || (isCtrlOrCmd && (e.key === 'Delete' || e.key === 'Backspace'))) {
        e.preventDefault();
        onTrash();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onNavigateUp,
    onNavigateDown,
    onNavigateRight,
    onNavigateLeft,
    onEditFocus,
    onOpenSearch,
    onFindInDocument,
    onNewBlock,
    onAddChildBlock,
    onDuplicate,
    onTrash,
    onToggleWritingPanel,
    onOpenHelp,
    onOpenSettings,
    onSwitchView
  ]);
}
