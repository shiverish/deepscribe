import { useEffect } from 'react';

interface KeyboardShortcutsHandlers {
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onNavigateRight: () => void;
  onNavigateLeft: () => void;
  onEditFocus?: () => void;
  onOpenSearch: () => void;
  onNewBlock: () => void;
  onAddChildBlock?: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onToggleWritingPanel: () => void;
  onOpenHelp: () => void;
  onOpenSettings?: () => void;
  onSwitchView?: (view: 'columns' | 'tasks' | 'graph' | 'stats') => void;
}

export function useKeyboardShortcuts({
  onNavigateUp,
  onNavigateDown,
  onNavigateRight,
  onNavigateLeft,
  onEditFocus,
  onOpenSearch,
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

      // Global shortcuts (work anywhere or when not editing text)
      if (isCtrlOrCmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenSearch();
        return;
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

      if (isCtrlOrCmd && e.key === '1') {
        e.preventDefault();
        if (onSwitchView) onSwitchView('columns');
        return;
      }

      if (isCtrlOrCmd && e.key === '2') {
        e.preventDefault();
        if (onSwitchView) onSwitchView('tasks');
        return;
      }

      if (isCtrlOrCmd && e.key === '3') {
        e.preventDefault();
        if (onSwitchView) onSwitchView('graph');
        return;
      }

      if (isCtrlOrCmd && e.key === '4') {
        e.preventDefault();
        if (onSwitchView) onSwitchView('stats');
        return;
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
